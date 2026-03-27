"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { notFound } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  updatePurchaseOrder as updatePurchaseOrderInStore,
  removePurchaseOrder as removePurchaseOrderFromStore,
} from "@/lib/store/purchaseOrdersSlice";
import {
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderLine,
  updatePurchaseOrderLineStatus,
  type PurchaseOrderApiResponse,
  type PurchaseOrderLineApiResponse,
  type UpdatePurchaseOrderRequest,
  type UpdatePurchaseOrderLineRequest,
} from "@/lib/api/services/purchaseOrdersService";
import {
  getPOFulfillmentOverview,
  getPOLineFulfillment,
  type POFulfillmentEvent,
} from "@/lib/api/services/fulfillmentService";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { toast } from "react-toastify";
import { formatAppDate, formatAppDateTime } from "@/lib/formatDate";
import {
  mapPoHeaderStatus,
  poHeaderStatusLabel,
  poHeaderStatusBadgeColor,
  getPoHeaderStatusOptions,
  type POHeaderStatus,
} from "@/lib/poHeaderStatusDisplay";
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
  FiShoppingCart,
  FiPackage,
  FiTruck,
  FiCalendar,
  FiEdit,
  FiTrash2,
  FiSave,
  FiX,
  FiCheckCircle,
  FiClock,
  FiUser,
  FiCpu,
} from "react-icons/fi";

interface PurchaseOrderDetail {
  id: number;
  poNumber: string;
  salesOrderId: number;
  soOrderNumber: string;
  vendorId: number;
  vendorName: string;
  clientName: string;
  shipmentType: "drop_ship" | "in_house";
  status: POHeaderStatus;
  expectedShipDate: string | null;
  expectedArrivalDate: string | null;
  isDeletable: boolean;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
}

interface DeliveryEvent {
  id: string;
  quantity: number;
  markedBy: string;
  markedAt: string;
  source: "UI" | "AI";
  notes?: string;
  cumulativeDelivered?: number;
  remainingAfter?: number;
}

interface PurchaseOrderLine {
  id: number;
  purchaseOrderId: number;
  soLineId: number;
  skuId: number;
  skuCode: string;
  skuName: string;
  quantity: number;
  status: string;
  deliveredQty: number;
  remainingQty: number;
  isFullyDelivered: boolean;
  dueDate: string | null;
  expectedShipDate: string | null;
  expectedArrivalDate: string | null;
  createdAt: string;
  deliveryEvents?: DeliveryEvent[];
}

// Helper function to map API response to frontend structure
const mapPurchaseOrderDetailFromApi = (apiPO: PurchaseOrderApiResponse): PurchaseOrderDetail => {
  return {
    id: apiPO.id,
    poNumber: apiPO.po_number,
    salesOrderId: apiPO.sales_order_id,
    soOrderNumber: apiPO.so_order_number,
    vendorId: apiPO.vendor_id,
    vendorName: apiPO.vendor_name,
    clientName: apiPO.client_name,
    shipmentType: apiPO.shipment_type,
    status: mapPoHeaderStatus(apiPO.status),
    expectedShipDate: apiPO.expected_ship_date,
    expectedArrivalDate: apiPO.expected_arrival_date,
    isDeletable: apiPO.is_deletable,
    createdAt: apiPO.created_at,
    updatedAt: apiPO.updated_at,
    lines: (apiPO.lines || []).map((line: PurchaseOrderLineApiResponse) => ({
      id: line.id,
      purchaseOrderId: line.purchase_order_id,
      soLineId: line.so_line_id,
      skuId: line.sku_id,
      skuCode: line.sku_code,
      skuName: line.sku_name,
      quantity: line.quantity,
      status: line.status,
      deliveredQty: line.delivered_qty,
      remainingQty: line.remaining_qty,
      isFullyDelivered: line.is_fully_delivered,
      dueDate: line.due_date,
      expectedShipDate: line.expected_ship_date,
      expectedArrivalDate: line.expected_arrival_date,
      createdAt: line.created_at,
    })),
  };
};

/** Line item status workflow (granular API values; separate from PO header). */
const LINE_STATUS_PIPELINE: Record<"drop_ship" | "in_house", string[]> = {
  drop_ship: ["in_production", "packed_and_shipped", "delivered"],
  in_house: ["in_production", "packed_and_shipped", "ready_for_pickup", "delivered"],
};

const LINE_STATUS_LABEL: Record<string, string> = {
  in_production: "In Production",
  packed_and_shipped: "Pack & Ship",
  ready_for_pickup: "Ready for Pickup",
  delivered: "Delivered",
};

const getLineStatusOptions = (
  shipmentType: "drop_ship" | "in_house",
  fromStatus: string,
  options?: { vendorHideDeliveredInHouse?: boolean }
): { value: string; label: string }[] => {
  let pipeline = [...LINE_STATUS_PIPELINE[shipmentType]];
  if (options?.vendorHideDeliveredInHouse && shipmentType === "in_house") {
    pipeline = pipeline.filter((s) => s !== "delivered");
  }
  const start = pipeline.indexOf(fromStatus);
  const slice = start >= 0 ? pipeline.slice(start) : pipeline;
  return slice.map((value) => ({
    value,
    label: LINE_STATUS_LABEL[value] || value,
  }));
};

const validationSchema = yup.object({
  status: yup.string().required("Status is required"),
  shipmentType: yup.string().when("status", {
    is: "started",
    then: (schema) => schema.required("Shipment type is required"),
    otherwise: (schema) => schema.notRequired(),
  }),
  expectedShipDate: yup.string().nullable(),
  expectedArrivalDate: yup.string().nullable(),
});

interface POUpdateFormData {
  status: string;
  shipmentType: "drop_ship" | "in_house";
  expectedShipDate: string;
  expectedArrivalDate: string;
}

function PODetailContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const params = useParams();
  const poId = params?.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [poData, setPOData] = useState<PurchaseOrderDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletePODialogOpen, setDeletePODialogOpen] = useState(false);
  const [isDeletingPO, setIsDeletingPO] = useState(false);
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false);
  const [lineToEdit, setLineToEdit] = useState<PurchaseOrderLine | null>(null);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState<PurchaseOrderLine | null>(null);
  const [deliveryQuantity, setDeliveryQuantity] = useState<string>("");
  const [loadingFulfillmentLines, setLoadingFulfillmentLines] = useState<Set<number>>(new Set());
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [selectedLineForFulfillment, setSelectedLineForFulfillment] = useState<PurchaseOrderLine | null>(null);
  const [overviewModalOpen, setOverviewModalOpen] = useState(false);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [statusEditDialogOpen, setStatusEditDialogOpen] = useState(false);
  const [lineForStatusEdit, setLineForStatusEdit] = useState<PurchaseOrderLine | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const { user } = useAppSelector((state) => state.auth);

  const isVendorUser =
    user?.role?.trim().toUpperCase() === "VENDOR"

  const formik = useFormik<POUpdateFormData>({
    initialValues: {
      status: "",
      shipmentType: "drop_ship",
      expectedShipDate: "",
      expectedArrivalDate: "",
    },
    validationSchema,
    enableReinitialize: true,
    onSubmit: () => {},
  });

  const persistPurchaseOrder = async (values: POUpdateFormData) => {
    if (!poId || !poData) return false;

    try {
      await validationSchema.validate(values);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Validation failed";
      toast.error(message);
      return false;
    }

    try {
      setIsSaving(true);
      const updateData: UpdatePurchaseOrderRequest = {
        status: values.status,
        expected_ship_date: values.expectedShipDate || null,
        expected_arrival_date: values.expectedArrivalDate || null,
      };

      if (values.status === "started") {
        updateData.shipment_type = values.shipmentType;
      }

      const updatedPO = await updatePurchaseOrder(parseInt(poId), updateData);
      dispatch(updatePurchaseOrderInStore(updatedPO));
      const mapped = mapPurchaseOrderDetailFromApi(updatedPO);
      setPOData(mapped);
      formik.setValues({
        status: mapped.status,
        shipmentType: mapped.shipmentType,
        expectedShipDate: mapped.expectedShipDate || "",
        expectedArrivalDate: mapped.expectedArrivalDate || "",
      });
      toast.success("Purchase order updated");
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update purchase order";
      toast.error(message);
      console.error("Error updating purchase order:", error);
      formik.setValues({
        status: poData.status,
        shipmentType: poData.shipmentType,
        expectedShipDate: poData.expectedShipDate || "",
        expectedArrivalDate: poData.expectedArrivalDate || "",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Load purchase order data
  useEffect(() => {
    const loadPO = async () => {
      if (!poId) return;

      try {
        setIsLoading(true);
        const apiPO = await fetchPurchaseOrderById(poId);
        const mapped = mapPurchaseOrderDetailFromApi(apiPO);
        
        // Initialize lines with API data (deliveredQty and remainingQty from API)
        mapped.lines = mapped.lines.map((lineItem) => ({
          ...lineItem,
          deliveryEvents: [],
        }));
        
        setPOData(mapped);

        // Set form values
        formik.setValues({
          status: mapped.status,
          shipmentType: mapped.shipmentType,
          expectedShipDate: mapped.expectedShipDate || "",
          expectedArrivalDate: mapped.expectedArrivalDate || "",
        });
      } catch (error: any) {
        toast.error(error.message || "Failed to load purchase order");
        console.error("Error loading purchase order:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPO();
  }, [poId]);

  const handleDeletePO = async () => {
    if (!poId) return;

    try {
      setIsDeletingPO(true);
      await deletePurchaseOrder(parseInt(poId));
      dispatch(removePurchaseOrderFromStore(parseInt(poId)));
      toast.success("Purchase order deleted successfully");
      router.push("/purchase-orders");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete purchase order");
      console.error("Error deleting purchase order:", error);
    } finally {
      setIsDeletingPO(false);
      setDeletePODialogOpen(false);
    }
  };

  const openEditLineDialog = (line: PurchaseOrderLine) => {
    setLineToEdit(line);
    setEditLineDialogOpen(true);
  };

  const handleUpdateLine = async (lineData: UpdatePurchaseOrderLineRequest) => {
    if (!poId || !lineToEdit) return;

    try {
      setIsSavingLine(true);
      await updatePurchaseOrderLine(parseInt(poId), lineToEdit.id, lineData);

      // Reload PO data
      await loadPOData();

      toast.success("Line item updated successfully");
      setEditLineDialogOpen(false);
      setLineToEdit(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to update line item");
      console.error("Error updating line item:", error);
    } finally {
      setIsSavingLine(false);
    }
  };

  const handleUpdateLineStatus = async (lineId: number, status: string): Promise<boolean> => {
    if (!poId) return false;

    try {
      setIsSavingLine(true);

      const lineItem = poData?.lines.find((line) => line.id === lineId);
      if (!lineItem) {
        toast.error("Line item not found");
        return false;
      }

      await updatePurchaseOrderLine(parseInt(poId), lineId, {
        status,
        ordered_qty: lineItem.quantity,
      });

      await loadPOData();

      toast.success("Line item status updated");
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update line item status";
      toast.error(message);
      console.error("Error updating line item status:", error);
      return false;
    } finally {
      setIsSavingLine(false);
    }
  };

  const loadPOData = async () => {
    if (!poId) return;

    try {
      const apiPO = await fetchPurchaseOrderById(poId);
      const mapped = mapPurchaseOrderDetailFromApi(apiPO);
      
      // Preserve existing fulfillment data for lines that have it, otherwise use API values
      mapped.lines = mapped.lines.map((lineItem) => {
        const existingLine = poData?.lines.find((l) => l.id === lineItem.id);
        if (existingLine && existingLine.deliveryEvents && existingLine.deliveryEvents.length > 0) {
          return {
            ...lineItem,
            deliveredQty: existingLine.deliveredQty,
            remainingQty: existingLine.remainingQty,
            isFullyDelivered: existingLine.isFullyDelivered,
            deliveryEvents: existingLine.deliveryEvents,
          };
        }
        // Use API values for deliveredQty and remainingQty
        return {
          ...lineItem,
          deliveryEvents: [],
        };
      });
      
      setPOData(mapped);
    } catch (error: any) {
      console.error("Error loading purchase order:", error);
    }
  };

  const handleLoadFulfillmentData = async (lineId: number) => {
    if (!poData) return;

    try {
      setLoadingFulfillmentLines((prev) => new Set(prev).add(lineId));
      
      const events = await getPOLineFulfillment(lineId);
      
      // Calculate delivered quantity from events
      const deliveredQty = events.reduce((sum, event) => sum + event.quantity, 0);
      
      // Find the line item to get its total quantity
      const lineItem = poData.lines.find((line) => line.id === lineId);
      if (!lineItem) return;
      
      const remainingQty = lineItem.quantity - deliveredQty;
      const isFullyDelivered = remainingQty <= 0;
      
      // Calculate cumulative delivered and remaining for each event
      let cumulativeDelivered = 0;
      const deliveryEvents: DeliveryEvent[] = events.map((event) => {
        cumulativeDelivered += event.quantity;
        const remainingAfter = lineItem.quantity - cumulativeDelivered;
        
        return {
          id: event.id.toString(),
          quantity: event.quantity,
          markedBy: event.recorder_name,
          markedAt: event.created_at,
          source: event.source === "ui" ? "UI" : "AI",
          notes: event.notes || undefined,
          cumulativeDelivered,
          remainingAfter: Math.max(0, remainingAfter),
        };
      });
      
      // Update the specific line item with fulfillment data
      const updatedLines = poData.lines.map((line) => {
        if (line.id === lineId) {
          return {
            ...line,
            deliveredQty,
            remainingQty,
            isFullyDelivered,
            deliveryEvents,
          };
        }
        return line;
      });
      
      setPOData({ ...poData, lines: updatedLines });
      
      // Open modal with fulfillment data
      const updatedLine = updatedLines.find((line) => line.id === lineId);
      if (updatedLine) {
        setSelectedLineForFulfillment(updatedLine);
        setFulfillmentModalOpen(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load fulfillment data");
      console.error("Error loading fulfillment data:", error);
    } finally {
      setLoadingFulfillmentLines((prev) => {
        const newSet = new Set(prev);
        newSet.delete(lineId);
        return newSet;
      });
    }
  };

  const openDeliveryDialog = (lineItem: PurchaseOrderLine) => {
    setSelectedLineItem(lineItem);
    setDeliveryQuantity("");
    setDeliveryDialogOpen(true);
  };

  const handleRecordDelivery = async () => {
    if (!selectedLineItem || !deliveryQuantity || !poData || !poId) return;

    const quantity = parseInt(deliveryQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (quantity > selectedLineItem.remainingQty) {
      toast.error(`Cannot receive more than ${selectedLineItem.remainingQty} remaining units`);
      return;
    }

    try {
      setIsSaving(true);
      
      await updatePurchaseOrderLine(parseInt(poId), selectedLineItem.id, {
        delivered_qty: selectedLineItem.deliveredQty + quantity,
      });

      toast.success("Received quantity recorded successfully");
      
      await loadPOData();

      setDeliveryQuantity("");
      setDeliveryDialogOpen(false);
      setSelectedLineItem(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to record received quantity");
      console.error("Error recording received quantity:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const getLineStatusColor = (status: string) => {
    switch (status) {
      case "in_production":
        return "orange";
      case "packed_and_shipped":
        return "blue";
      case "ready_for_pickup":
        return "purple";
      case "delivered":
        return "green";
      default:
        return "gray";
    }
  };

  const getLineStatusLabel = (status: string) => {
    switch (status) {
      case "in_production":
        return "In Production";
      case "packed_and_shipped":
        return "Pack & Ship";
      case "ready_for_pickup":
        return "Ready for Pickup";
      case "delivered":
        return "Delivered";
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ height: "100vh" }}>
        <Text>Loading purchase order...</Text>
      </Flex>
    );
  }

  if (!poData) {
    notFound();
  }

  const hasDateChanges =
    formik.values.expectedShipDate !== (poData.expectedShipDate || "") ||
    formik.values.expectedArrivalDate !== (poData.expectedArrivalDate || "");

  const isPoCompleted = poData.status === "completed";

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <Flex align="center" gap="3">
          <Button
            variant="ghost"
            onClick={() => router.push("/purchase-orders")}
            style={{ color: "var(--color-text-primary)" }}
          >
            <FiArrowLeft size={18} />
          </Button>
          <FiShoppingCart size={24} style={{ color: "var(--color-primary)" }} />
          <Heading size={{ initial: "6", md: "8" }}>Purchase Order Details</Heading>
        </Flex>
        <Flex gap="2">
          {poData.isDeletable && (
            <Button
              variant="soft"
              color="red"
              size="2"
              onClick={() => setDeletePODialogOpen(true)}
              style={{
                color: "var(--color-error)",
                border: "1px solid var(--color-error)",
              }}
            >
              <FiTrash2 size={16} style={{ marginRight: "6px" }} />
              Delete PO
            </Button>
          )}
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
                <FiShoppingCart size={24} style={{ color: "var(--color-primary)" }} />
              </Box>
              <Box>
                <Flex align="center" gap="2" mb="1">
                  <FiShoppingCart size={14} style={{ color: "var(--color-text-secondary)" }} />
                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                    Purchase Order Number
                  </Text>
                </Flex>
                <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
                  {poData.poNumber}
                </Heading>
              </Box>
            </Flex>
            <Badge color={poHeaderStatusBadgeColor(poData.status)} size="2">
              {poHeaderStatusLabel(poData.status)}
            </Badge>
          </Flex>

          <Separator />

          <Flex direction="column" gap="4">
              <Flex gap="6" wrap="wrap">
                <Box>
                  <Flex align="center" gap="2" mb="2">
                    <FiPackage size={14} style={{ color: "var(--color-text-secondary)" }} />
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      Sales Order
                    </Text>
                  </Flex>
                  <Text
                    size="3"
                    style={{ color: "var(--color-text-primary)", cursor: "pointer" }}
                    onClick={() => router.push(`/sales-orders/${poData.salesOrderId}`)}
                  >
                    {poData.soOrderNumber}
                  </Text>
                </Box>
                <Box>
                  <Flex align="center" gap="2" mb="2">
                    <FiTruck size={14} style={{ color: "var(--color-text-secondary)" }} />
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      Vendor
                    </Text>
                  </Flex>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {poData.vendorName}
                  </Text>
                </Box>
                <Box>
                  <Flex align="center" gap="2" mb="2">
                    <FiPackage size={14} style={{ color: "var(--color-text-secondary)" }} />
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      Client
                    </Text>
                  </Flex>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {poData.clientName}
                  </Text>
                </Box>
              </Flex>

              <Separator />

              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="shipmentType"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Shipment Type
                    {/* {formik.values.status === "started" ? " *" : ""} */}
                  </Text>
                  <Select.Root
                  
                    size="3"
                    value={formik.values.shipmentType}
                    disabled={true
                      // formik.values.status !== "started" || isSaving || isPoCompleted
                    }
                    onValueChange={(value) => {
                      const newShipmentType = value as "drop_ship" | "in_house";
                      const newOptions = getPoHeaderStatusOptions(
                        mapPoHeaderStatus(formik.values.status)
                      );
                      let nextStatus = formik.values.status;
                      if (!newOptions.find((opt) => opt.value === nextStatus)) {
                        nextStatus = newOptions[0].value;
                      }
                      const next: POUpdateFormData = {
                        ...formik.values,
                        shipmentType: newShipmentType,
                        status: nextStatus,
                      };
                      formik.setFieldValue("shipmentType", newShipmentType);
                      formik.setFieldValue("status", nextStatus);
                      if (
                        newShipmentType === poData.shipmentType &&
                        nextStatus === poData.status
                      ) {
                        return;
                      }
                      void persistPurchaseOrder(next);
                    }}
                  >
                    <Select.Trigger
                      id="shipmentType"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                        opacity:
                          formik.values.status !== "started" || isPoCompleted ? 0.7 : 1,
                        cursor:
                          formik.values.status !== "started" || isPoCompleted
                            ? "not-allowed"
                            : undefined,
                      }}
                    />
                      <Select.Content>
                        <Select.Item value="drop_ship">Drop Ship</Select.Item>
                        <Select.Item value="in_house">In House</Select.Item>
                      </Select.Content>
                    </Select.Root>
                </Box>

                <Box style={{ flex: "1", minWidth: "200px"}}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="status"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    PO status *
                  </Text>
                  <Select.Root
                    size="3"
                    value={formik.values.status}
                    disabled={isSaving || isPoCompleted}
                    onValueChange={(value) => {
                      const next: POUpdateFormData = {
                        ...formik.values,
                        status: value as POHeaderStatus,
                      };
                      formik.setFieldValue("status", value);
                      const unchanged =
                        value === poData.status &&
                        formik.values.shipmentType === poData.shipmentType;
                      if (unchanged) return;
                      void persistPurchaseOrder(next);
                    }}
                  >
                    <Select.Trigger
                      id="status"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                        opacity: isPoCompleted ? 0.7 : 1,
                        cursor: isPoCompleted ? "not-allowed" : undefined,
                      }}
                    />
                    <Select.Content>
                      {getPoHeaderStatusOptions(poData.status).map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="expectedShipDate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Expected Ship Date
                  </Text>
                  <TextField.Root
                    id="expectedShipDate"
                    name="expectedShipDate"
                    type="date"
                    value={formik.values.expectedShipDate}
                    onChange={formik.handleChange}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border: "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="expectedArrivalDate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Expected Arrival Date
                  </Text>
                  <TextField.Root
                    id="expectedArrivalDate"
                    name="expectedArrivalDate"
                    type="date"
                    value={formik.values.expectedArrivalDate}
                    onChange={formik.handleChange}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border: "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </Box>
              </Flex>

              {hasDateChanges && (
                <Flex gap="3" justify="end" mt="2">
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => {
                      formik.setFieldValue(
                        "expectedShipDate",
                        poData.expectedShipDate || ""
                      );
                      formik.setFieldValue(
                        "expectedArrivalDate",
                        poData.expectedArrivalDate || ""
                      );
                    }}
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    <FiX size={16} style={{ marginRight: "6px" }} />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isSaving || !formik.isValid}
                    onClick={() => void persistPurchaseOrder(formik.values)}
                    style={{
                      background:
                        isSaving || !formik.isValid
                          ? "var(--color-disabled-bg)"
                          : "var(--color-primary)",
                      color:
                        isSaving || !formik.isValid
                          ? "var(--color-disabled-text)"
                          : "var(--color-text-dark)",
                      fontWeight: "600",
                    }}
                  >
                    <FiSave size={16} style={{ marginRight: "6px" }} />
                    {isSaving ? "Saving..." : "Save dates"}
                  </Button>
                </Flex>
              )}
            </Flex>
        </Flex>
      </Card>

      {/* Line Items */}
      <Card style={{ padding: "1.5rem" }}>
        <Flex align="center" justify="between" mb="4">
          <Heading size={{ initial: "4", md: "5" }}>
            Line Items
          </Heading>
        </Flex>
        <Box style={{ overflowX: "auto" }}>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  SKU Code
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  SKU Name
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Quantity
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Status
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Delivered
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Remaining
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Due Date
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Expected Ship Date
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                  Expected Arrival Date
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)", width: "150px" }}>
                  Actions
                </Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {poData.lines.map((line) => (
                <Table.Row key={line.id}>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>{line.skuCode}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>{line.skuName}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>{line.quantity}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <Badge color={getLineStatusColor(line.status)} size="2">
                        {getLineStatusLabel(line.status)}
                      </Badge>
                      <Button
                        size="1"
                        variant="ghost"
                        disabled={isPoCompleted}
                        onClick={() => {
                          setLineForStatusEdit(line);
                          setNewStatus(line.status);
                          setStatusEditDialogOpen(true);
                        }}
                        style={{ 
                          padding: "2px 6px",
                          color: "var(--color-text-secondary)",
                          fontSize: "11px"
                        }}
                        title={
                          isPoCompleted
                            ? "Status cannot be changed after delivery"
                            : "Update status"
                        }
                      >
                        <FiEdit size={12} />
                      </Button>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <Text
                        style={{
                          color:
                            line.isFullyDelivered
                              ? "var(--color-primary)"
                              : "var(--color-text-primary)",
                          fontWeight: line.isFullyDelivered ? "600" : "400",
                        }}
                      >
                        {line.deliveredQty}
                      </Text>
                      {line.remainingQty > 0 && (
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => openDeliveryDialog(line)}
                          style={{
                            padding: "4px 8px",
                            color: "var(--color-primary)",
                            fontSize: "11px",
                          }}
                        >
                          + Receive
                        </Button>
                      )}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {line.remainingQty}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {line.dueDate ? formatAppDate(line.dueDate, "-") : "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {line.expectedShipDate ? formatAppDate(line.expectedShipDate, "-") : "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text style={{ color: "var(--color-text-primary)" }}>
                      {line.expectedArrivalDate
                        ? formatAppDate(line.expectedArrivalDate, "-")
                        : "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2">
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => openEditLineDialog(line)}
                        style={{ color: "var(--color-primary)" }}
                      >
                        <FiEdit size={16} />
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Card>

      {/* Delete PO Dialog */}
      <DeleteConfirmationDialog
        open={deletePODialogOpen}
        onOpenChange={setDeletePODialogOpen}
        onConfirm={handleDeletePO}
        title="Confirm Delete Purchase Order"
        description="Are you sure you want to delete this purchase order? This action can only be performed when the PO is deletable (e.g. Started) and cannot be undone."
        isLoading={isDeletingPO}
      />

      {/* Edit Line Dialog */}
      <Dialog.Root open={editLineDialogOpen} onOpenChange={setEditLineDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Edit Line Item Dates</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Update vendor schedule tracking dates for this line item.
          </Dialog.Description>

          {lineToEdit && (
            <Flex direction="column" gap="4">
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)" }}>
                  SKU: {lineToEdit.skuCode} - {lineToEdit.skuName}
                </Text>
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Quantity: {lineToEdit.quantity}
                </Text>
              </Box>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Due Date
                </Text>
                <TextField.Root
                  type="date"
                  defaultValue={lineToEdit.dueDate || ""}
                  id="lineDueDate"
                  size="3"
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
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Expected Ship Date
                </Text>
                <TextField.Root
                  type="date"
                  defaultValue={lineToEdit.expectedShipDate || ""}
                  id="lineExpectedShipDate"
                  size="3"
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
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Expected Arrival Date
                </Text>
                <TextField.Root
                  type="date"
                  defaultValue={lineToEdit.expectedArrivalDate || ""}
                  id="lineExpectedArrivalDate"
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </Box>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isSavingLine}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => {
                if (!lineToEdit) return;

                const dueDateInput = document.getElementById("lineDueDate") as HTMLInputElement;
                const expectedShipDateInput = document.getElementById(
                  "lineExpectedShipDate"
                ) as HTMLInputElement;
                const expectedArrivalDateInput = document.getElementById(
                  "lineExpectedArrivalDate"
                ) as HTMLInputElement;

                const updateData: UpdatePurchaseOrderLineRequest = {
                  due_date: dueDateInput.value || null,
                  expected_ship_date: expectedShipDateInput.value || null,
                  expected_arrival_date: expectedArrivalDateInput.value || null,
                };

                handleUpdateLine(updateData);
              }}
              disabled={isSavingLine}
              style={{
                background: isSavingLine ? "var(--color-disabled-bg)" : "var(--color-primary)",
                color: isSavingLine ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              {isSavingLine ? "Saving..." : "Save Changes"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Delivery Dialog */}
      <Dialog.Root open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Record Received Quantity</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Record how many units the vendor delivered to DPM for this PO line.
          </Dialog.Description>

          {selectedLineItem && (
            <Flex direction="column" gap="4">
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)" }}>
                  SKU: {selectedLineItem.skuCode} - {selectedLineItem.skuName}
                </Text>
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Ordered: {selectedLineItem.quantity} | Remaining: {selectedLineItem.remainingQty}
                </Text>
              </Box>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="deliveryQuantity"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Received Quantity *
                </Text>
                <TextField.Root
                  id="deliveryQuantity"
                  type="number"
                  min="1"
                  max={selectedLineItem.remainingQty}
                  value={deliveryQuantity}
                  onChange={(e) => setDeliveryQuantity(e.target.value)}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </Box>

            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isSaving}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleRecordDelivery}
              disabled={isSaving || !deliveryQuantity}
              style={{
                background: isSaving || !deliveryQuantity ? "var(--color-disabled-bg)" : "var(--color-primary)",
                color: isSaving || !deliveryQuantity ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              {isSaving ? "Recording..." : "Record Received Qty"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Fulfillment Data Modal */}
      <Dialog.Root open={fulfillmentModalOpen} onOpenChange={setFulfillmentModalOpen}>
        <Dialog.Content style={{ maxWidth: 900, maxHeight: "90vh", overflowY: "auto" }}>
          <Dialog.Title>Fulfillment Data</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Delivery events and fulfillment details for this line item.
          </Dialog.Description>

          {selectedLineForFulfillment && (
            <Flex direction="column" gap="4">
              {/* Line Item Summary */}
              <Card style={{ padding: "1rem", background: "var(--color-dark-bg-secondary)" }}>
                <Flex direction="column" gap="3">
                  <Flex align="center" gap="3" mb="3">
                    <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                      SKU:
                    </Text>
                    <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                      {selectedLineForFulfillment.skuCode} - {selectedLineForFulfillment.skuName}
                    </Text>
                  </Flex>
                  <Flex gap="6" wrap="wrap">
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                        Total Ordered:
                      </Text>
                      <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                        {selectedLineForFulfillment.quantity}
                      </Text>
                    </Flex>
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                        Total Delivered:
                      </Text>
                      <Text size="3" weight="bold" style={{ color: "var(--color-primary)" }}>
                        {selectedLineForFulfillment.deliveredQty}
                      </Text>
                    </Flex>
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                        Remaining:
                      </Text>
                      <Text 
                        size="3" 
                        weight="bold" 
                        style={{ 
                          color: selectedLineForFulfillment.remainingQty > 0 
                            ? "var(--color-text-primary)" 
                            : "var(--color-primary)" 
                        }}
                      >
                        {selectedLineForFulfillment.remainingQty}
                      </Text>
                    </Flex>
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                        Progress:
                      </Text>
                      <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                        {selectedLineForFulfillment.quantity > 0 
                          ? Math.round((selectedLineForFulfillment.deliveredQty / selectedLineForFulfillment.quantity) * 100) 
                          : 0}%
                      </Text>
                    </Flex>
                  </Flex>
                </Flex>
              </Card>

              {/* Delivery Events */}
              <Box>
                <Text size="3" weight="bold" mb="3" style={{ color: "var(--color-text-primary)" }}>
                  Delivery Events ({selectedLineForFulfillment.deliveryEvents?.length || 0})
                </Text>
                {selectedLineForFulfillment.deliveryEvents && selectedLineForFulfillment.deliveryEvents.length > 0 ? (
                  <Flex direction="column" gap="3">
                    {selectedLineForFulfillment.deliveryEvents.map((event, index) => (
                      <Card
                        key={event.id}
                        style={{
                          padding: "16px",
                          background: "var(--color-dark-bg-tertiary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                        }}
                      >
                        <Flex direction="column" gap="3">
                          <Flex align="center" justify="between" wrap="wrap" gap="2">
                            <Flex align="center" gap="3" wrap="wrap">
                              <Badge
                                size="2"
                                color={event.source === "AI" ? "purple" : "blue"}
                              >
                                <Flex align="center" gap="1">
                                  {event.source === "AI" ? (
                                    <FiCpu size={12} />
                                  ) : (
                                    <FiUser size={12} />
                                  )}
                                  {event.source}
                                </Flex>
                              </Badge>
                              <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                                Event #{index + 1}: {event.quantity} units
                              </Text>
                              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                by {event.markedBy}
                              </Text>
                              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                {formatAppDateTime(event.markedAt, "—")}
                              </Text>
                            </Flex>
                          </Flex>
                          
                          <Flex align="center" gap="4" wrap="wrap" style={{ 
                            padding: "12px", 
                            background: "var(--color-dark-bg-secondary)",
                            borderRadius: "6px"
                          }}>
                            <Flex align="center" gap="2">
                              <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                Cumulative Delivered:
                              </Text>
                              <Text size="3" weight="bold" style={{ color: "var(--color-primary)" }}>
                                {event.cumulativeDelivered || 0}
                              </Text>
                            </Flex>
                            <Flex align="center" gap="2">
                              <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                Remaining After:
                              </Text>
                              <Text 
                                size="3" 
                                weight="bold" 
                                style={{ 
                                  color: (event.remainingAfter || 0) > 0 
                                    ? "var(--color-text-primary)" 
                                    : "var(--color-primary)" 
                                }}
                              >
                                {event.remainingAfter || 0}
                              </Text>
                            </Flex>
                            <Flex align="center" gap="2">
                              <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                Progress:
                              </Text>
                              <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                                {selectedLineForFulfillment.quantity > 0 
                                  ? Math.round(((event.cumulativeDelivered || 0) / selectedLineForFulfillment.quantity) * 100) 
                                  : 0}%
                              </Text>
                            </Flex>
                          </Flex>
                          
                          {event.notes && (
                            <Box style={{
                              padding: "8px 12px",
                              background: "var(--color-dark-bg-secondary)",
                              borderRadius: "6px",
                              borderLeft: "3px solid var(--color-primary)",
                            }}>
                              <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "8px", display: "block" }}>
                                Notes:
                              </Text>
                              <Text size="2" style={{ color: "var(--color-text-primary)", fontStyle: "italic" }}>
                                {event.notes}
                              </Text>
                            </Box>
                          )}
                        </Flex>
                      </Card>
                    ))}
                  </Flex>
                ) : (
                  <Card style={{ padding: "2rem", textAlign: "center", background: "var(--color-dark-bg-secondary)" }}>
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      No delivery events recorded yet.
                    </Text>
                  </Card>
                )}
              </Box>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                style={{ color: "var(--color-text-primary)" }}
              >
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Fulfillment Overview Modal */}
      <Dialog.Root open={overviewModalOpen} onOpenChange={setOverviewModalOpen}>
        <Dialog.Content style={{ maxWidth: 1000, maxHeight: "90vh", overflowY: "auto" }}>
          <Dialog.Title>Fulfillment Overview</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Overview of all line items fulfillment and events for this purchase order.
          </Dialog.Description>

          {overviewData && (
            <Flex direction="column" gap="4">
              <Card style={{ padding: "1rem", background: "var(--color-dark-bg-secondary)" }}>
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="3">
                    <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                      PO Number:
                    </Text>
                    <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                      {overviewData.po_number}
                    </Text>
                  </Flex>
                  <Flex align="center" gap="3">
                    <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                      Status:
                    </Text>
                    <Badge
                      color={poHeaderStatusBadgeColor(mapPoHeaderStatus(overviewData.status))}
                      size="2"
                    >
                      {poHeaderStatusLabel(mapPoHeaderStatus(overviewData.status))}
                    </Badge>
                  </Flex>
                </Flex>
              </Card>

              <Box>
                <Text size="3" weight="bold" mb="3" style={{ color: "var(--color-text-primary)" }}>
                  Line Items ({overviewData.lines?.length || 0})
                </Text>
                {overviewData.lines && overviewData.lines.length > 0 ? (
                  <Flex direction="column" gap="3">
                    {overviewData.lines.map((line: any) => {
                      const cumulativeDelivered = line.events?.reduce((sum: number, event: any) => sum + event.quantity, 0) || 0;
                      const remaining = line.quantity - cumulativeDelivered;
                      
                      return (
                        <Card
                          key={line.po_line_id}
                          style={{
                            padding: "16px",
                            background: "var(--color-dark-bg-tertiary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                          }}
                        >
                          <Flex direction="column" gap="3">
                            <Flex align="center" justify="between" wrap="wrap" gap="2">
                              <Flex align="center" gap="3" wrap="wrap">
                                <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                                  {line.sku_code} - {line.sku_name}
                                </Text>
                                <Badge size="2" color={line.is_fully_delivered ? "green" : "orange"}>
                                  {line.is_fully_delivered ? "Fully Delivered" : "In Progress"}
                                </Badge>
                              </Flex>
                              <Flex align="center" gap="4" wrap="wrap">
                                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                  Ordered: <strong style={{ color: "var(--color-text-primary)" }}>{line.quantity}</strong>
                                </Text>
                                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                  Delivered: <strong style={{ color: "var(--color-primary)" }}>{line.delivered_qty}</strong>
                                </Text>
                                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                  Remaining: <strong style={{ color: remaining > 0 ? "var(--color-text-primary)" : "var(--color-primary)" }}>{remaining}</strong>
                                </Text>
                                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                  Events: <strong style={{ color: "var(--color-text-primary)" }}>{line.event_count || 0}</strong>
                                </Text>
                              </Flex>
                            </Flex>

                            {line.events && line.events.length > 0 && (
                              <Box style={{ 
                                padding: "12px", 
                                background: "var(--color-dark-bg-secondary)",
                                borderRadius: "6px",
                                marginTop: "8px"
                              }}>
                                <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)" }}>
                                  Delivery Events:
                                </Text>
                                <Flex direction="column" gap="2">
                                  {line.events.map((event: any, index: number) => (
                                    <Flex key={event.id} align="center" gap="3" wrap="wrap" style={{
                                      padding: "8px",
                                      background: "var(--color-dark-bg-tertiary)",
                                      borderRadius: "4px"
                                    }}>
                                      <Badge size="1" color={event.source === "ui" ? "blue" : "purple"}>
                                        {event.source === "ui" ? "UI" : "AI"}
                                      </Badge>
                                      <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                                        Event #{index + 1}: {event.quantity} units
                                      </Text>
                                      <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                        by {event.recorder_name}
                                      </Text>
                                      <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                        {formatAppDateTime(event.created_at, "—")}
                                      </Text>
                                      {event.notes && (
                                        <Text size="1" style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>
                                          {event.notes}
                                        </Text>
                                      )}
                                    </Flex>
                                  ))}
                                </Flex>
                              </Box>
                            )}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                ) : (
                  <Card style={{ padding: "2rem", textAlign: "center", background: "var(--color-dark-bg-secondary)" }}>
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      No line items found.
                    </Text>
                  </Card>
                )}
              </Box>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                style={{ color: "var(--color-text-primary)" }}
              >
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Update Status Dialog */}
      <Dialog.Root open={statusEditDialogOpen} onOpenChange={setStatusEditDialogOpen}>
        <Dialog.Content style={{ maxWidth: 400 }}>
          <Dialog.Title>Update Line Item Status</Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            Update the status for this line item.
          </Dialog.Description>

          {lineForStatusEdit && (
            <Flex direction="column" gap="4">
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ color: "var(--color-text-primary)" }}>
                  SKU: {lineForStatusEdit.skuCode} - {lineForStatusEdit.skuName}
                </Text>
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Quantity: {lineForStatusEdit.quantity}
                </Text>
              </Box>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="status"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Status *
                </Text>
                <Select.Root
                  value={newStatus}
                  disabled={isSavingLine || isPoCompleted}
                  onValueChange={async (value) => {
                    if (!lineForStatusEdit || value === lineForStatusEdit.status) return;
                    setNewStatus(value);
                    const ok = await handleUpdateLineStatus(lineForStatusEdit.id, value);
                    if (ok) {
                      setStatusEditDialogOpen(false);
                      setLineForStatusEdit(null);
                      setNewStatus("");
                    }
                  }}
                >
                  <Select.Trigger
                    id="status"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border: "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                      width: "100%",
                    }}
                  />
                  <Select.Content>
                    {poData &&
                      lineForStatusEdit &&
                      getLineStatusOptions(poData.shipmentType, lineForStatusEdit.status, {
                        vendorHideDeliveredInHouse:
                          isVendorUser && poData.shipmentType === "in_house",
                      }).map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                  </Select.Content>
                </Select.Root>
              </Box>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isSavingLine}
                style={{ color: "var(--color-text-primary)" }}
              >
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export default function PODetailPage() {
  return (
    <ProtectedRoute>
      <PODetailContent />
    </ProtectedRoute>
  );
}
