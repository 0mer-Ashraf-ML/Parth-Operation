"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { fetchPurchaseOrdersAsync, type PurchaseOrder as ReduxPurchaseOrder } from "@/lib/store/purchaseOrdersSlice";
import { Flex, Text, Heading, Box, TextField, Button, Badge, DropdownMenu, Checkbox } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiColumns, FiShoppingCart } from "react-icons/fi";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";

type POStatus = "in_production" | "packed_and_shipped" | "ready_for_pickup" | "delivered";

interface PurchaseOrder {
  id: number;
  poNumber: string;
  salesOrderId: number;
  soOrderNumber: string;
  vendorId: number;
  vendorName: string;
  clientName: string;
  shipmentType: "drop_ship" | "in_house";
  status: POStatus;
  expectedShipDate: string | null;
  expectedArrivalDate: string | null;
  lineCount: number;
  totalQuantity: number;
  createdAt: string;
}

// Helper function to map API status to frontend status
const mapStatus = (apiStatus: string): POStatus => {
  switch (apiStatus.toLowerCase()) {
    case "in_production":
      return "in_production";
    case "packed_and_shipped":
      return "packed_and_shipped";
    case "delivered":
      return "delivered";
    default:
      return "in_production";
  }
};

// Helper function to map Redux PurchaseOrder to frontend structure
const mapPurchaseOrderFromRedux = (reduxPO: ReduxPurchaseOrder): PurchaseOrder => {
  return {
    id: reduxPO.id,
    poNumber: reduxPO.po_number,
    salesOrderId: reduxPO.sales_order_id,
    soOrderNumber: reduxPO.so_order_number,
    vendorId: reduxPO.vendor_id,
    vendorName: reduxPO.vendor_name,
    clientName: reduxPO.client_name,
    shipmentType: reduxPO.shipment_type,
    status: mapStatus(reduxPO.status),
    expectedShipDate: reduxPO.expected_ship_date,
    expectedArrivalDate: reduxPO.expected_arrival_date,
    lineCount: reduxPO.line_count || 0,
    totalQuantity: reduxPO.total_quantity || 0,
    createdAt: reduxPO.created_at,
  };
};

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "purchase-orders-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set([
  "expectedShipDate",
  "expectedArrivalDate",
  "lineCount",
  "totalQuantity",
]);

function PurchaseOrdersContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { purchaseOrders, isLoading, lastFetched } = useAppSelector((state) => state.purchaseOrders);
  const [searchText, setSearchText] = useState("");
  const hasFetchedRef = useRef(false);
  const isNarrowScreen = useNarrowScreen();

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return {};
        }
      }
    }
    return {};
  });

  // Fetch purchase orders from API only if not already loaded
  useEffect(() => {
    // Check if we already have purchase orders data
    const hasData = purchaseOrders.length > 0 || lastFetched !== null;
    
    // Only fetch if we haven't fetched before and don't have data
    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchPurchaseOrdersAsync());
    } else if (hasData) {
      // Mark as fetched if we already have data
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map purchase orders from Redux to frontend structure
  const rowData = useMemo(() => {
    return purchaseOrders.map(po => mapPurchaseOrderFromRedux(po));
  }, [purchaseOrders]);

  const filteredData = useMemo(() => {
    if (!searchText) return rowData;

    const searchLower = searchText.toLowerCase();
    return rowData.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(searchLower) ||
        po.soOrderNumber.toLowerCase().includes(searchLower) ||
        po.vendorName.toLowerCase().includes(searchLower) ||
        po.clientName.toLowerCase().includes(searchLower) ||
        po.status.toLowerCase().includes(searchLower)
    );
  }, [rowData, searchText]);

  const getStatusColor = (status: POStatus) => {
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

  const getStatusLabel = (status: POStatus) => {
    switch (status) {
      case "in_production":
        return "In Production";
      case "packed_and_shipped":
        return "Packed & Shipped";
      case "ready_for_pickup":
        return "Ready for Pickup";
      case "delivered":
        return "Delivered";
      default:
        return status;
    }
  };

  const getShipmentTypeLabel = (type: "drop_ship" | "in_house") => {
    return type === "drop_ship" ? "Drop Ship" : "In House";
  };

  // Base column definitions
  const baseColDefs = useMemo<ColDef<PurchaseOrder>[]>(() => [
    {
      field: "poNumber",
      headerName: "PO Number",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
      lockVisible: true,
    },
    {
      field: "soOrderNumber",
      headerName: "SO Number",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
    },
    {
      field: "vendorName",
      headerName: "Vendor",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
    },
    {
      field: "clientName",
      headerName: "Client",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
    },
    {
      field: "shipmentType",
      headerName: "Shipment Type",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
        return (
          <Badge color={params.value === "drop_ship" ? "blue" : "purple"}>
            {getShipmentTypeLabel(params.value)}
          </Badge>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
        return (
          <Badge color={getStatusColor(params.value as POStatus)}>
            {getStatusLabel(params.value as POStatus)}
          </Badge>
        );
      },
    },
    {
      field: "expectedShipDate",
      headerName: "Expected Ship Date",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
        return params.value ? new Date(params.value).toLocaleDateString() : "-";
      },
    },
    {
      field: "expectedArrivalDate",
      headerName: "Expected Arrival Date",
      flex: 1,
      minWidth: 140,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
        return params.value ? new Date(params.value).toLocaleDateString() : "-";
      },
    },
    {
      field: "lineCount",
      headerName: "Line Items",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
    },
    {
      field: "totalQuantity",
      headerName: "Total Quantity",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<PurchaseOrder>[]>(() => {
    return baseColDefs.map((colDef) => {
      if (colDef.field && !colDef.lockVisible) {
        const field = colDef.field;
        return {
          ...colDef,
          hide: getAgGridColumnHide(
            field,
            columnVisibility,
            isNarrowScreen,
            NARROW_AUTO_HIDE_FIELDS
          ),
        };
      }
      return colDef;
    });
  }, [columnVisibility, baseColDefs, isNarrowScreen]);

  // Get all column definitions for the visibility menu
  const columnMenuItems = useMemo(() => {
    return colDefs
      .filter((col) => col.field && !col.lockVisible)
      .map((col) => ({
        field: col.field!,
        headerName: col.headerName || col.field!,
        isVisible: !col.hide,
      }));
  }, [colDefs]);

  const setColumnVisible = (field: string, visible: boolean) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [field]: visible,
    }));
  };

  // Save column visibility to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      resizable: true,
      minWidth: 80,
    };
  }, []);

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex
        align="start"
        justify="between"
        wrap="wrap"
        gap="4"
        className="w-full min-w-0"
      >
        <Box style={{ flex: "1 1 220px", minWidth: 0 }}>
          <Heading size={{ initial: "6", md: "8" }}>Purchase Orders</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage purchase orders and vendor shipments
          </Text>
        </Box>
        <Flex
          gap="3"
          wrap="wrap"
          align="center"
          justify="end"
          className="w-full min-w-0 sm:w-auto sm:ml-auto"
        >
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button
                size="3"
                variant="soft"
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiColumns size={18} />
                Columns
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              style={{
                background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
                minWidth: "220px",
                padding: "8px",
              }}
            >
              <DropdownMenu.Label
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "12px",
                  fontWeight: "600",
                  padding: "8px 12px 4px",
                  textTransform: "uppercase",
                }}
              >
                Show/Hide Columns
              </DropdownMenu.Label>
              <DropdownMenu.Separator
                style={{
                  margin: "8px 0",
                  borderTop: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
              {columnMenuItems.map((col) => {
                const isVisible = col.isVisible;
                return (
                  <DropdownMenu.Item
                    key={col.field}
                    onSelect={(e) => {
                      e.preventDefault();
                      setColumnVisible(col.field, !isVisible);
                    }}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <Checkbox
                      checked={isVisible}
                      onCheckedChange={(checked) =>
                        setColumnVisible(col.field, checked === true)
                      }
                      style={{
                        pointerEvents: "none",
                      }}
                    />
                    <Text size="2" style={{ flex: 1 }}>
                      {col.headerName}
                    </Text>
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>

      <Flex gap="3" wrap="wrap" align="center" className="w-full min-w-0">
        <Box className="w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
          <TextField.Root
            placeholder="Search purchase orders..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="3"
            style={{
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <TextField.Slot>
              <FiSearch style={{ color: "var(--color-text-secondary)" }} size={16} />
            </TextField.Slot>
          </TextField.Root>
        </Box>
      </Flex>

      <Box
        className="table-scroll-x"
        style={{
          flex: 1,
          minHeight: "500px",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
        }}
      >
        {isLoading ? (
          <TableDataLoader minHeight={500} />
        ) : (
          <div
            className="ag-theme-alpine-dark min-w-0"
            style={{
              height: "100%",
              width: "100%",
              "--ag-background-color": "var(--color-dark-bg-secondary)",
              "--ag-header-background-color": "var(--color-dark-bg-tertiary)",
              "--ag-odd-row-background-color": "var(--color-dark-bg)",
              "--ag-row-hover-color": "var(--color-primary-hover)",
              "--ag-header-foreground-color": "var(--color-text-primary)",
              "--ag-foreground-color": "var(--color-text-primary)",
              "--ag-border-color": "var(--color-dark-bg-tertiary)",
            } as React.CSSProperties}
          >
            <AgGridReact
              rowData={filteredData}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50, 100]}
              animateRows={true}
              rowSelection="single"
              onRowClicked={(params) => {
                router.push(`/purchase-orders/${params.data?.id}`);
              }}
              suppressCellFocus={true}
              rowStyle={{ cursor: "pointer" }}
            />
          </div>
        )}
      </Box>
    </Flex>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <ProtectedRoute>
      <PurchaseOrdersContent />
    </ProtectedRoute>
  );
}
