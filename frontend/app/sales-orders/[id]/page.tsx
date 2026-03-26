"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { notFound } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppSelector, useAppDispatch } from "@/lib/store/hooks";
import { addPurchaseOrder } from "@/lib/store/purchaseOrdersSlice";
import { 
  fetchSalesOrderById, 
  updateSalesOrder, 
  deleteSalesOrder,
  createSalesOrderLine,
  updateSalesOrderLine,
  deleteSalesOrderLine,
  generatePOs,
  type SalesOrderApiResponse, 
  type SalesOrderLineApiResponse, 
  type UpdateSalesOrderRequest,
  type CreateSalesOrderLineRequest,
  type UpdateSalesOrderLineRequest
} from "@/lib/api/services/salesOrdersService";
import { fetchSKUs } from "@/lib/api/services/skusService";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { fetchClientById } from "@/lib/api/services/clientsService";
import { isClientShipToAddress } from "@/lib/store/clientsSlice";
import { toast } from "react-toastify";
import { formatAppDate } from "@/lib/formatDate";
import {
  formatSoStatus,
  formatPaymentStatus,
  soStatusBadgeColor,
  paymentStatusBadgeColor,
  type SoUiStatus,
  type PaymentUiStatus,
} from "@/lib/salesOrderStatusDisplay";
import { useFormik } from "formik";
import * as yup from "yup";
import {
  Flex,
  Text,
  Heading,
  Box,
  Card,
  Badge,
  Table,
  Separator,
  Button,
  TextField,
  Dialog,
  Select,
} from "@radix-ui/themes";
import { 
  FiArrowLeft, 
  FiFileText, 
  FiUsers, 
  FiCalendar, 
  FiDollarSign, 
  FiMapPin, 
  FiMessageSquare,
  FiPackage,
  FiCheckCircle,
  FiClock,
  FiShoppingCart,
  FiHash,
  FiTrendingUp,
  FiPlus,
  FiSave,
  FiTrash2,
  FiEdit,
  FiX,
  FiPlayCircle,
} from "react-icons/fi";

interface SOLineItem {
  id: string;
  lineNumber: number;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  quantityInvoiced: number;
  quantityRemaining: number;
  dueDate: string | null;
}

interface SalesOrderDetail {
  id: string;
  soNumber: string;
  clientId: string;
  clientName: string;
  orderDate: string;
  status: SoUiStatus;
  paymentStatus: PaymentUiStatus;
  shipToAddressId?: number | null;
  shipToAddress: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  lineItems: SOLineItem[];
  totalAmount: number;
  notes: string;
}

interface SOUpdateFormData {
  orderNumber: string;
  shipToAddressId: string;
  orderDate: string;
  notes: string;
}

const updateValidationSchema = yup.object({
  orderNumber: yup.string().required("Order number is required"),
  shipToAddressId: yup.string(),
  orderDate: yup.string(),
  notes: yup.string(),
});


// Helper function to map API response to frontend structure
const mapSalesOrderDetailFromApi = async (apiSO: SalesOrderApiResponse): Promise<SalesOrderDetail> => {
  // Calculate total amount from line items if not provided
  const totalAmount = apiSO.total_amount || (apiSO.lines?.reduce((sum, line) => 
    sum + (line.ordered_qty * line.unit_price), 0) || 0);

  // Fetch address details if ship_to_address_id exists
  let shipToAddress = {
    addressLine1: "",
        addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  };

  if (apiSO.ship_to_address_id) {
    try {
      const client = await fetchClientById(apiSO.client_id.toString());
      const address = client.addresses?.find((addr: any) => addr.id === apiSO.ship_to_address_id);
      if (address) {
        shipToAddress = {
          addressLine1: address.address_line_1 || "",
          addressLine2: address.address_line_2 || "",
          city: address.city || "",
          state: address.state || "",
          zipCode: address.zip_code || "",
          country: address.country || "",
        };
      }
    } catch (error) {
      console.error("Error fetching address:", error);
    }
  }

  return {
    id: apiSO.id.toString(),
    soNumber: apiSO.order_number,
    clientId: apiSO.client_id.toString(),
    clientName: apiSO.client_name,
    orderDate: apiSO.order_date || "",
    status: formatSoStatus(apiSO.status),
    paymentStatus: formatPaymentStatus(apiSO.payment_status),
    shipToAddressId: apiSO.ship_to_address_id,
    shipToAddress,
    lineItems: (apiSO.lines || []).map((line: SalesOrderLineApiResponse) => ({
      id: line.id.toString(),
      lineNumber: line.line_number,
      skuId: line.sku_id.toString(),
      skuCode: line.sku_code,
      skuName: line.sku_name,
      quantity: line.ordered_qty,
      unitPrice: line.unit_price,
      totalPrice: line.ordered_qty * line.unit_price,
      quantityInvoiced: line.invoiced_qty,
      quantityRemaining: line.remaining_qty,
      dueDate: line.due_date,
    })),
    totalAmount,
    notes: apiSO.notes || "",
  };
};

// Fetch SO data from API
const fetchSOData = async (id: string): Promise<SalesOrderDetail | null> => {
  try {
    const apiSO = await fetchSalesOrderById(id);
    const mappedSO = await mapSalesOrderDetailFromApi(apiSO);
    return mappedSO;
  } catch (error: any) {
    console.error("Error fetching sales order:", error);
    return null;
  }
};

function SODetailContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const params = useParams();
  const soId = params?.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [soData, setSOData] = useState<SalesOrderDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shipToAddresses, setShipToAddresses] = useState<Array<{ id: number; label: string }>>([]);
  const [originalFormValues, setOriginalFormValues] = useState<SOUpdateFormData | null>(null);
  
  // Delete sales order state
  const [deleteSODialogOpen, setDeleteSODialogOpen] = useState(false);
  const [isDeletingSO, setIsDeletingSO] = useState(false);
  
  // Line item management state
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false);
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false);
  const [deleteLineDialogOpen, setDeleteLineDialogOpen] = useState(false);
  const [lineToEdit, setLineToEdit] = useState<SOLineItem | null>(null);
  const [lineToDelete, setLineToDelete] = useState<SOLineItem | null>(null);
  const [skus, setSkus] = useState<Array<{ id: number; code: string; name: string; unitPrice: number }>>([]);
  
  // Generate POs state
  const [generatePODialogOpen, setGeneratePODialogOpen] = useState(false);
  const [shipmentType, setShipmentType] = useState<'drop_ship' | 'in_house'>('drop_ship');
  const [isGeneratingPOs, setIsGeneratingPOs] = useState(false);
  const [isLoadingSkus, setIsLoadingSkus] = useState(false);
  
  // Line item form state
  const [lineFormData, setLineFormData] = useState({
    skuId: "",
    orderedQty: "",
    unitPrice: "",
    dueDate: "",
  });

  const formik = useFormik<SOUpdateFormData>({
    initialValues: {
      orderNumber: "",
      shipToAddressId: "",
      orderDate: "",
      notes: "",
    },
    validationSchema: updateValidationSchema,
    onSubmit: async (values) => {
      try {
        setIsSaving(true);
        const updateData: UpdateSalesOrderRequest = {
          order_number: values.orderNumber,
          ship_to_address_id: values.shipToAddressId && values.shipToAddressId !== "none" 
            ? parseInt(values.shipToAddressId) 
            : null,
          order_date: values.orderDate || null,
          notes: values.notes || null,
        };
        
        await updateSalesOrder(parseInt(soId), updateData);
        
        // Reload sales order data
        const updatedData = await fetchSOData(soId);
        if (updatedData) {
          setSOData(updatedData);
          // Update original form values
          setOriginalFormValues({
            orderNumber: updatedData.soNumber,
            shipToAddressId: updatedData.shipToAddressId?.toString() || "",
            orderDate: updatedData.orderDate || "",
            notes: updatedData.notes || "",
          });
        }
        
        toast.success("Sales order updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update sales order");
        console.error("Error updating sales order:", error);
      } finally {
        setIsSaving(false);
      }
    },
  });

  // Load SKUs for line item forms
  useEffect(() => {
    const loadSKUs = async () => {
      try {
        setIsLoadingSkus(true);
        const skuList = await fetchSKUs();
        setSkus(skuList.map((sku: any) => {
          // Get price from first tier price if available, otherwise default to 0
          const basePrice = sku.tier_prices && sku.tier_prices.length > 0
            ? parseFloat(sku.tier_prices[0].unit_price)
            : 0;
          return {
            id: sku.id,
            code: sku.sku_code,
            name: sku.name,
            unitPrice: basePrice,
          };
        }));
      } catch (error) {
        console.error("Error loading SKUs:", error);
        toast.error("Failed to load SKUs");
      } finally {
        setIsLoadingSkus(false);
      }
    };
    loadSKUs();
  }, []);

  useEffect(() => {
    const loadSO = async () => {
      try {
        setIsLoading(true);
      const data = await fetchSOData(soId);
        if (!data) {
          // Sales order not found
          router.push("/sales-orders");
          toast.error("Sales order not found");
          return;
        }
      setSOData(data);
        
        // Set form values
        formik.setValues({
          orderNumber: data.soNumber,
          shipToAddressId: data.shipToAddressId?.toString() || "",
          orderDate: data.orderDate || "",
          notes: data.notes || "",
        });
        
        // Store original values
        setOriginalFormValues({
          orderNumber: data.soNumber,
          shipToAddressId: data.shipToAddressId?.toString() || "",
          orderDate: data.orderDate || "",
          notes: data.notes || "",
        });
        
        // Load addresses for the client
        if (data.clientId) {
          try {
            const client = await fetchClientById(data.clientId);
            const shipToOnly = (client.addresses || []).filter((addr: any) => isClientShipToAddress(addr));
            const addresses = shipToOnly.map((addr: any) => ({
              id: addr.id,
              label: addr.label || `${addr.address_line_1}, ${addr.city}`,
            }));
            setShipToAddresses(addresses);
          } catch (error) {
            console.error("Error loading addresses:", error);
          }
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to load sales order");
        console.error("Error loading sales order:", error);
        router.push("/sales-orders");
      } finally {
      setIsLoading(false);
      }
    };
    if (soId) {
    loadSO();
    }
  }, [soId, router]);

  // Check if form has changed
  const hasFormChanged = useMemo(() => {
    if (!originalFormValues) return false;
    return (
      formik.values.orderNumber !== originalFormValues.orderNumber ||
      formik.values.shipToAddressId !== originalFormValues.shipToAddressId ||
      formik.values.orderDate !== originalFormValues.orderDate ||
      formik.values.notes !== originalFormValues.notes
    );
  }, [formik.values, originalFormValues]);

  const getStatusIcon = (status: SoUiStatus) => {
    switch (status) {
      case "Pending":
        return <FiClock size={14} />;
      case "Started":
        return <FiPlayCircle size={14} />;
      case "Partially Completed":
        return <FiPackage size={14} />;
      case "Completed":
        return <FiCheckCircle size={14} />;
      default:
        return null;
    }
  };

  const getPaymentStatusIcon = (ps: PaymentUiStatus) => {
    switch (ps) {
      case "Not Invoiced":
        return <FiFileText size={14} />;
      case "Partially Invoiced":
        return <FiTrendingUp size={14} />;
      case "Fully Paid":
        return <FiCheckCircle size={14} />;
      default:
        return null;
    }
  };

  // Delete sales order handler
  const handleDeleteSalesOrder = async () => {
    if (!soId) return;
    setIsDeletingSO(true);
    try {
      await deleteSalesOrder(parseInt(soId));
      toast.success("Sales order deleted successfully");
      router.push("/sales-orders");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete sales order");
      console.error("Error deleting sales order:", error);
    } finally {
      setIsDeletingSO(false);
      setDeleteSODialogOpen(false);
    }
  };

  // Add line item handler
  const handleAddLineItem = async () => {
    if (!soData || !soId) return;
    
    const skuId = parseInt(lineFormData.skuId);
    const orderedQty = parseFloat(lineFormData.orderedQty);
    const parsedUnitPrice = lineFormData.unitPrice ? parseFloat(lineFormData.unitPrice) : null;
    
    if (!skuId || !orderedQty) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSaving(true);
      const nextLineNumber = soData.lineItems.length > 0 
        ? Math.max(...soData.lineItems.map((item) => item.lineNumber || 0)) + 1
        : 1;
      
      const lineData: CreateSalesOrderLineRequest = {
        sku_id: skuId,
        line_number: nextLineNumber,
        ordered_qty: orderedQty,
        ...(parsedUnitPrice && parsedUnitPrice > 0 ? { unit_price: parsedUnitPrice } : {}),
        due_date: lineFormData.dueDate || null,
      };
      
      await createSalesOrderLine(parseInt(soId), lineData);
      
      // Reload sales order data
      const updatedData = await fetchSOData(soId);
      if (updatedData) {
        setSOData(updatedData);
      }
      
      toast.success("Line item added successfully");
      setAddLineDialogOpen(false);
      setLineFormData({ skuId: "", orderedQty: "", unitPrice: "", dueDate: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to add line item");
      console.error("Error adding line item:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Update line item handler
  const handleUpdateLineItem = async () => {
    if (!soData || !soId || !lineToEdit) return;
    
    const orderedQty = parseFloat(lineFormData.orderedQty);
    
    if (!orderedQty) {
      toast.error("Please fill in the ordered quantity");
      return;
    }

    try {
      setIsSaving(true);
      const updateData: UpdateSalesOrderLineRequest = {
        ordered_qty: orderedQty,
        due_date: lineFormData.dueDate || null,
      };
      
      await updateSalesOrderLine(parseInt(soId), parseInt(lineToEdit.id), updateData);
      
      // Reload sales order data
      const updatedData = await fetchSOData(soId);
      if (updatedData) {
        setSOData(updatedData);
      }
      
      toast.success("Line item updated successfully");
      setEditLineDialogOpen(false);
      setLineToEdit(null);
      setLineFormData({ skuId: "", orderedQty: "", unitPrice: "", dueDate: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update line item");
      console.error("Error updating line item:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete line item handler
  const handleDeleteLineItem = async () => {
    if (!soData || !soId || !lineToDelete) return;

    // Check if line item has invoices
    if (lineToDelete.quantityInvoiced > 0) {
      toast.error("Cannot delete line item with invoices. Please remove invoices first.");
      setDeleteLineDialogOpen(false);
      setLineToDelete(null);
      return;
    }

    try {
      setIsSaving(true);
      await deleteSalesOrderLine(parseInt(soId), parseInt(lineToDelete.id));
      
      // Reload sales order data
      const updatedData = await fetchSOData(soId);
      if (updatedData) {
        setSOData(updatedData);
      }
      
      toast.success("Line item deleted successfully");
      setDeleteLineDialogOpen(false);
      setLineToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete line item");
      console.error("Error deleting line item:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Open edit line dialog
  const openEditLineDialog = (line: SOLineItem) => {
    setLineToEdit(line);
    setLineFormData({
      skuId: line.skuId,
      orderedQty: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      dueDate: line.dueDate || "",
    });
    setEditLineDialogOpen(true);
  };

  // Open delete line dialog
  const openDeleteLineDialog = (line: SOLineItem) => {
    // Check if line has invoices before opening dialog
    if (line.quantityInvoiced > 0) {
      toast.error("Cannot delete line item with invoices. Please remove invoices first.");
      return;
    }
    setLineToDelete(line);
    setDeleteLineDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: "400px" }}>
        <Text>Loading...</Text>
      </Flex>
    );
  }

  // Trigger Next.js 404 handling when resource is not found
  if (!soData) {
    notFound();
  }

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
      <Flex align="center" gap="3">
        <Button
          variant="ghost"
          onClick={() => router.push("/sales-orders")}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <FiFileText size={24} style={{ color: "var(--color-primary)" }} />
        <Heading size={{ initial: "6", md: "8" }}>Sales Order Details</Heading>
        </Flex>
        <Flex gap="2">
          <Button
            variant="soft"
            size="2"
            onClick={() => setGeneratePODialogOpen(true)}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiShoppingCart size={16} style={{ marginRight: "6px" }} />
            Generate POs
          </Button>
          <Button
            variant="soft"
            color="red"
            size="2"
            onClick={() => setDeleteSODialogOpen(true)}
            style={{
              color: "var(--color-error)",
              border: "1px solid var(--color-error)",
            }}
          >
            <FiTrash2 size={16} style={{ marginRight: "6px" }} />
            Delete Sales Order
          </Button>
        </Flex>
      </Flex>

      {/* Header Information */}
      <Card style={{ padding: "1.5rem" }}>
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between" wrap="wrap" gap="4">
            <Flex align="center" gap="3">
              <Box
                style={{
                  padding: "12px",
                  background: "var(--color-primary-light)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiFileText size={24} style={{ color: "var(--color-primary)" }} />
              </Box>
              <Box>
                <Flex align="center" gap="2" mb="1">
                  <FiFileText size={14} style={{ color: "var(--color-text-secondary)" }} />
                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                    Sales Order Number
                  </Text>
                </Flex>
                <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
                  {soData.soNumber}
                </Heading>
              </Box>
            </Flex>
            <Flex align="center" gap="2" wrap="wrap">
              <Badge color={soStatusBadgeColor(soData.status)} size="2">
                <Flex align="center" gap="2">
                  {getStatusIcon(soData.status)}
                  SO: {soData.status}
                </Flex>
              </Badge>
              <Badge color={paymentStatusBadgeColor(soData.paymentStatus)} size="2">
                <Flex align="center" gap="2">
                  {getPaymentStatusIcon(soData.paymentStatus)}
                  Payment: {soData.paymentStatus}
                </Flex>
              </Badge>
            </Flex>
          </Flex>

          <Separator />

          <form onSubmit={formik.handleSubmit}>
            <Flex direction="column" gap="4">
          <Flex gap="6" wrap="wrap">
            <Box>
              <Flex align="center" gap="2" mb="2">
                <FiUsers size={14} style={{ color: "var(--color-text-secondary)" }} />
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Client
                </Text>
              </Flex>
              <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                {soData.clientName}
              </Text>
            </Box>
            <Box>
              <Flex align="center" gap="2" mb="2">
                <FiDollarSign size={14} style={{ color: "var(--color-text-secondary)" }} />
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Total Amount
                </Text>
              </Flex>
              <Text size="3" weight="bold" style={{ color: "var(--color-primary)" }}>
                ${soData.totalAmount.toFixed(2)}
              </Text>
            </Box>
          </Flex>

          <Separator />

              <Flex direction="column" gap="4">
                <Flex gap="4" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "200px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="orderNumber"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Order Number *
                    </Text>
                    <TextField.Root
                      id="orderNumber"
                      name="orderNumber"
                      value={formik.values.orderNumber}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.orderNumber && formik.errors.orderNumber
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.orderNumber && formik.errors.orderNumber && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.orderNumber}
                      </Text>
                    )}
                  </Box>

                  <Box style={{ flex: "1", minWidth: "200px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="shipToAddressId"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                Ship-To Address
              </Text>
                    <Select.Root
                      value={formik.values.shipToAddressId}
                      onValueChange={(value) => formik.setFieldValue("shipToAddressId", value)}
                    >
                      <Select.Trigger
                        id="shipToAddressId"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                          width: "100%",
                        }}
                      />
                      <Select.Content>
                        <Select.Item value="none">None</Select.Item>
                        {shipToAddresses.map((addr) => (
                          <Select.Item key={addr.id.toString()} value={addr.id.toString()}>
                            {addr.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </Box>
            </Flex>

                <Flex gap="4" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "200px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="orderDate"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Order Date
                    </Text>
                    <TextField.Root
                      id="orderDate"
                      name="orderDate"
                      type="date"
                      value={formik.values.orderDate}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
              style={{
                        background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </Box>
                </Flex>

              <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="notes"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Notes
                  </Text>
                  <TextField.Root
                    id="notes"
                    name="notes"
                    value={formik.values.notes}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    size="3"
                  style={{
                      background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                  }}
                  />
                </Box>
              </Flex>

              {/* Action Buttons - Only show when form has changed */}
              {hasFormChanged && (
                <Flex gap="3" justify="end" wrap="wrap" mt="4">
                  <Button
                    type="button"
                    variant="soft"
                    size="2"
                    onClick={() => {
                      if (originalFormValues) {
                        formik.setValues(originalFormValues);
                        // Reset to original values to hide buttons
                        setOriginalFormValues(JSON.parse(JSON.stringify(originalFormValues)));
                      }
                    }}
                    disabled={isSaving}
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="2"
                    disabled={isSaving || !formik.isValid}
                    style={{
                      background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                      color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                      fontWeight: "600",
                    }}
                  >
                    <FiSave size={16} style={{ marginRight: "6px" }} />
                    {isSaving ? "Saving..." : "Update"}
                  </Button>
                </Flex>
              )}
            </Flex>
          </form>
        </Flex>
      </Card>

      {/* Line Items Table */}
      <Card style={{ padding: "1.5rem" }}>
        <Flex align="center" justify="between" wrap="wrap" gap="3" mb="4">
          <Flex align="center" gap="3">
          <Box
            style={{
              padding: "10px",
              background: "var(--color-primary-light)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FiPackage size={20} style={{ color: "var(--color-primary)" }} />
          </Box>
          <Heading size={{ initial: "4", md: "5" }}>Line Items</Heading>
          </Flex>
          <Button
            size="2"
            onClick={() => {
              setLineFormData({ skuId: "", orderedQty: "", unitPrice: "", dueDate: "" });
              setAddLineDialogOpen(true);
            }}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={16} style={{ marginRight: "6px" }} />
            Add Line Item
          </Button>
        </Flex>
        <Box style={{ overflowX: "auto" }}>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiHash size={14} />
                    SKU Code
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiPackage size={14} />
                    SKU Name
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiDollarSign size={14} />
                    Unit Pricesss
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiShoppingCart size={14} />
                    Ordered
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiCalendar size={14} />
                    Due Date
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiFileText size={14} />
                    Invoiced
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiTrendingUp size={14} />
                    Remaining
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  <Flex align="center" gap="2">
                    <FiDollarSign size={14} />
                    Total Price
                  </Flex>
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Actions
                </Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {soData.lineItems.map((item) => (
                <Table.Row key={item.id}>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {item.skuCode}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {item.skuName}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      ${item.unitPrice.toFixed(2)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {item.quantity}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {item.dueDate ? formatAppDate(item.dueDate, "-") : "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text
                      style={{
                        color:
                          item.quantityInvoiced === item.quantity
                            ? "var(--color-primary)"
                            : "var(--color-text-primary)",
                        fontWeight: item.quantityInvoiced === item.quantity ? "600" : "400",
                      }}
                    >
                      {item.quantityInvoiced}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text
                      style={{
                        color:
                          item.quantityRemaining === 0
                            ? "var(--color-primary)"
                            : item.quantityRemaining > 0
                            ? "var(--color-text-primary)"
                            : "var(--color-error)",
                        fontWeight: item.quantityRemaining === 0 ? "600" : "400",
                      }}
                    >
                      {item.quantityRemaining}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>
                      ${item.totalPrice.toFixed(2)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => openEditLineDialog(item)}
                        style={{
                          padding: "4px 8px",
                          color: "var(--color-primary)",
                        }}
                      >
                        <FiEdit size={14} />
                      </Button>
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => openDeleteLineDialog(item)}
                        disabled={item.quantityInvoiced > 0}
                        style={{
                          padding: "4px 8px",
                          color: item.quantityInvoiced > 0 ? "var(--color-text-secondary)" : "var(--color-error)",
                          cursor: item.quantityInvoiced > 0 ? "not-allowed" : "pointer",
                        }}
                        title={item.quantityInvoiced > 0 ? "Cannot delete line item with invoices" : "Delete line item"}
                      >
                        <FiTrash2 size={14} />
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        <Separator my="4" />

        <Flex justify="end">
          <Box
            style={{
              padding: "16px 24px",
              background: "var(--color-dark-bg)",
              borderRadius: "8px",
              border: "1px solid var(--color-primary-border)",
              textAlign: "right",
            }}
          >
            <Flex align="center" gap="2" justify="end" mb="2">
              <FiDollarSign size={16} style={{ color: "var(--color-text-secondary)" }} />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Total Amount
              </Text>
            </Flex>
            <Text size="5" weight="bold" style={{ color: "var(--color-primary)" }}>
              ${soData.totalAmount.toFixed(2)}
            </Text>
          </Box>
        </Flex>
      </Card>

      {/* Delete Sales Order Dialog */}
      <DeleteConfirmationDialog
        open={deleteSODialogOpen}
        onOpenChange={setDeleteSODialogOpen}
        onConfirm={handleDeleteSalesOrder}
        title="Confirm Delete Sales Order"
        description={`Are you sure you want to delete sales order ${soData?.soNumber}? This action cannot be undone.`}
        isLoading={isDeletingSO}
      />

      {/* Add Line Item Dialog */}
      <Dialog.Root open={addLineDialogOpen} onOpenChange={setAddLineDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Add Line Item</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Add a new line item to this sales order
          </Dialog.Description>

          <Flex direction="column" gap="4">
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                SKU *
              </Text>
              <Select.Root
                value={lineFormData.skuId}
                onValueChange={(value) => {
                  setLineFormData({ ...lineFormData, skuId: value });
                  const selectedSku = skus.find((s) => s.id.toString() === value);
                  if (selectedSku) {
                    // Auto-fill unit price if available, but allow user to edit or clear it
                    setLineFormData({ 
                      ...lineFormData, 
                      skuId: value, 
                      unitPrice: selectedSku.unitPrice ? selectedSku.unitPrice.toString() : "" 
                    });
                  } else {
                    setLineFormData({ ...lineFormData, skuId: value, unitPrice: "" });
                  }
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
                  {isLoadingSkus ? (
                    <Select.Item value="loading" disabled>Loading SKUs...</Select.Item>
                  ) : skus.length === 0 ? (
                    <Select.Item value="no-skus" disabled>No SKUs available</Select.Item>
                  ) : (
                    skus.map((sku) => (
                      <Select.Item key={sku.id.toString()} value={sku.id.toString()}>
                        {sku.code} - {sku.name}
                      </Select.Item>
                    ))
                  )}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Ordered Quantity *
              </Text>
              <TextField.Root
                type="number"
                placeholder="Enter quantity"
                value={lineFormData.orderedQty}
                onChange={(e) => setLineFormData({ ...lineFormData, orderedQty: e.target.value })}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Unit Price
              </Text>
              <TextField.Root
                type="number"
                step="0.01"
                placeholder="Optional"
                value={lineFormData.unitPrice}
                onChange={(e) => setLineFormData({ ...lineFormData, unitPrice: e.target.value })}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Due Date
              </Text>
              <TextField.Root
                type="date"
                value={lineFormData.dueDate}
                onChange={(e) => setLineFormData({ ...lineFormData, dueDate: e.target.value })}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
            </Box>

            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" disabled={isSaving}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleAddLineItem}
                disabled={isSaving || !lineFormData.skuId || !lineFormData.orderedQty}
                style={{
                  background: isSaving ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                {isSaving ? "Adding..." : "Add Line Item"}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Edit Line Item Dialog */}
      <Dialog.Root open={editLineDialogOpen} onOpenChange={setEditLineDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Edit Line Item</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Update line item details
          </Dialog.Description>

          <Flex direction="column" gap="4">
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                SKU
              </Text>
              <TextField.Root
                value={lineToEdit ? `${lineToEdit.skuCode} - ${lineToEdit.skuName}` : ""}
                disabled
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Unit Price
              </Text>
              <TextField.Root
                value={lineToEdit ? `$${lineToEdit.unitPrice.toFixed(2)}` : ""}
                disabled
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
              />
              <Text size="1" style={{ color: "var(--color-text-secondary)", marginTop: "4px", display: "block" }}>
                Unit price cannot be changed after line item is created
              </Text>
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Ordered Quantity *
              </Text>
              <TextField.Root
                type="number"
                placeholder="Enter quantity"
                value={lineFormData.orderedQty}
                onChange={(e) => setLineFormData({ ...lineFormData, orderedQty: e.target.value })}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)", display: "block" }}>
                Due Date
              </Text>
              <TextField.Root
                type="date"
                value={lineFormData.dueDate}
                onChange={(e) => setLineFormData({ ...lineFormData, dueDate: e.target.value })}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
            </Box>

            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" disabled={isSaving}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleUpdateLineItem}
                disabled={isSaving || !lineFormData.orderedQty}
                style={{
                  background: isSaving ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                {isSaving ? "Updating..." : "Update Line Item"}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Generate POs Dialog */}
      <Dialog.Root open={generatePODialogOpen} onOpenChange={setGeneratePODialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Generate Purchase Orders</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Select the shipment type for generating purchase orders for this sales order.
          </Dialog.Description>

          <Flex direction="column" gap="4">
            <Box>
              <Text
                size="2"
                weight="medium"
                mb="2"
                as="label"
                style={{ color: "var(--color-text-primary)" }}
              >
                Shipment Type *
              </Text>
              <Select.Root
                value={shipmentType}
                onValueChange={(value) => setShipmentType(value as 'drop_ship' | 'in_house')}
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
                  <Select.Item value="drop_ship">Drop Ship</Select.Item>
                  <Select.Item value="in_house">In House</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isGeneratingPOs}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={async () => {
                if (!soId) return;
                
                try {
                  setIsGeneratingPOs(true);
                  const result = await generatePOs(parseInt(soId), { shipment_type: shipmentType });
                  
                  // Show success message from API
                  toast.success(result.message || "Purchase orders generated successfully");
                  
                  // Add all generated purchase orders to Redux store
                  if (result.purchase_orders && result.purchase_orders.length > 0) {
                    result.purchase_orders.forEach((po) => {
                      dispatch(addPurchaseOrder(po));
                    });
                  }
                  
                  setGeneratePODialogOpen(false);
                  
                  // Refresh the sales order data
                  if (soId) {
                    const apiSO = await fetchSalesOrderById(soId);
                    const mapped = await mapSalesOrderDetailFromApi(apiSO);
                    setSOData(mapped);
                  }
                } catch (error: any) {
                  toast.error(error.message || "Failed to generate purchase orders");
                  console.error("Error generating POs:", error);
                } finally {
                  setIsGeneratingPOs(false);
                }
              }}
              disabled={isGeneratingPOs}
              style={{
                background: isGeneratingPOs
                  ? "var(--color-disabled-bg)"
                  : "var(--color-primary)",
                color: isGeneratingPOs
                  ? "var(--color-disabled-text)"
                  : "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              {isGeneratingPOs ? "Generating..." : "Generate POs"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Delete Line Item Dialog */}
      <DeleteConfirmationDialog
        open={deleteLineDialogOpen}
        onOpenChange={setDeleteLineDialogOpen}
        onConfirm={handleDeleteLineItem}
        title="Confirm Delete Line Item"
        description={
          lineToDelete
            ? `Are you sure you want to delete line item ${lineToDelete.skuCode} - ${lineToDelete.skuName}? This action cannot be undone. Note: Line items with deliveries cannot be deleted.`
            : "Are you sure you want to delete this line item? This action cannot be undone. Note: Line items with deliveries cannot be deleted."
        }
        isLoading={isSaving}
      />
    </Flex>
  );
}

export default function SODetailPage() {
  return (
    <ProtectedRoute>
      <SODetailContent />
    </ProtectedRoute>
  );
}
