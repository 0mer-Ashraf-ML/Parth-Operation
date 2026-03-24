"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch } from "@/lib/store/hooks";
import { addSalesOrder } from "@/lib/store/salesOrdersSlice";
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
} from "@radix-ui/themes";
import { FiArrowLeft, FiSave, FiTrash2, FiPlus } from "react-icons/fi";
import { createSalesOrder, type CreateSalesOrderRequest } from "@/lib/api/services/salesOrdersService";
import { fetchClients } from "@/lib/api/services/clientsService";
import { fetchClientById } from "@/lib/api/services/clientsService";
import { fetchSKUs } from "@/lib/api/services/skusService";
import { toast } from "react-toastify";

interface SOLineItem {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  dueDate: string;
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

interface SOFormData {
  clientId: string;
  shipToAddressId: string;
  lineItems: SOLineItem[];
  notes: string;
}

const validationSchema = yup.object({
  clientId: yup.string().required("Client is required"),
  shipToAddressId: yup.string().required("Ship-to address is required"),
  lineItems: yup
    .array()
    .of(
      yup.object({
        skuId: yup.string().required("SKU is required"),
        quantity: yup.number().min(1, "Quantity must be at least 1").required("Quantity is required"),
      })
    )
    .min(1, "At least one line item is required"),
});

interface Client {
  id: number;
  company_name: string;
}

interface SKU {
  id: number;
  sku_code: string;
  name: string;
  tier_prices?: Array<{
    min_qty: number;
    max_qty: number | null;
    unit_price: string;
  }>;
}

function CreateSOContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const fromPdf = searchParams?.get("fromPdf") === "true";
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [shipToAddresses, setShipToAddresses] = useState<ShipToAddress[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingSkus, setIsLoadingSkus] = useState(true);

  const formik = useFormik<SOFormData>({
    initialValues: {
      clientId: "",
      shipToAddressId: "",
      lineItems: [],
      notes: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setIsSaving(true);
        
        // Generate order number (you might want to get this from the API or use a different format)
        const orderNumber = `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        
        // Map form data to API request format
        const createRequest: CreateSalesOrderRequest = {
          order_number: orderNumber,
          client_id: parseInt(values.clientId),
          ship_to_address_id: values.shipToAddressId ? parseInt(values.shipToAddressId) : null,
          order_date: null, // Can be added to form if needed
          due_date: null, // Can be added to form if needed
          notes: values.notes || null,
          lines: values.lineItems.map((item, index) => ({
            sku_id: parseInt(item.skuId),
            line_number: index + 1,
            ordered_qty: item.quantity,
            unit_price: item.unitPrice || 0,
            due_date: item.dueDate || null,
          })),
        };
        
        const newSalesOrder = await createSalesOrder(createRequest);
        toast.success("Sales order created successfully");
        
        // Add the new sales order to Redux store
        dispatch(addSalesOrder(newSalesOrder));
        
        router.push("/sales-orders");
      } catch (error: any) {
        toast.error(error.message || "Failed to create sales order");
        console.error("Error creating sales order:", error);
      } finally {
        setIsSaving(false);
      }
    },
  });

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
    // Load draft data from PDF upload if available
    if (fromPdf) {
      const draftData = sessionStorage.getItem("soDraft");
      if (draftData) {
        try {
          const parsed = JSON.parse(draftData);
          formik.setValues(parsed);
          setSelectedClientId(parsed.clientId);
          sessionStorage.removeItem("soDraft");
        } catch (error) {
          console.error("Error parsing draft data:", error);
        }
      }
    }
  }, [fromPdf]);

  useEffect(() => {
    // Load ship-to addresses when client is selected
    const loadAddresses = async () => {
      if (selectedClientId) {
        try {
          const client = await fetchClientById(selectedClientId);
          // Map addresses from client data
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
          formik.setFieldValue("shipToAddressId", "");
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
  }, [selectedClientId]);

  const addLineItem = () => {
    const newLineItem: SOLineItem = {
      id: Date.now().toString(),
      skuId: "",
      skuCode: "",
      skuName: "",
      quantity: 1,
      unitPrice: null,
      totalPrice: 0,
      dueDate: "",
    };
    formik.setFieldValue("lineItems", [...formik.values.lineItems, newLineItem]);
  };

  const removeLineItem = (id: string) => {
    formik.setFieldValue(
      "lineItems",
      formik.values.lineItems.filter((item) => item.id !== id)
    );
  };

  const updateLineItem = (
    id: string,
    field: keyof SOLineItem,
    value: string | number | null
  ) => {
    const updatedItems = formik.values.lineItems.map((item) => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        
        // If SKU is selected, update SKU details and calculate price
        if (field === "skuId" && typeof value === "string") {
          const sku = skus.find((s) => s.id.toString() === value);
          if (sku) {
            updated.skuCode = sku.sku_code;
            updated.skuName = sku.name;
            // Get price from first tier price, or default to null (optional)
            const basePrice = sku.tier_prices && sku.tier_prices.length > 0
              ? parseFloat(sku.tier_prices[0].unit_price)
              : null;
            updated.unitPrice = basePrice;
            updated.totalPrice = updated.quantity * (basePrice || 0);
          }
        }
        
        // If quantity changes, recalculate total
        if (field === "quantity" && typeof value === "number") {
          updated.quantity = value;
          updated.totalPrice = updated.quantity * (updated.unitPrice || 0);
        }
        
        // If unit price changes, recalculate total
        if (field === "unitPrice") {
          updated.unitPrice = typeof value === "number" ? (value || null) : null;
          updated.totalPrice = updated.quantity * (updated.unitPrice || 0);
        }
        
        return updated;
      }
      return item;
    });
    formik.setFieldValue("lineItems", updatedItems);
  };

  const getTotalAmount = () => {
    return formik.values.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" gap="3">
        <Button
          variant="ghost"
          onClick={() => router.push("/sales-orders")}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <Heading size={{ initial: "6", md: "8" }}>Create Sales Order</Heading>
      </Flex>

      <form onSubmit={formik.handleSubmit}>
        <Flex direction="column" gap="6">
          {/* Client and Ship-To Selection */}
          <Card style={{ padding: "1.5rem" }}>
            <Heading size={{ initial: "4", md: "5" }} mb="4">
              Order Information
            </Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="clientId"
                  className="block"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Client *
                </Text>
                <Select.Root
                  value={formik.values.clientId}
                  onValueChange={(value) => {
                    formik.setFieldValue("clientId", value);
                    setSelectedClientId(value);
                  }}
                >
                  <Select.Trigger
                    id="clientId"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        formik.touched.clientId && formik.errors.clientId
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
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
                {formik.touched.clientId && formik.errors.clientId && (
                  <Text size="1" color="red" mt="1" className="block">
                    {formik.errors.clientId}
                  </Text>
                )}
              </Box>

              {shipToAddresses.length > 0 && (
                <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="shipToAddressId"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Ship-To Address *
                  </Text>
                  <Select.Root
                    value={formik.values.shipToAddressId}
                    onValueChange={(value) => formik.setFieldValue("shipToAddressId", value)}
                  >
                    <Select.Trigger
                      id="shipToAddressId"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.shipToAddressId && formik.errors.shipToAddressId
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
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
                  {formik.touched.shipToAddressId && formik.errors.shipToAddressId && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.shipToAddressId}
                    </Text>
                  )}
                </Box>
              )}

              {selectedClientId && shipToAddresses.length === 0 && (
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  No ship-to addresses available for this client. Please add addresses in the client profile.
                </Text>
              )}
            </Flex>
          </Card>

          {/* Line Items */}
          <Card style={{ padding: "1.5rem" }}>
            <Flex align="center" justify="between" mb="4">
              <Heading size={{ initial: "4", md: "5" }}>Line Items</Heading>
              <Button
                type="button"
                size="2"
                onClick={addLineItem}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiPlus size={16} style={{ marginRight: "4px" }} />
                Add Line Item
              </Button>
            </Flex>

            {formik.values.lineItems.length === 0 ? (
              <Box
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "var(--color-text-secondary)",
                }}
              >
                <Text>No line items added yet. Click "Add Line Item" to add one.</Text>
              </Box>
            ) : (
              <Box style={{ overflowX: "auto" }}>
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                        SKU
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
                      <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)", width: "100px" }}>
                        Actions
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {formik.values.lineItems.map((item, index) => (
                      <Table.Row key={item.id}>
                        <Table.Cell>
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
                                minWidth: "200px",
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
                        </Table.Cell>
                        <Table.Cell>
                          <TextField.Root
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(item.id, "quantity", parseInt(e.target.value))
                            }
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
                            value={item.unitPrice ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              updateLineItem(
                                item.id,
                                "unitPrice",
                                value === "" ? null : parseFloat(value) || null
                              );
                            }}
                            placeholder="Optional"
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
                            value={item.dueDate}
                            onChange={(e) =>
                              updateLineItem(item.id, "dueDate", e.target.value)
                            }
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
                          <Button
                            type="button"
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
            )}

            {formik.values.lineItems.length > 0 && (
              <Box mt="4" style={{ display: "flex", justifyContent: "flex-end" }}>
                <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                  Total: ${getTotalAmount().toFixed(2)}
                </Text>
              </Box>
            )}

            {formik.touched.lineItems && formik.errors.lineItems && (
              <Text size="1" color="red" mt="2" className="block">
                {typeof formik.errors.lineItems === "string" ? formik.errors.lineItems : "Line items are required"}
              </Text>
            )}
          </Card>

          {/* Notes */}
          <Card style={{ padding: "1.5rem" }}>
            <Heading size={{ initial: "4", md: "5" }} mb="4">
              Notes
            </Heading>
            <TextField.Root
              name="notes"
              value={formik.values.notes}
              onChange={formik.handleChange}
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
              onClick={() => router.push("/sales-orders")}
              style={{ color: "var(--color-text-primary)" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="3"
              disabled={isSaving || !formik.isValid}
              style={{
                background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              <FiSave size={18} style={{ marginRight: "8px" }} />
              {isSaving ? "Creating..." : "Create Sales Order"}
            </Button>
          </Flex>
        </Flex>
      </form>
    </Flex>
  );
}

export default function CreateSOPage() {
  return (
    <ProtectedRoute>
      <CreateSOContent />
    </ProtectedRoute>
  );
}
