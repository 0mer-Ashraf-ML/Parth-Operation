"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch } from "@/lib/store/hooks";
import { addSalesOrder, fetchSalesOrdersAsync } from "@/lib/store/salesOrdersSlice";
import {
  Flex,
  Text,
  Heading,
  Box,
  TextField,
  Button,
  Card,
  Select,
  Table,
  Badge,
} from "@radix-ui/themes";
import { FiArrowLeft, FiCheck, FiX, FiEdit2, FiTrash2, FiPlus } from "react-icons/fi";
import { createSalesOrder, type CreateSalesOrderRequest } from "@/lib/api/services/salesOrdersService";
import { fetchClients } from "@/lib/api/services/clientsService";
import { fetchClientById } from "@/lib/api/services/clientsService";
import { createAddress } from "@/lib/api/services/addressesService";
import type { AddressRequest } from "@/lib/store/clientsSlice";
import { isClientShipToAddress } from "@/lib/store/clientsSlice";
import { fetchSKUs, createSKU, type SKUApiResponse, type CreateSKURequest } from "@/lib/api/services/skusService";
import { type ParsedPdfResponse } from "@/lib/api/services/pdfService";
import { toast } from "react-toastify";
import { Dialog } from "@radix-ui/themes";

interface Client {
  id: number;
  company_name: string;
}

/** Saved client address row for Select + matching. */
interface ClientAddressOption {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

const ADDRESS_NEW_MANUAL = "__new__";

function isBillingAddressRow(addr: { address_type?: string }): boolean {
  return String(addr.address_type || "").toLowerCase() === "billing";
}

function mapApiAddressToOption(addr: {
  id: number;
  label?: string;
  address_line_1?: string;
  address_line_2?: string | null;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}): ClientAddressOption {
  return {
    id: String(addr.id),
    label: addr.label || "",
    addressLine1: addr.address_line_1 || "",
    addressLine2: addr.address_line_2 || "",
    city: addr.city || "",
    state: addr.state || "",
    zipCode: addr.zip_code || "",
    country: addr.country || "",
  };
}

interface DraftLineItem {
  id: string;
  lineNumber: number;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  dueDate: string | null;
  notes: string | null;
  originalSkuCode: string;
  originalSkuDescription: string;
  matchedSkuId: number | null;
  matchConfidence: string;
}

/** Editable address block (values from PDF + user edits). */
interface DraftAddressFields {
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface DraftFormData {
  orderNumber: string;
  orderDate: string | null;
  clientId: string;
  customerName: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipToAddress: DraftAddressFields;
  billToAddress: DraftAddressFields;
  subtotal: string;
  taxAmount: string | null;
  totalAmount: string;
  currency: string;
  paymentTerms: string | null;
  lineItems: DraftLineItem[];
  notes: string;
  originalPdfUrl: string;
  parsingNotes: string | null;
  confidenceScore: string;
  /** Saved client ship-to row id, `__new__` for PDF/manual entry, or "" if none. */
  shipToAddressId: string;
  /** Saved client billing row id, `__new__`, or "". */
  billToAddressId: string;
}

function optionToDraftFields(o: ClientAddressOption): DraftAddressFields {
  return {
    label: o.label || "",
    addressLine1: o.addressLine1,
    addressLine2: o.addressLine2,
    city: o.city,
    state: o.state,
    zipCode: o.zipCode,
    country: o.country || "US",
  };
}

function parsedMatchesSavedOption(parsed: DraftAddressFields, saved: ClientAddressOption): boolean {
  if (!normAddrPart(parsed.addressLine1) || !normAddrPart(parsed.city)) return false;
  const line1 = normAddrPart(parsed.addressLine1) === normAddrPart(saved.addressLine1);
  const city = normAddrPart(parsed.city) === normAddrPart(saved.city);
  const stateOk =
    !normAddrPart(parsed.state) ||
    !normAddrPart(saved.state) ||
    normAddrPart(parsed.state) === normAddrPart(saved.state);
  return line1 && city && stateOk;
}

function isSavedAddressId(v: string): boolean {
  return v !== "" && v !== ADDRESS_NEW_MANUAL && /^\d+$/.test(v);
}

function strFromParse(v: string | null | undefined): string {
  return v ?? "";
}

/** Contact / phone from PDF may be string or number; always store as string for text fields. */
function optionalStringFromParsed(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return String(v);
}

function normAddrPart(s: string): string {
  return s.trim().toLowerCase();
}

/** Same physical address lines (ignore labels) — skip redundant billing POST. */
function draftAddressLinesEqual(a: DraftAddressFields, b: DraftAddressFields): boolean {
  return (
    normAddrPart(a.addressLine1) === normAddrPart(b.addressLine1) &&
    normAddrPart(a.addressLine2) === normAddrPart(b.addressLine2) &&
    normAddrPart(a.city) === normAddrPart(b.city) &&
    normAddrPart(a.state) === normAddrPart(b.state) &&
    normAddrPart(a.zipCode) === normAddrPart(b.zipCode) &&
    normAddrPart(a.country) === normAddrPart(b.country)
  );
}

function DraftContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const confirmInFlightRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [skus, setSkus] = useState<SKUApiResponse[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingSkus, setIsLoadingSkus] = useState(true);
  const [formData, setFormData] = useState<DraftFormData | null>(null);
  const [hasData, setHasData] = useState(false);
  const [addSkuModalOpen, setAddSkuModalOpen] = useState(false);
  const [lineItemForSku, setLineItemForSku] = useState<DraftLineItem | null>(null);
  const [isCreatingSku, setIsCreatingSku] = useState(false);
  const [newSkuData, setNewSkuData] = useState({
    skuCode: "",
    name: "",
    description: "",
  });

  const [shipToAddresses, setShipToAddresses] = useState<ClientAddressOption[]>([]);
  const [billingAddresses, setBillingAddresses] = useState<ClientAddressOption[]>([]);
  const [isLoadingClientAddresses, setIsLoadingClientAddresses] = useState(false);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Load parsed PDF data from sessionStorage
  useEffect(() => {
    const draftData = sessionStorage.getItem("soDraft");
    if (draftData) {
      try {
        const parsed: ParsedPdfResponse = JSON.parse(draftData);
        
        // Map parsed data to form data structure
        const mappedFormData: DraftFormData = {
          orderNumber: parsed?.order_number,
          orderDate: parsed?.order_date,
          clientId: parsed?.matched_client_id?.toString() || "",
          customerName: parsed?.customer_name,
          customerContact: optionalStringFromParsed(parsed?.customer_contact),
          customerEmail: optionalStringFromParsed(parsed?.customer_email),
          customerPhone: optionalStringFromParsed(parsed?.customer_phone),
          shipToAddress: {
            label: optionalStringFromParsed(parsed?.ship_to_address?.label) ?? "Ship-To",
            addressLine1: strFromParse(parsed?.ship_to_address?.address_line_1),
            addressLine2: strFromParse(parsed?.ship_to_address?.address_line_2),
            city: strFromParse(parsed?.ship_to_address?.city),
            state: strFromParse(parsed?.ship_to_address?.state),
            zipCode: strFromParse(parsed?.ship_to_address?.zip_code),
            country: strFromParse(parsed?.ship_to_address?.country) || "US",
          },
          billToAddress: {
            label: optionalStringFromParsed(parsed?.bill_to_address?.label) ?? "Bill-To",
            addressLine1: strFromParse(parsed?.bill_to_address?.address_line_1),
            addressLine2: strFromParse(parsed?.bill_to_address?.address_line_2),
            city: strFromParse(parsed?.bill_to_address?.city),
            state: strFromParse(parsed?.bill_to_address?.state),
            zipCode: strFromParse(parsed?.bill_to_address?.zip_code),
            country: strFromParse(parsed?.bill_to_address?.country) || "US",
          },
          subtotal: parsed?.subtotal,
          taxAmount: parsed?.tax_amount,
          totalAmount: parsed?.total_amount,
          currency: parsed?.currency,
          paymentTerms: parsed?.payment_terms,
          lineItems: parsed?.line_items?.map((item, index) => ({
            id: `line-${index}`,
            lineNumber: item.line_number,
            skuId: item.matched_sku_id?.toString() || "",
            skuCode: item.matched_sku_id ? "" : item.sku_code,
            skuName: item.matched_sku_name || item.sku_description,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
            dueDate: item.due_date ?? parsed?.due_date ?? null,
            notes: item.notes,
            originalSkuCode: item.sku_code,
            originalSkuDescription: item.sku_description,
            matchedSkuId: item.matched_sku_id,
            matchConfidence: item.match_confidence,
          })),
          notes: parsed?.parsing_notes || "",
          originalPdfUrl: parsed?.s3_url,
          parsingNotes: parsed?.parsing_notes,
          confidenceScore: parsed?.confidence_score,
          shipToAddressId:
            parsed?.ship_to_address_id != null ? String(parsed.ship_to_address_id) : "",
          billToAddressId: "",
        };

        setFormData(mappedFormData);
        setHasData(true);
      } catch (error) {
        console.error("Error parsing draft data:", error);
        toast.error("Failed to load draft data");
        router.push("/sales-orders");
      }
    } else {
      toast.error("No draft data found");
      router.push("/sales-orders");
    }
  }, [router]);

  // Load clients and SKUs
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoadingClients(true);
        setIsLoadingSkus(true);
        
        const [clientsData, skusData] = await Promise.all([
          fetchClients(),
          fetchSKUs(),
        ]);
        
        setClients(clientsData);
        setSkus(skusData);
      } catch (error: any) {
        toast.error(error.message || "Failed to load data");
        console.error("Error loading data:", error);
      } finally {
        setIsLoadingClients(false);
        setIsLoadingSkus(false);
      }
    };
    
    loadData();
  }, []);

  useEffect(() => {
    const clientId = formDataRef.current?.clientId;
    if (!clientId) {
      setShipToAddresses([]);
      setBillingAddresses([]);
      setIsLoadingClientAddresses(false);
      return;
    }

    let cancelled = false;

    setIsLoadingClientAddresses(true);
    void (async () => {
      try {
        const client = await fetchClientById(clientId);
        if (cancelled) return;
        const raw = client.addresses || [];
        const shipOpts = raw
          .filter((a: { address_type?: string }) => isClientShipToAddress(a))
          .map((a: any) => mapApiAddressToOption(a));
        const billOpts = raw
          .filter((a: { address_type?: string }) => isBillingAddressRow(a))
          .map((a: any) => mapApiAddressToOption(a));
        setShipToAddresses(shipOpts);
        setBillingAddresses(billOpts);

        setFormData((prev) => {
          if (!prev || prev.clientId !== clientId) return prev;
          const pdfShip = prev.shipToAddress;
          const pdfBill = prev.billToAddress;

          let shipId = prev.shipToAddressId;
          if (
            shipId === ADDRESS_NEW_MANUAL &&
            shipOpts.length > 0
          ) {
            /* keep explicit "new address" */
          } else if (isSavedAddressId(shipId) && shipOpts.some((s) => s.id === shipId)) {
            /* keep valid saved */
          } else {
            shipId = "";
            if (shipOpts.length > 0) {
              const matched = shipOpts.find((s) => parsedMatchesSavedOption(pdfShip, s));
              shipId = matched ? matched.id : ADDRESS_NEW_MANUAL;
            } else {
              shipId = "";
            }
          }

          let billId = prev.billToAddressId;
          if (
            billId === ADDRESS_NEW_MANUAL &&
            billOpts.length > 0
          ) {
            /* keep explicit "new address" */
          } else if (isSavedAddressId(billId) && billOpts.some((b) => b.id === billId)) {
            /* keep valid saved */
          } else {
            billId = "";
            if (billOpts.length > 0) {
              const matched = billOpts.find((b) => parsedMatchesSavedOption(pdfBill, b));
              billId = matched ? matched.id : ADDRESS_NEW_MANUAL;
            } else {
              billId = "";
            }
          }

          return { ...prev, shipToAddressId: shipId, billToAddressId: billId };
        });
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load client addresses";
          toast.error(msg);
          setShipToAddresses([]);
          setBillingAddresses([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClientAddresses(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formData?.clientId]);

  const updateFormField = (field: keyof DraftFormData, value: any) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const updateLineItem = (
    id: string,
    field: keyof DraftLineItem,
    value: string | number | null
  ) => {
    if (!formData) return;
    
    const updatedItems = formData.lineItems.map((item) => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        
        // If SKU is selected, update SKU details
        if (field === "skuId" && typeof value === "string") {
          const sku = skus.find((s) => s.id.toString() === value);
          if (sku) {
            updated.skuCode = sku.sku_code;
            updated.skuName = sku.name;
            // Get price from first tier price, or use existing unit price
            const basePrice = sku.tier_prices && sku.tier_prices.length > 0
              ? parseFloat(sku.tier_prices[0].unit_price)
              : updated.unitPrice;
            updated.unitPrice = basePrice;
            updated.totalPrice = updated.quantity * basePrice;
          }
        }
        
        // If quantity or unit price changes, recalculate total
        if (field === "quantity" && typeof value === "number") {
          updated.quantity = value;
          updated.totalPrice = updated.quantity * updated.unitPrice;
        }
        if (field === "unitPrice" && typeof value === "number") {
          updated.unitPrice = value;
          updated.totalPrice = updated.quantity * updated.unitPrice;
        }
        
        return updated;
      }
      return item;
    });
    
    updateFormField("lineItems", updatedItems);
  };

  const removeLineItem = (id: string) => {
    if (!formData) return;
    
    // Remove the line item
    const updatedItems = formData.lineItems.filter((item) => item.id !== id);
    
    // Update line numbers to be sequential
    const renumberedItems = updatedItems.map((item, index) => ({
      ...item,
      lineNumber: index + 1,
    }));
    
    updateFormField("lineItems", renumberedItems);
  };

  const updateAddressField = (
    block: "shipToAddress" | "billToAddress",
    field: keyof DraftAddressFields,
    value: string
  ) => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            [block]: { ...prev[block], [field]: value },
          }
        : null
    );
  };

  const getTotalAmount = () => {
    if (!formData) return 0;
    return formData.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const handleConfirm = async () => {
    if (!formData || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    try {
      if (!formData.clientId) {
        toast.error("Please select a client");
        return;
      }

      const shipIsSaved =
        isSavedAddressId(formData.shipToAddressId) &&
        shipToAddresses.some((s) => s.id === formData.shipToAddressId);

      if (!shipIsSaved) {
        const ship = formData.shipToAddress;
        if (!ship.label.trim() || !ship.addressLine1.trim() || !ship.city.trim()) {
          toast.error("Ship-to address: label, address line 1, and city are required");
          return;
        }
        if (!ship.state.trim() || !ship.zipCode.trim() || !ship.country.trim()) {
          toast.error("Ship-to address: state, ZIP code, and country are required");
          return;
        }
      }

      const bill = formData.billToAddress;
      const billPartial =
        bill.label.trim() ||
        bill.addressLine1.trim() ||
        bill.city.trim() ||
        bill.state.trim() ||
        bill.zipCode.trim() ||
        bill.country.trim();

      const billIsSaved =
        isSavedAddressId(formData.billToAddressId) &&
        billingAddresses.some((b) => b.id === formData.billToAddressId);

      if (billPartial && !billIsSaved) {
        if (!bill.label.trim() || !bill.addressLine1.trim() || !bill.city.trim()) {
          toast.error(
            "Bill-to address: complete label, address line 1, and city or clear all bill-to fields"
          );
          return;
        }
        if (!bill.state.trim() || !bill.zipCode.trim() || !bill.country.trim()) {
          toast.error(
            "Bill-to address: state, ZIP code, and country are required when billing address is filled in"
          );
          return;
        }
      }

      if (formData.lineItems.length === 0) {
        toast.error("At least one line item is required");
        return;
      }

      const missingSkus = formData.lineItems.filter((item) => !item.skuId);
      if (missingSkus.length > 0) {
        toast.error("Please select SKU for all line items");
        return;
      }

      setIsSaving(true);
      try {
        const clientIdNum = parseInt(formData.clientId, 10);

        let shipToIdForSo: number;
        if (shipIsSaved) {
          shipToIdForSo = parseInt(formData.shipToAddressId, 10);
        } else {
          const ship = formData.shipToAddress;
          const shipPayload: AddressRequest = {
            label: ship.label.trim(),
            address_line_1: ship.addressLine1.trim(),
            address_line_2: ship.addressLine2.trim() || undefined,
            city: ship.city.trim(),
            state: ship.state.trim(),
            zip_code: ship.zipCode.trim(),
            country: ship.country.trim() || "US",
            is_default: false,
            address_type: "ship_to",
          };
          const createdShip = await createAddress(clientIdNum, shipPayload);
          shipToIdForSo = createdShip.id;
        }

        const shipLinesForDedupe: DraftAddressFields = shipIsSaved
          ? optionToDraftFields(
              shipToAddresses.find((s) => s.id === formData.shipToAddressId)!
            )
          : formData.shipToAddress;

        if (billPartial && !billIsSaved) {
          if (!draftAddressLinesEqual(shipLinesForDedupe, formData.billToAddress)) {
            const billPayload: AddressRequest = {
              label: bill.label.trim(),
              address_line_1: bill.addressLine1.trim(),
              address_line_2: bill.addressLine2.trim() || undefined,
              city: bill.city.trim(),
              state: bill.state.trim(),
              zip_code: bill.zipCode.trim(),
              country: bill.country.trim() || "US",
              is_default: false,
              address_type: "billing",
            };
            await createAddress(clientIdNum, billPayload);
          }
        }

        const createRequest: CreateSalesOrderRequest = {
          order_number: formData.orderNumber,
          client_id: clientIdNum,
          ship_to_address_id: shipToIdForSo,
          order_date: formData.orderDate || null,
          original_pdf_url: formData.originalPdfUrl || null,
          notes: formData.notes || null,
          lines: formData.lineItems.map((item) => ({
            sku_id: parseInt(item.skuId),
            line_number: item.lineNumber,
            ordered_qty: item.quantity,
            unit_price: item.unitPrice,
            due_date: item.dueDate || null,
          })),
        };

        const newSalesOrder = await createSalesOrder(createRequest);
        toast.success("Sales order created successfully");

        dispatch(addSalesOrder(newSalesOrder));

        sessionStorage.removeItem("soDraft");

        router.push("/sales-orders");
      } catch (error: any) {
        toast.error(error.message || "Failed to create sales order");
        console.error("Error creating sales order:", error);
      } finally {
        setIsSaving(false);
      }
    } finally {
      confirmInFlightRef.current = false;
    }
  };

  const handleCancel = () => {
    sessionStorage.removeItem("soDraft");
    router.push("/sales-orders");
  };

  const openAddSkuModal = (lineItem: DraftLineItem) => {
    setLineItemForSku(lineItem);
    setNewSkuData({
      skuCode: lineItem.originalSkuCode || "",
      name: lineItem.originalSkuDescription || "",
      description: "",
    });
    setAddSkuModalOpen(true);
  };

  const handleCreateSku = async () => {
    if (!lineItemForSku) return;

    if (!newSkuData.skuCode.trim()) {
      toast.error("SKU Code is required");
      return;
    }

    if (!newSkuData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      setIsCreatingSku(true);

      const createRequest: CreateSKURequest = {
        sku_code: newSkuData.skuCode.trim(),
        name: newSkuData.name.trim(),
        description: newSkuData.description.trim() || undefined,
        default_vendor_id: null,
        secondary_vendor_id: undefined,
        track_inventory: false,
        inventory_count: 0,
        tier_prices: undefined,
      };

      const newSku = await createSKU(createRequest);
      toast.success("SKU created successfully");

      // Refresh SKUs list
      const updatedSkus = await fetchSKUs();
      setSkus(updatedSkus);

      // Auto-select the newly created SKU for the line item
      if (formData) {
        updateLineItem(lineItemForSku.id, "skuId", newSku.id.toString());
      }

      // Close modal and reset
      setAddSkuModalOpen(false);
      setLineItemForSku(null);
      setNewSkuData({
        skuCode: "",
        name: "",
        description: "",
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to create SKU");
      console.error("Error creating SKU:", error);
    } finally {
      setIsCreatingSku(false);
    }
  };

  if (!hasData || !formData) {
    return (
      <Flex align="center" justify="center" style={{ height: "100vh" }}>
        <Text>Loading draft data...</Text>
      </Flex>
    );
  }

  const inputStyle = {
    background: "var(--color-dark-bg-secondary)",
    border: "1px solid var(--color-dark-bg-tertiary)",
    color: "var(--color-text-primary)",
  } as const;

  const shipComplete =
    formData.shipToAddress.label.trim() &&
    formData.shipToAddress.addressLine1.trim() &&
    formData.shipToAddress.city.trim() &&
    formData.shipToAddress.state.trim() &&
    formData.shipToAddress.zipCode.trim() &&
    formData.shipToAddress.country.trim();

  const billComplete =
    formData.billToAddress.label.trim() &&
    formData.billToAddress.addressLine1.trim() &&
    formData.billToAddress.city.trim() &&
    formData.billToAddress.state.trim() &&
    formData.billToAddress.zipCode.trim() &&
    formData.billToAddress.country.trim();

  const billPartialForSubmit =
    formData.billToAddress.label.trim() ||
    formData.billToAddress.addressLine1.trim() ||
    formData.billToAddress.city.trim() ||
    formData.billToAddress.state.trim() ||
    formData.billToAddress.zipCode.trim() ||
    formData.billToAddress.country.trim();

  const shipSavedOk =
    isSavedAddressId(formData.shipToAddressId) &&
    shipToAddresses.some((s) => s.id === formData.shipToAddressId) &&
    !isLoadingClientAddresses;

  const showShipManual =
    !isLoadingClientAddresses &&
    (shipToAddresses.length === 0 ||
      formData.shipToAddressId === ADDRESS_NEW_MANUAL ||
      !isSavedAddressId(formData.shipToAddressId) ||
      !shipToAddresses.some((s) => s.id === formData.shipToAddressId));

  const shipOk =
    !isLoadingClientAddresses && (shipSavedOk || (showShipManual && shipComplete));

  const billSavedOk =
    isSavedAddressId(formData.billToAddressId) &&
    billingAddresses.some((b) => b.id === formData.billToAddressId) &&
    !isLoadingClientAddresses;

  const showBillManual =
    !isLoadingClientAddresses &&
    !billSavedOk &&
    (billingAddresses.length === 0 ||
      formData.billToAddressId === ADDRESS_NEW_MANUAL ||
      !isSavedAddressId(formData.billToAddressId) ||
      !billingAddresses.some((b) => b.id === formData.billToAddressId));

  const billOk =
    !billPartialForSubmit || billSavedOk || (showBillManual && billComplete);

  const canSubmit =
    Boolean(formData.clientId) &&
    shipOk &&
    billOk &&
    formData.lineItems.length > 0 &&
    formData.lineItems.every((item) => item.skuId);

  return (
    <Flex direction="column" gap="4" style={{ padding: "1rem", maxWidth: "1400px", margin: "0 auto" }}>
      <Flex align="center" gap="3">
        <Button
          variant="ghost"
          onClick={handleCancel}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <Heading size={{ initial: "6", md: "8" }}>Verify & Confirm Sales Order</Heading>
        <Badge color={formData.confidenceScore === "high" ? "green" : formData.confidenceScore === "medium" ? "yellow" : "red"}>
          {formData.confidenceScore} confidence
        </Badge>
      </Flex>

      {/* {formData.parsingNotes && (
        <Card style={{ padding: "1rem", background: "var(--color-dark-bg-secondary)" }}>
          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Parsing Notes:</strong> {formData.parsingNotes}
          </Text>
        </Card>
      )} */}

      {/* Order Information */}
      <Card style={{ padding: "1.5rem" }}>
        <Heading size={{ initial: "4", md: "5" }} mb="4">
          Order Information
        </Heading>
        <Flex direction="column" gap="4">
          <Flex gap="4" wrap="wrap">
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Order Number *
              </Text>
              <TextField.Root
                value={formData.orderNumber}
                onChange={(e) => updateFormField("orderNumber", e.target.value)}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Order Date
              </Text>
              <TextField.Root
                type="date"
                value={formData.orderDate || ""}
                onChange={(e) => updateFormField("orderDate", e.target.value || null)}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
          </Flex>

          <Box>
            <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
              Client *
            </Text>
            <Select.Root
              value={formData.clientId}
              onValueChange={(value) => updateFormField("clientId", value)}
            >
              <Select.Trigger
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  width: "100%",
                }}
              />
              <Select.Content>
                {isLoadingClients ? (
                  <Select.Item value="loading" disabled>Loading clients...</Select.Item>
                ) : clients.length === 0 ? (
                  <Select.Item value="no-clients" disabled>No clients available</Select.Item>
                ) : (
                  clients.map((client) => (
                    <Select.Item key={client.id.toString()} value={client.id.toString()}>
                      {client.company_name}
                    </Select.Item>
                  ))
                )}
              </Select.Content>
            </Select.Root>
          </Box>

          <Flex gap="4" wrap="wrap">
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Customer Contact
              </Text>
              <TextField.Root
                type="text"
                inputMode="text"
                autoComplete="name"
                value={formData.customerContact != null ? String(formData.customerContact) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateFormField("customerContact", v.length === 0 ? null : v);
                }}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
            <Box style={{ flex: "1", minWidth: "240px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Customer Email
              </Text>
              <TextField.Root
                type="email"
                inputMode="email"
                autoComplete="email"
                value={formData.customerEmail != null ? String(formData.customerEmail) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateFormField("customerEmail", v.length === 0 ? null : v);
                }}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Customer Phone
              </Text>
              <TextField.Root
                type="text"
                inputMode="tel"
                autoComplete="tel"
                value={formData.customerPhone != null ? String(formData.customerPhone) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateFormField("customerPhone", v.length === 0 ? null : v);
                }}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
          </Flex>
        </Flex>
      </Card>

      <Card style={{ padding: "1.5rem" }}>
        <Heading size={{ initial: "4", md: "5" }} mb="4">
          Ship-To Address *
        </Heading>
        <Text size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
          Choose a saved ship-to for this client when it matches the PDF, or use &quot;New address&quot; to edit
          the extracted address and save it as a new row on create.
        </Text>
        <Flex direction="column" gap="3">
          {isLoadingClientAddresses ? (
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Loading client addresses…
            </Text>
          ) : shipToAddresses.length > 0 ? (
            <Box>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Saved ship-to on client *
              </Text>
              <Select.Root
                value={
                  isSavedAddressId(formData.shipToAddressId) &&
                  shipToAddresses.some((s) => s.id === formData.shipToAddressId)
                    ? formData.shipToAddressId
                    : ADDRESS_NEW_MANUAL
                }
                onValueChange={(v) => updateFormField("shipToAddressId", v)}
              >
                <Select.Trigger
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    width: "100%",
                  }}
                />
                <Select.Content>
                  {shipToAddresses.map((addr) => (
                    <Select.Item key={addr.id} value={addr.id}>
                      {addr.label ? `${addr.label} — ` : ""}
                      {addr.addressLine1}, {addr.city}
                      {addr.state ? `, ${addr.state}` : ""} {addr.zipCode}
                    </Select.Item>
                  ))}
                  <Select.Item value={ADDRESS_NEW_MANUAL}>
                    New address (PDF fields below)
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
          ) : (
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              No ship-to addresses on file for this client. Enter the address from the PDF below; it will be
              created when you submit.
            </Text>
          )}

          {showShipManual && (
            <>
              <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                Address from document (edit if needed)
              </Text>
              <TextField.Root
                type="text"
                inputMode="text"
                placeholder="Label *"
                value={
                  formData.shipToAddress.label != null
                    ? String(formData.shipToAddress.label)
                    : ""
                }
                onChange={(e) => updateAddressField("shipToAddress", "label", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <TextField.Root
                placeholder="Address Line 1 *"
                value={formData.shipToAddress.addressLine1}
                onChange={(e) => updateAddressField("shipToAddress", "addressLine1", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <TextField.Root
                placeholder="Address Line 2 (optional)"
                value={formData.shipToAddress.addressLine2}
                onChange={(e) => updateAddressField("shipToAddress", "addressLine2", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <Flex gap="3" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <TextField.Root
                    placeholder="City *"
                    value={formData.shipToAddress.city}
                    onChange={(e) => updateAddressField("shipToAddress", "city", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="State *"
                    value={formData.shipToAddress.state}
                    onChange={(e) => updateAddressField("shipToAddress", "state", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="ZIP Code *"
                    value={formData.shipToAddress.zipCode}
                    onChange={(e) => updateAddressField("shipToAddress", "zipCode", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="Country *"
                    value={formData.shipToAddress.country}
                    onChange={(e) => updateAddressField("shipToAddress", "country", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
              </Flex>
            </>
          )}
        </Flex>
      </Card>

      <Card style={{ padding: "1.5rem" }}>
        <Heading size={{ initial: "4", md: "5" }} mb="4">
          Bill-To Address
        </Heading>
        <Text size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
          Optional. Match a saved billing address when possible, or use new address fields from the PDF. Clear all
          billing fields if you do not want to store billing.
        </Text>
        <Flex direction="column" gap="3">
          {!isLoadingClientAddresses && billingAddresses.length > 0 && (
            <Box>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Saved billing on client
              </Text>
              <Select.Root
                value={
                  isSavedAddressId(formData.billToAddressId) &&
                  billingAddresses.some((b) => b.id === formData.billToAddressId)
                    ? formData.billToAddressId
                    : ADDRESS_NEW_MANUAL
                }
                onValueChange={(v) => updateFormField("billToAddressId", v)}
              >
                <Select.Trigger
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    width: "100%",
                  }}
                />
                <Select.Content>
                  {billingAddresses.map((addr) => (
                    <Select.Item key={addr.id} value={addr.id}>
                      {addr.label ? `${addr.label} — ` : ""}
                      {addr.addressLine1}, {addr.city}
                      {addr.state ? `, ${addr.state}` : ""} {addr.zipCode}
                    </Select.Item>
                  ))}
                  <Select.Item value={ADDRESS_NEW_MANUAL}>
                    New address (PDF fields below)
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
          )}

          {showBillManual && (
            <>
              <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                Billing from document (edit if needed)
              </Text>
              <TextField.Root
                type="text"
                inputMode="text"
                placeholder="Label *"
                value={
                  formData.billToAddress.label != null
                    ? String(formData.billToAddress.label)
                    : ""
                }
                onChange={(e) => updateAddressField("billToAddress", "label", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <TextField.Root
                placeholder="Address Line 1 *"
                value={formData.billToAddress.addressLine1}
                onChange={(e) => updateAddressField("billToAddress", "addressLine1", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <TextField.Root
                placeholder="Address Line 2 (optional)"
                value={formData.billToAddress.addressLine2}
                onChange={(e) => updateAddressField("billToAddress", "addressLine2", e.target.value)}
                size="3"
                style={inputStyle}
              />
              <Flex gap="3" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <TextField.Root
                    placeholder="City *"
                    value={formData.billToAddress.city}
                    onChange={(e) => updateAddressField("billToAddress", "city", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="State *"
                    value={formData.billToAddress.state}
                    onChange={(e) => updateAddressField("billToAddress", "state", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="ZIP Code *"
                    value={formData.billToAddress.zipCode}
                    onChange={(e) => updateAddressField("billToAddress", "zipCode", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
                <Box style={{ flex: "1", minWidth: "150px" }}>
                  <TextField.Root
                    placeholder="Country *"
                    value={formData.billToAddress.country}
                    onChange={(e) => updateAddressField("billToAddress", "country", e.target.value)}
                    size="3"
                    style={inputStyle}
                  />
                </Box>
              </Flex>
            </>
          )}
        </Flex>
      </Card>

      {/* Line Items */}
      <Card style={{ padding: "1.5rem" }}>
        <Heading size={{ initial: "4", md: "5" }} mb="4">
          Line Items
        </Heading>
        <Box style={{ overflowX: "auto" }}>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Line #
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  SKU *
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Original Code
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Quantity
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Unit Price
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Total Price
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Due Date
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Match
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)", width: "100px" }}>
                  Actions
                </Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {formData.lineItems.map((item) => (
                <Table.Row key={item.id}>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>{item.lineNumber}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="2" style={{ width: "100%" }}>
                      <Box style={{ flex: "1", minWidth: 0 }}>
                        <Select.Root
                          value={item.skuId}
                          onValueChange={(value) => updateLineItem(item.id, "skuId", value)}
                        >
                          <Select.Trigger
                            style={{
                              background: "var(--color-dark-bg-secondary)",
                              border: "1px solid var(--color-dark-bg-tertiary)",
                              color: "var(--color-text-primary)",
                              width: "100%",
                            }}
                          />
                          <Select.Content>
                            {isLoadingSkus ? (
                              <Select.Item value="loading" disabled>Loading SKUs...</Select.Item>
                            ) : skus.length === 0 ? (
                              <Select.Item value="no-skus" disabled>No SKUs available</Select.Item>
                            ) : (
                              skus.map((sku) => (
                                <Select.Item key={sku.id.toString()} value={sku.id.toString()}>
                                  {sku.sku_code} - {sku.name}
                                </Select.Item>
                              ))
                            )}
                          </Select.Content>
                        </Select.Root>
                      </Box>
                      {!item.skuId && (
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => openAddSkuModal(item)}
                          style={{
                            color: "var(--color-primary)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                          title="Add new SKU"
                        >
                          <FiPlus size={14} style={{ marginRight: "4px" }} />
                          Add
                        </Button>
                      )}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      {item.originalSkuCode}
                    </Text>
                    <Text size="1" style={{ color: "var(--color-text-secondary)", display: "block" }}>
                      {item.originalSkuDescription}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <TextField.Root
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value))}
                      size="2"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100px",
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <TextField.Root
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value))}
                      size="2"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "120px",
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>
                      ${item.totalPrice.toFixed(2)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <TextField.Root
                      type="date"
                      value={item.dueDate || ""}
                      onChange={(e) => updateLineItem(item.id, "dueDate", e.target.value || null)}
                      size="2"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "150px",
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={
                        item.matchConfidence === "full"
                          ? "green"
                          : item.matchConfidence === "partial"
                          ? "yellow"
                          : "red"
                      }
                    >
                      {item.matchConfidence}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="1"
                      variant="ghost"
                      onClick={() => removeLineItem(item.id)}
                      style={{ color: "var(--color-error)" }}
                    >
                      <FiTrash2 size={16} />
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        <Box mt="4" style={{ display: "flex", justifyContent: "flex-end" }}>
          <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)" }}>
            Total: ${getTotalAmount().toFixed(2)}
          </Text>
        </Box>
      </Card>

      {/* Notes */}
      <Card style={{ padding: "1.5rem" }}>
        <Heading size={{ initial: "4", md: "5" }} mb="4">
          Notes
        </Heading>
        <TextField.Root
          value={formData.notes}
          onChange={(e) => updateFormField("notes", e.target.value)}
          placeholder="Add any additional notes..."
          size="3"
          style={{
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
            color: "var(--color-text-primary)",
            minHeight: "100px",
          }}
        />
      </Card>

      {/* Action Buttons */}
      <Flex gap="3" justify="end">
        <Button
          type="button"
          variant="soft"
          size="3"
          onClick={handleCancel}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiX size={18} style={{ marginRight: "8px" }} />
          Cancel
        </Button>
        <Button
          type="button"
          size="3"
          onClick={handleConfirm}
          disabled={isSaving || !canSubmit}
          style={{
            background: isSaving || !canSubmit ? "var(--color-disabled-bg)" : "var(--color-primary)",
            color: isSaving || !canSubmit ? "var(--color-disabled-text)" : "var(--color-text-dark)",
            fontWeight: "600",
          }}
        >
          <FiCheck size={18} style={{ marginRight: "8px" }} />
          {isSaving ? "Creating..." : "Confirm & Create Sales Order"}
        </Button>
      </Flex>

      {/* Add SKU Modal */}
      <Dialog.Root open={addSkuModalOpen} onOpenChange={setAddSkuModalOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Add New SKU</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Create a new SKU for this line item.
          </Dialog.Description>

          <Flex direction="column" gap="4">
            <Box>
              <Text
                size="2"
                weight="medium"
                mb="2"
                as="label"
                htmlFor="skuCode"
                style={{ color: "var(--color-text-primary)" }}
              >
                SKU Code *
              </Text>
              <TextField.Root
                id="skuCode"
                value={newSkuData.skuCode}
                onChange={(e) => setNewSkuData({ ...newSkuData, skuCode: e.target.value })}
                placeholder="Enter SKU code"
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>

            <Box>
              <Text
                size="2"
                weight="medium"
                mb="2"
                as="label"
                htmlFor="skuName"
                style={{ color: "var(--color-text-primary)" }}
              >
                Name *
              </Text>
              <TextField.Root
                id="skuName"
                value={newSkuData.name}
                onChange={(e) => setNewSkuData({ ...newSkuData, name: e.target.value })}
                placeholder="Enter SKU name"
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>

            <Box>
              <Text
                size="2"
                weight="medium"
                mb="2"
                as="label"
                htmlFor="skuDescription"
                style={{ color: "var(--color-text-primary)" }}
              >
                Description
              </Text>
              <TextField.Root
                id="skuDescription"
                value={newSkuData.description}
                onChange={(e) => setNewSkuData({ ...newSkuData, description: e.target.value })}
                placeholder="Enter description (optional)"
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </Box>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isCreatingSku}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleCreateSku}
              disabled={isCreatingSku || !newSkuData.skuCode.trim() || !newSkuData.name.trim()}
              style={{
                background: isCreatingSku || !newSkuData.skuCode.trim() || !newSkuData.name.trim()
                  ? "var(--color-disabled-bg)"
                  : "var(--color-primary)",
                color: isCreatingSku || !newSkuData.skuCode.trim() || !newSkuData.name.trim()
                  ? "var(--color-disabled-text)"
                  : "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              {isCreatingSku ? "Creating..." : "Create SKU"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export default function DraftPage() {
  return (
    <ProtectedRoute>
      <DraftContent />
    </ProtectedRoute>
  );
}
