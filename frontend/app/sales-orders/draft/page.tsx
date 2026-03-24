"use client";

import { useState, useEffect } from "react";
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
import { fetchSKUs, createSKU, type SKUApiResponse, type CreateSKURequest } from "@/lib/api/services/skusService";
import { type ParsedPdfResponse } from "@/lib/api/services/pdfService";
import { toast } from "react-toastify";
import { Dialog } from "@radix-ui/themes";

interface Client {
  id: number;
  company_name: string;
}

interface ShipToAddress {
  id: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
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

interface DraftFormData {
  orderNumber: string;
  orderDate: string | null;
  dueDate: string | null;
  clientId: string;
  shipToAddressId: string;
  customerName: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipToAddress: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
  };
  billToAddress: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
  };
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
}

function DraftContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [shipToAddresses, setShipToAddresses] = useState<ShipToAddress[]>([]);
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
          dueDate: parsed?.due_date,
          clientId: parsed?.matched_client_id?.toString() || "",
          shipToAddressId: "",
          customerName: parsed?.customer_name,
          customerContact: parsed?.customer_contact,
          customerEmail: parsed?.customer_email,
          customerPhone: parsed?.customer_phone,
          shipToAddress: {
            addressLine1: parsed?.ship_to_address?.address_line_1,
            addressLine2: parsed?.ship_to_address?.address_line_2,
            city: parsed?.ship_to_address?.city,
            state: parsed?.ship_to_address?.state,
            zipCode: parsed?.ship_to_address?.zip_code,
            country: parsed?.ship_to_address?.country,
          },
          billToAddress: {
            addressLine1: parsed?.bill_to_address?.address_line_1,
            addressLine2: parsed?.bill_to_address?.address_line_2,
            city: parsed?.bill_to_address?.city,
            state: parsed?.bill_to_address?.state,
            zipCode: parsed?.bill_to_address?.zip_code,
            country: parsed?.bill_to_address?.country,
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
            dueDate: item.due_date,
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
        };
        
        setFormData(mappedFormData);
        setSelectedClientId(mappedFormData.clientId);
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

  // Load ship-to addresses when client is selected
  useEffect(() => {
    const loadAddresses = async () => {
      if (selectedClientId && formData) {
        try {
          const client = await fetchClientById(selectedClientId);
          const addresses: ShipToAddress[] = (client.addresses || []).map((addr: any) => ({
            id: addr.id.toString(),
            addressLine1: addr.address_line_1 || "",
            addressLine2: addr.address_line_2 || "",
            city: addr.city || "",
            state: addr.state || "",
            zipCode: addr.zip_code || "",
            country: addr.country || "",
          }));
          setShipToAddresses(addresses);
          
          // Try to match ship-to address from parsed data
          if (addresses.length > 0 && formData.shipToAddress.city) {
            const matched = addresses.find(
              (addr) =>
                addr.city?.toLowerCase() === formData.shipToAddress.city?.toLowerCase() &&
                addr.state?.toLowerCase() === formData.shipToAddress.state?.toLowerCase()
            );
            if (matched) {
              setFormData((prev) => prev ? { ...prev, shipToAddressId: matched.id } : null);
            }
          }
        } catch (error: any) {
          toast.error(error.message || "Failed to load addresses");
          console.error("Error loading addresses:", error);
          setShipToAddresses([]);
        }
      } else {
        setShipToAddresses([]);
      }
    };
    
    loadAddresses();
  }, [selectedClientId, formData]);

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

  const getTotalAmount = () => {
    if (!formData) return 0;
    return formData.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const handleConfirm = async () => {
    if (!formData) return;
    
    // Validation
    if (!formData.clientId) {
      toast.error("Please select a client");
      return;
    }
    
    if (!formData.shipToAddressId) {
      toast.error("Please select a ship-to address");
      return;
    }
    
    if (formData.lineItems.length === 0) {
      toast.error("At least one line item is required");
      return;
    }
    
    // Check if all line items have SKU selected
    const missingSkus = formData.lineItems.filter((item) => !item.skuId);
    if (missingSkus.length > 0) {
      toast.error("Please select SKU for all line items");
      return;
    }

    try {
      setIsSaving(true);
      
      // Map form data to API request format
      const createRequest: CreateSalesOrderRequest = {
        order_number: formData.orderNumber,
        client_id: parseInt(formData.clientId),
        ship_to_address_id: formData.shipToAddressId ? parseInt(formData.shipToAddressId) : null,
        order_date: formData.orderDate || null,
        due_date: formData.dueDate || null,
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
      
      // Add the new sales order to Redux store
      dispatch(addSalesOrder(newSalesOrder));
      
      // Clear draft data
      sessionStorage.removeItem("soDraft");
      
      router.push("/sales-orders");
    } catch (error: any) {
      toast.error(error.message || "Failed to create sales order");
      console.error("Error creating sales order:", error);
    } finally {
      setIsSaving(false);
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
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Due Date
              </Text>
              <TextField.Root
                type="date"
                value={formData.dueDate || ""}
                onChange={(e) => updateFormField("dueDate", e.target.value || null)}
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
              onValueChange={(value) => {
                updateFormField("clientId", value);
                setSelectedClientId(value);
              }}
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

          {shipToAddresses.length > 0 && (
            <Box>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Ship-To Address *
              </Text>
              <Select.Root
                value={formData.shipToAddressId}
                onValueChange={(value) => updateFormField("shipToAddressId", value)}
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
                      {addr.addressLine1}, {addr.city}, {addr.state} {addr.zipCode}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          )}

          {selectedClientId && shipToAddresses.length === 0 && (
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              No ship-to addresses available for this client. Please add addresses in the client profile.
            </Text>
          )}

          <Flex gap="4" wrap="wrap">
            <Box style={{ flex: "1", minWidth: "200px" }}>
              <Text size="2" weight="medium" mb="2" as="label" style={{ color: "var(--color-text-primary)" }}>
                Customer Contact
              </Text>
              <TextField.Root
                value={formData.customerContact || ""}
                onChange={(e) => updateFormField("customerContact", e.target.value || null)}
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
                value={formData.customerPhone || ""}
                onChange={(e) => updateFormField("customerPhone", e.target.value || null)}
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
          variant="soft"
          size="3"
          onClick={handleCancel}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiX size={18} style={{ marginRight: "8px" }} />
          Cancel
        </Button>
        <Button
          size="3"
          onClick={handleConfirm}
          disabled={isSaving || !formData.clientId || !formData.shipToAddressId}
          style={{
            background: isSaving || !formData.clientId || !formData.shipToAddressId
              ? "var(--color-disabled-bg)"
              : "var(--color-primary)",
            color: isSaving || !formData.clientId || !formData.shipToAddressId
              ? "var(--color-disabled-text)"
              : "var(--color-text-dark)",
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
