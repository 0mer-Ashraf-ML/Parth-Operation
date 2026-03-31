from fastapi import APIRouter, Depends, Query, status, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundException
from app.models.chat import Conversation, Message
from app.schemas.auth import CurrentUser
from app.schemas.chat import (
    ConversationOut,
    ConversationCreate,
    MessageOut,
)
from app.services.ai_chat import process_chat_stream

router = APIRouter(prefix="/ai/conversations", tags=["AI Chat"])

@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Start a new chat conversation thread."""
    conv = Conversation(
        title=data.title,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        user_id=current_user.user_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv

@router.get("", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get all past conversations for the current user."""
    convs = db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.user_id)
        .order_by(Conversation.created_at.desc())
    ).scalars().all()
    return list(convs)

@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full history of a specific conversation thread."""
    conv = db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.user_id
        )
    ).scalar_one_or_none()
    
    if not conv:
        raise NotFoundException("Conversation not found")
        
    return list(conv.messages)

@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    prompt: str = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Send a message to the AI and stream the response back via Server-Sent Events (SSE).
    Accepts multipart/form-data for optional file uploads.
    """
    file_bytes = None
    filename = None
    
    if file and file.filename:
        file_bytes = await file.read()
        filename = file.filename

    async def sse_generator():
        try:
            async for chunk in process_chat_stream(
                db=db, 
                current_user=current_user, 
                conversation_id=conversation_id, 
                prompt=prompt,
                file_bytes=file_bytes,
                filename=filename
            ):
                # Format as Server-Sent Events
                safe_chunk = chunk.replace("\n", "\\n")
                yield f"data: {safe_chunk}\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
