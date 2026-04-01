import json
import asyncio
from uuid import uuid4
from decimal import Decimal
from datetime import datetime
import google.generativeai as genai

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import settings
from app.models.chat import Conversation, Message
from app.models.enums import MessageRole, POLineStatus, EventSource
from app.schemas.auth import CurrentUser
from app.schemas.sales_order import SOCreate
from app.schemas.fulfillment import FulfillmentEventCreate

from app.services.sales_order import list_sales_orders, get_sales_order, create_sales_order as _create_sales_order
from app.services.purchase_order import list_purchase_orders, get_purchase_order, generate_pos_from_so, update_po_line
from app.services.fulfillment import get_fulfillment_overview, record_fulfillment_event as _record_fulfillment_event
from app.services.pdf_parser import parse_pdf_with_gemini
from app.services.client import list_clients, create_client as _create_client
from app.services.sku import create_sku as _create_sku
from app.schemas.client import ClientCreate, ClientContactCreate, ClientAddressCreate
from app.schemas.sku import SKUCreate
from app.models.enums import AddressType, ContactType

# ── Gemini Configuration ───────────────────────────────────────────────────────
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

# ── JSON Encoder for DB responses ──────────────────────────────────────────────
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if hasattr(obj, "value"):  # For Emums
            return obj.value
        # For Pydantic models
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        return super().default(obj)

def to_json_dict(obj):
    return json.loads(json.dumps(obj, cls=CustomJSONEncoder))

# ── Core Streaming Service ────────────────────────────────────────────────────

async def process_chat_stream(
    db: Session,
    current_user: CurrentUser,
    conversation_id: str,
    prompt: str,
    file_bytes: bytes | None = None,
    filename: str | None = None
):
    """
    Main entrypoint for the AI Chat Agent.
    Implements the strict tool set and natural language confirmation flow.
    """
    if not settings.GEMINI_API_KEY:
        yield "System Error: Gemini API key is not configured."
        return

    # Load Conversation
    try:
        conv = db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.user_id
            )
        ).scalar_one_or_none()
    except Exception as e:
        print(f"Warning: Could not fetch Conversation. Ignoring for test. Error: {e}")
        conv = None
        db.rollback()
    
    if not conv:
        # Instead of yielding error, we will allow it to proceed for mock testing if explicitly passed string
        print("Warning: Processing chat stream without a valid conversation record.")

    # ── Define the Tools (Closure binds db & current_user) ─────────────

    def find_sales_order(search: str = None, client_id: int = None):
        """
        Tool 1: Find Sales Orders. All parameters are optional.
        Call with no arguments to list ALL sales orders.
        Call with search="SO-1025" or search="client name" to filter.
        """
        try:
            sos = list_sales_orders(db, current_user, search=search, client_id=client_id)
            return [to_json_dict({"id": s.id, "order_number": s.order_number, "status": s.status}) for s in sos]
        except Exception as e:
            return f"Error: {e}"

    def get_sales_order_detail(so_id: int):
        """Tool 2: Return full Sales Order details including line items. so_id is the DATABASE INTEGER ID from find_sales_order."""
        try:
            so = get_sales_order(db, current_user, so_id)
            # Serialize necessary nested data
            data = {
                "id": so.id,
                "order_number": so.order_number,
                "status": so.status,
                "lines": [
                    {
                        "id": ln.id, 
                        "sku": ln.sku.sku_code if ln.sku else None, 
                        "ordered_qty": ln.ordered_qty,
                    } for ln in so.lines
                ]
            }
            return to_json_dict(data)
        except Exception as e:
            return f"Error: {e}"

    def parse_order_pdf():
        """Tool 3: Parses the user-uploaded PDF to generate a Draft Sales Order JSON. Do not pass arguments."""
        if not file_bytes:
            return "Error: No file was uploaded in this message run. Ask the user to attach a PDF."
        try:
            parsed_data, _ = parse_pdf_with_gemini(file_bytes, filename or "upload.pdf")
            # parse_pdf_with_gemini returns a plain dict, not a Pydantic model
            return to_json_dict({"draft_data": parsed_data})
        except Exception as e:
            return f"Error parsing PDF: {e}"

    def create_sales_order(client_id: int, lines: list[dict], ship_to_address_id: int = None, order_number: str = None, notes: str = None, confirmed: bool = False):
        """
        Tool 4: Creates a Sales Order.
        IMPORTANT: Always call with confirmed=False initially. If false, ask user to confirm. 
        Only pass confirmed=True if user explicitly said "yes".
        lines should be a list of {"sku_id": int, "ordered_qty": int}
        order_number is optional — auto-generated if not provided.
        """
        if not confirmed:
            return "STATUS: REQUIRES_CONFIRMATION. Present the extracted order details to the user and ask them to confirm if they want to create this Sales Order now."
        try:
            auto_order_number = order_number or f"SO-AI-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            data = SOCreate(
                order_number=auto_order_number,
                client_id=client_id,
                ship_to_address_id=ship_to_address_id,
                notes=notes,
                lines=[{"sku_id": ln["sku_id"], "ordered_qty": ln["ordered_qty"]} for ln in lines]
            )
            so = _create_sales_order(db, current_user, data)
            return to_json_dict({"success": True, "created_so_id": so.id, "order_number": so.order_number})
        except Exception as e:
            return f"Error: {e}"

    def generate_purchase_orders(so_id: int, confirmed: bool = False):
        """
        Tool 5: Auto-create one PO per vendor from a Sales Order.
        IMPORTANT: so_id is the DATABASE INTEGER ID (e.g. 186), NOT the order number string.
        Always call find_sales_order first to get the database id, then pass that id here.
        Requires confirmation: call with confirmed=False first, then confirmed=True after user says yes.
        """
        if not confirmed:
            return "STATUS: REQUIRES_CONFIRMATION. Ask the user if they want to generate Purchase Orders for this Sales Order."
        try:
            pos = generate_pos_from_so(db, current_user, so_id)
            return to_json_dict({"success": True, "pos_generated": [p.po_number for p in pos]})
        except Exception as e:
            return f"Error: {e}"

    def find_purchase_order(search: str = None, sales_order_id: int = None, vendor_id: int = None):
        """
        Tool 6: Find Purchase Orders. All parameters are optional.
        Call with no arguments to list ALL purchase orders.
        Call with search="PO-042" or search="vendor name" to filter.
        """
        try:
            pos = list_purchase_orders(db, current_user, search=search, sales_order_id=sales_order_id, vendor_id=vendor_id)
            return [to_json_dict({"id": p.id, "po_number": p.po_number, "status": p.status}) for p in pos]
        except Exception as e:
            return f"Error: {e}"

    def get_purchase_order_detail(po_id: int):
        """Tool 7: Return full Purchase Order details including line items. po_id is the DATABASE INTEGER ID from find_purchase_order."""
        try:
            po = get_purchase_order(db, current_user, po_id)
            return to_json_dict({
                "id": po.id,
                "po_number": po.po_number,
                "status": po.status,
                "shipment_type": po.shipment_type,
                "lines": [
                    {
                        "id": ln.id, 
                        "sku": ln.sku.sku_code if ln.sku else None, 
                        "quantity": ln.quantity,
                        "status": ln.status
                    } for ln in po.lines
                ]
            })
        except Exception as e:
            return f"Error: {e}"

    def get_purchase_order_outstanding(po_id: int):
        """Tool 8: Return delivered vs remaining fulfillment status per PO line. po_id is the DATABASE INTEGER ID from find_purchase_order."""
        try:
            return to_json_dict(get_fulfillment_overview(db, current_user, po_id))
        except Exception as e:
            return f"Error: {e}"

    def update_po_line_status(po_id: int, line_id: int, status: str, confirmed: bool = False):
        """
        Tool 9: Move a PO line through its status flow (Write).
        status must be "IN_PRODUCTION", "PACKED_AND_SHIPPED", "READY_FOR_PICKUP", or "DELIVERED".
        IMPORTANT: Requires confirmation. If confirmed=False, ask user to confirm action.
        """
        if not confirmed:
            return f"STATUS: REQUIRES_CONFIRMATION. Ask the user if they want to update PO line {line_id} to status {status}."
        try:
            line = update_po_line(db, current_user, po_id, line_id, status=POLineStatus(status))
            return to_json_dict({"success": True, "new_status": line.status.value})
        except Exception as e:
            return f"Error: {e}"

    def record_fulfillment_event(po_line_id: int, quantity: int, notes: str = "", confirmed: bool = False):
        """
        Tool 10: Record delivered quantity against a PO line.
        IMPORTANT: Requires confirmation. If confirmed=False, ask user to confirm action.
        """
        if not confirmed:
            return f"STATUS: REQUIRES_CONFIRMATION. Ask the user if they want to permanently record delivery of {quantity} units for PO line {po_line_id}."
        try:
            evt = FulfillmentEventCreate(po_line_id=po_line_id, quantity=quantity, notes=notes, source=EventSource.AI)
            recorded = _record_fulfillment_event(db, current_user, evt)
            return to_json_dict({"success": True, "event_id": recorded.id, "quantity_recorded": recorded.quantity})
        except Exception as e:
            return f"Error: {e}"

    def get_sku_order_volume(sku_id: int, date_from: str, date_to: str):
        """
        Tool 11: Aggregate PO line quantities for a SKU across a date range.
        date_from and date_to should be 'YYYY-MM-DD'.
        """
        try:
            from app.services.sku import get_sku_order_volume as _get_sku_order_volume
            data = _get_sku_order_volume(db, sku_id, date_from, date_to)
            return to_json_dict(data)
        except Exception as e:
            return f"Error: {e}"

    def find_sku(search: str):
        """Tool 12: A SKU ID from a search term (like name or sku_code)."""
        try:
            from app.services.sku import list_skus as _list_skus
            skus = _list_skus(db, search=search)
            if not skus:
                return {"found": False, "message": f"No SKU found matching '{search}'."}
            return {
                "found": True,
                "skus": [to_json_dict({"id": s.id, "sku_code": s.sku_code, "name": s.name}) for s in skus]
            }
        except Exception as e:
            return f"Error: {e}"

    def find_client(search: str = None):
        """
        Tool 13: Look up a client by company name or partial name.
        search is optional — omit it to list ALL clients.
        Returns a list of matching clients with their database integer IDs.
        ALWAYS call this tool before create_sales_order to resolve the client_id.
        Never ask the user for a client_id.
        """
        try:
            clients = list_clients(db, current_user, search=search)
            if not clients:
                msg = f"No client found matching '{search}'." if search else "No clients in the system."
                return {"found": False, "message": msg}
            return {
                "found": True,
                "clients": [
                    to_json_dict({"id": c.id, "company_name": c.company_name, "is_active": c.is_active})
                    for c in clients
                ]
            }
        except Exception as e:
            return f"Error: {e}"

    def create_client_from_pdf(
        company_name: str,
        contact_name: str = None,
        contact_email: str = None,
        contact_phone: str = None,
        billing_address_line_1: str = None,
        billing_address_line_2: str = None,
        billing_city: str = None,
        billing_state: str = None,
        billing_zip: str = None,
        billing_country: str = "US",
        ship_to_address_line_1: str = None,
        ship_to_address_line_2: str = None,
        ship_to_city: str = None,
        ship_to_state: str = None,
        ship_to_zip: str = None,
        ship_to_country: str = "US",
        confirmed: bool = False,
    ):
        """
        Tool 14: Create a brand-new client using data extracted from a PDF.
        Use this ONLY when find_client() returned found=False.
        Pass all address/contact fields directly from the PDF draft_data.
        Requires confirmation: call with confirmed=False first, then confirmed=True.
        Returns the new client's integer id and the ship_to_address id.
        """
        if not confirmed:
            return (
                f"STATUS: REQUIRES_CONFIRMATION. Will create new client '{company_name}' "
                f"with billing and ship-to addresses from the PDF."
            )
        try:
            contacts = []
            if contact_name:
                contacts.append(ClientContactCreate(
                    contact_type=ContactType.MAIN,
                    name=contact_name,
                    email=contact_email,
                    phone=contact_phone,
                ))

            addresses = []
            if billing_address_line_1 and billing_city:
                addresses.append(ClientAddressCreate(
                    address_type=AddressType.BILLING,
                    label="Billing",
                    address_line_1=billing_address_line_1,
                    address_line_2=billing_address_line_2,
                    city=billing_city,
                    state=billing_state or "",
                    zip_code=billing_zip or "00000",
                    country=billing_country or "US",
                    is_default=True,
                ))

            ship_to_id = None
            if ship_to_address_line_1 and ship_to_city:
                addresses.append(ClientAddressCreate(
                    address_type=AddressType.SHIP_TO,
                    label="Ship-To",
                    address_line_1=ship_to_address_line_1,
                    address_line_2=ship_to_address_line_2,
                    city=ship_to_city,
                    state=ship_to_state or "",
                    zip_code=ship_to_zip or "00000",
                    country=ship_to_country or "US",
                    is_default=True,
                ))

            client_data = ClientCreate(
                company_name=company_name,
                payment_terms=30,
                contacts=contacts,
                addresses=addresses,
            )
            client = _create_client(db, current_user, client_data)

            # Locate the ship_to address id so caller can pass it to create_sales_order
            for addr in client.addresses:
                if addr.address_type == AddressType.SHIP_TO:
                    ship_to_id = addr.id
                    break

            return to_json_dict({
                "success": True,
                "client_id": client.id,
                "company_name": client.company_name,
                "ship_to_address_id": ship_to_id,
            })
        except Exception as e:
            return f"Error creating client: {e}"

    def create_sku_from_pdf(
        sku_code: str,
        name: str,
        description: str = None,
        unit_price: float = None,
        confirmed: bool = False,
    ):
        """
        Tool 15: Create a new SKU for a line item not found in the database.
        Use this ONLY when find_sku() returned no results for this sku_code / description.
        sku_code: use the code from the PDF line item (or generate one from description if none).
        name: human-readable product name.
        unit_price: optional sell price; creates a single tier-price entry if provided.
        Requires confirmation: call with confirmed=False first, then confirmed=True.
        Returns the new SKU's integer id.
        """
        if not confirmed:
            return (
                f"STATUS: REQUIRES_CONFIRMATION. Will create new SKU '{sku_code}' — {name}."
            )
        try:
            from app.schemas.sku import TierPricingCreate
            tier_prices = []
            if unit_price is not None and unit_price > 0:
                tier_prices.append(TierPricingCreate(min_qty=1, max_qty=None, unit_price=unit_price))

            sku_data = SKUCreate(
                sku_code=sku_code,
                name=name,
                description=description,
                tier_prices=tier_prices,
            )
            sku = _create_sku(db, sku_data)
            return to_json_dict({"success": True, "sku_id": sku.id, "sku_code": sku.sku_code})
        except Exception as e:
            return f"Error creating SKU: {e}"

    def _sanitize_args(raw: dict) -> dict:
        """
        Proto struct serializes all numbers as floats (e.g. so_id=201466.0).
        Convert whole-number floats back to int so DB lookups work correctly.
        """
        clean = {}
        for k, v in raw.items():
            if isinstance(v, float) and v == int(v):
                clean[k] = int(v)
            else:
                clean[k] = v
        return clean

    # ── Tool Registry ─────────────────────────────────────────────────────────
    tool_map = {
        "find_sales_order": find_sales_order,
        "get_sales_order_detail": get_sales_order_detail,
        "parse_order_pdf": parse_order_pdf,
        "create_sales_order": create_sales_order,
        "generate_purchase_orders": generate_purchase_orders,
        "find_purchase_order": find_purchase_order,
        "get_purchase_order_detail": get_purchase_order_detail,
        "get_purchase_order_outstanding": get_purchase_order_outstanding,
        "update_po_line_status": update_po_line_status,
        "record_fulfillment_event": record_fulfillment_event,
        "get_sku_order_volume": get_sku_order_volume,
        "find_sku": find_sku,
        "find_client": find_client,
        "create_client_from_pdf": create_client_from_pdf,
        "create_sku_from_pdf": create_sku_from_pdf,
    }

    # ── Context Construction ──────────────────────────────────────────────────
    system_instruction = f"""
    You are the specialized Operations & Finance AI Agent for an internal platform.
    Your job is to assist users with Sales Orders, Purchase Orders, and Fulfillment.

    Current User Context:
    - User ID: {current_user.user_id}
    - Role: {current_user.role.value}

    CORE RULES:
    1. NEVER make up data. Always use tools to fetch real data.
    2. NEVER ask the user for any IDs (client_id, sku_id, so_id, etc.). Resolve them yourself.
    3. ENTITY ID RESOLUTION (always do this before any write):
       - Client → call find_client(search="<company name>")
       - SKU    → call find_sku(search="<sku_code or product name>")
       - SO/PO  → call find_sales_order / find_purchase_order first, use the returned integer "id"

    PDF → SALES ORDER FLOW (follow this EXACT sequence):

    PHASE 1 — DISCOVERY (do all lookups, create NOTHING yet):
      a. Call parse_order_pdf() to extract draft data from the PDF.
      b. Call find_client(search="<customer_name>") — note if client exists or not.
      c. For EVERY line item in the PDF, call find_sku(search="<sku_code or description>") — note which exist and which are missing.

    PHASE 2 — SINGLE CONFIRMATION (present ONE unified summary):
      Show the user a clear table covering ALL of the following:
        • Client status:  ✓ Found (ID: X) or ✗ Not found — will be CREATED
        • Each SKU:       ✓ Found (ID: Y, qty Z) or ✗ Not found — will be CREATED
        • Ship-to address extracted from PDF
        • Billing address extracted from PDF
      Then ask: "Shall I proceed? Reply YES to create everything above and the Sales Order."

    PHASE 3 — EXECUTION (only after user says YES/confirm/go ahead):
      Execute in this exact order:
        1. If client was not found: call create_client_from_pdf(..., confirmed=True) — use all address/contact fields from the PDF.
        2. For each missing SKU: call create_sku_from_pdf(..., confirmed=True) — use sku_code and name from the PDF line item.
        3. Call create_sales_order(..., confirmed=True) using the now-resolved client_id and sku_ids.

    IMPORTANT RULES FOR THE FLOW:
    - In PHASE 1 you are only READING — do NOT call create_client_from_pdf or create_sku_from_pdf yet.
    - Do NOT call create_sales_order(confirmed=False) — skip the intermediate confirmation step and go straight to confirmed=True once the user says YES.
    - Do NOT ask the user for any missing info; derive everything from the PDF data.
    - If a SKU code is missing from the PDF, generate one from the product description (e.g. first letters, max 20 chars).
    - If billing and ship-to addresses are the same in the PDF, use the same values for both.

    OTHER WRITE ACTIONS (non-PDF):
    - Call the write tool with confirmed=False first. The tool returns REQUIRES_CONFIRMATION.
    - Summarize what will happen and ask the user to confirm.
    - Once confirmed, call the same tool again with confirmed=True.

    Be concise and operational. No unnecessary filler text.
    """

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_instruction,
        tools=list(tool_map.values())
    )

    # ── History Hydration ─────────────────────────────────────────────────────
    # Reconstruct the full function_call / function_response chain so Gemini
    # has correct multi-turn context when a conversation is resumed.
    #
    # DB message sequence for a tool-using turn:
    #   USER  content="What POs do we have?"
    #   MODEL content=""  tool_calls=[{id, name, arguments}]   ← AI decision
    #   TOOL  content=<result json>  tool_call_id=<same id>    ← tool result
    #   MODEL content="We have 14 POs…"                       ← final reply
    #
    # Gemini's history format:
    #   {"role":"user",  "parts":["What POs…"]}
    #   {"role":"model", "parts":[FunctionCall(name, args)]}
    #   {"role":"user",  "parts":[FunctionResponse(name, result)]}  ← NOTE: Gemini uses "user" for tool responses
    #   {"role":"model", "parts":["We have 14 POs…"]}
    history = []
    if conv:
        msgs = list(conv.messages)
        i = 0
        while i < len(msgs):
            msg = msgs[i]

            if msg.role == MessageRole.USER:
                history.append({"role": "user", "parts": [msg.content]})
                i += 1

            elif msg.role == MessageRole.MODEL and msg.tool_calls:
                # AI decided to call tools — reconstruct as FunctionCall parts
                fc_parts = [
                    genai.protos.Part(
                        function_call=genai.protos.FunctionCall(
                            name=tc["name"],
                            args=tc.get("arguments", {})
                        )
                    )
                    for tc in msg.tool_calls
                ]
                history.append({"role": "model", "parts": fc_parts})
                i += 1

                # Collect the TOOL result messages that immediately follow
                fr_parts = []
                while i < len(msgs) and msgs[i].role == MessageRole.TOOL:
                    tool_msg = msgs[i]
                    try:
                        result_data = json.loads(tool_msg.content)
                    except Exception:
                        result_data = tool_msg.content
                    fr_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                # tool_call_id stores the tool name so Gemini can match it
                                name=tool_msg.tool_call_id or "unknown_tool",
                                response={"result": result_data}
                            )
                        )
                    )
                    i += 1
                if fr_parts:
                    # Gemini expects function responses with role "user"
                    history.append({"role": "user", "parts": fr_parts})

            elif msg.role == MessageRole.MODEL:
                if msg.content:
                    history.append({"role": "model", "parts": [msg.content]})
                i += 1

            else:
                # TOOL messages are consumed above; skip any orphans
                i += 1

    # Reconstruct the chat with history
    chat = model.start_chat(history=history)

    # Save User Message to DB
    try:
        user_msg = Message(
            conversation_id=conversation_id,
            role=MessageRole.USER,
            content=prompt + (" [File Attached]" if file_bytes else "")
        )
        db.add(user_msg)
        db.commit()
    except Exception as e:
        print(f"Warning: Could not save User Message. Error: {e}")
        db.rollback()

    # ── Execution Loop ─────────────────────────────────────────────────────────

    max_loops = 15  # PDF flow: parse(1) + find_client(1) + find_sku×N + creates + final text
    loop_count = 0

    current_prompt = prompt
    if file_bytes:
        current_prompt += f"\n\n[System Note: A file named '{filename}' was uploaded with this message.]"

    async def send_with_retry(prompt_or_parts, max_retries: int = 3):
        """Send to Gemini with exponential backoff on 429 rate-limit errors."""
        for attempt in range(max_retries):
            try:
                return await chat.send_message_async(prompt_or_parts)
            except Exception as exc:
                err_str = str(exc)
                if "429" in err_str and attempt < max_retries - 1:
                    wait = 15 * (2 ** attempt)  # 15s, 30s, 60s
                    print(f"Rate limit hit, retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait)
                else:
                    raise

    while loop_count < max_loops:
        loop_count += 1

        response = await send_with_retry(current_prompt)

        # Detect tool calls — use .name check (proto truthiness is unreliable)
        parts = response.parts if hasattr(response, "parts") else []
        tool_call_parts = [
            p for p in parts
            if hasattr(p, "function_call") and getattr(p.function_call, "name", None)
        ]

        if tool_call_parts:
            # ── Step 1: build records for each tool call (generate short IDs) ──
            call_records = []
            for part in tool_call_parts:
                f_call = part.function_call
                raw_args = {k: v for k, v in f_call.args.items()} if hasattr(f_call, "args") and f_call.args else {}
                call_records.append({
                    "id": str(uuid4())[:8],          # short unique id, e.g. "a3f1c2d9"
                    "name": f_call.name,
                    "arguments": _sanitize_args(raw_args),
                })

            # ── Step 2: save MODEL decision message with tool_calls list ──────
            try:
                decision_msg = Message(
                    conversation_id=conversation_id,
                    role=MessageRole.MODEL,
                    content="",
                    tool_calls=[{"id": r["id"], "name": r["name"], "arguments": r["arguments"]} for r in call_records],
                )
                db.add(decision_msg)
                db.flush()
            except Exception as e:
                print(f"Warning: Could not save tool-decision message. Error: {e}")
                db.rollback()

            # ── Step 3: execute each tool and save its TOOL result message ────
            tool_responses = []
            for rec in call_records:
                func_name = rec["name"]
                func_args = rec["arguments"]

                print(f"Executing AI Tool: {func_name}({func_args})")
                try:
                    result = tool_map[func_name](**func_args) if func_name in tool_map else f"Tool {func_name} not found"
                except Exception as e:
                    result = f"Exception: {str(e)}"

                # Serialise result for storage (keep full payload for history replay)
                try:
                    result_str = json.dumps(result, cls=CustomJSONEncoder)
                except Exception:
                    result_str = str(result)

                # Save TOOL result message — tool_call_id links it to the decision above
                try:
                    tool_result_msg = Message(
                        conversation_id=conversation_id,
                        role=MessageRole.TOOL,
                        content=result_str[:4000],  # guard against very large payloads
                        tool_call_id=func_name,     # store tool name so history hydration can match it
                    )
                    db.add(tool_result_msg)
                except Exception as e:
                    print(f"Warning: Could not save tool-result message. Error: {e}")

                tool_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=func_name,
                            response={"result": result}
                        )
                    )
                )

            # Commit all decision + result messages together
            try:
                db.commit()
            except Exception as e:
                print(f"Warning: Could not commit tool messages. Error: {e}")
                db.rollback()

            # Feed results back to Gemini for the next loop iteration
            current_prompt = tool_responses
            continue

        else:
            # No tool calls — extract the final text response safely
            try:
                final_text = response.text
            except Exception:
                final_text = " ".join(
                    p.text for p in parts if hasattr(p, "text") and p.text
                ).strip()

            # If still empty, nudge Gemini once to give a text reply
            if not final_text and loop_count < max_loops:
                current_prompt = "Please respond with a plain text summary of your findings."
                continue

            # Save final MODEL text message
            try:
                ai_msg = Message(
                    conversation_id=conversation_id,
                    role=MessageRole.MODEL,
                    content=final_text,
                )
                db.add(ai_msg)
                db.commit()
            except Exception as e:
                print(f"Warning: Could not save AI Message. Error: {e}")
                db.rollback()

            yield final_text
            break
