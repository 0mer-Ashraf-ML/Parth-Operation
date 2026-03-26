"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  fetchPurchaseOrdersAsync,
  type PurchaseOrder as ReduxPurchaseOrder,
} from "@/lib/store/purchaseOrdersSlice";
import {
  Flex,
  Text,
  Heading,
  Box,
  TextField,
  Button,
  Badge,
  Card,
  Separator,
  DropdownMenu,
  Checkbox,
} from "@radix-ui/themes";
import {
  FiSearch,
  FiShoppingCart,
  FiChevronDown,
  FiChevronRight,
  FiExternalLink,
  FiColumns,
  FiLayers,
  FiGrid,
} from "react-icons/fi";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { formatAppDate } from "@/lib/formatDate";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import {
  mapPoHeaderStatus,
  poHeaderStatusLabel,
  poHeaderStatusBadgeColor,
  type POHeaderStatus,
} from "@/lib/poHeaderStatusDisplay";

interface PurchaseOrder {
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
  lineCount: number;
  totalQuantity: number;
  createdAt: string;
}

interface SalesOrderGroup {
  salesOrderId: number;
  soOrderNumber: string;
  clientName: string;
  purchaseOrders: PurchaseOrder[];
}

type POListView = "by_sales_order" | "table";

const VIEW_STORAGE_KEY = "purchase-orders-list-view";
const COLUMN_VISIBILITY_STORAGE_KEY = "purchase-orders-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set([
  "expectedShipDate",
  "expectedArrivalDate",
  "lineCount",
  "totalQuantity",
]);

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
    status: mapPoHeaderStatus(reduxPO.status),
    expectedShipDate: reduxPO.expected_ship_date,
    expectedArrivalDate: reduxPO.expected_arrival_date,
    lineCount: reduxPO.line_count || 0,
    totalQuantity: reduxPO.total_quantity || 0,
    createdAt: reduxPO.created_at,
  };
};

function PurchaseOrdersContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { purchaseOrders, isLoading, lastFetched } = useAppSelector(
    (state) => state.purchaseOrders
  );
  const [searchText, setSearchText] = useState("");
  const [expandedSoIds, setExpandedSoIds] = useState<Set<number>>(() => new Set());
  const [view, setView] = useState<POListView>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "table" || saved === "by_sales_order") return saved;
    }
    return "by_sales_order";
  });
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return {};
        }
      }
    }
    return {};
  });
  const hasFetchedRef = useRef(false);
  const isNarrowScreen = useNarrowScreen();

  useEffect(() => {
    const hasData = purchaseOrders.length > 0 || lastFetched !== null;

    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchPurchaseOrdersAsync());
    } else if (hasData) {
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const rowData = useMemo(() => {
    return purchaseOrders.map((po) => mapPurchaseOrderFromRedux(po));
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

  const groups = useMemo((): SalesOrderGroup[] => {
    const map = new Map<number, PurchaseOrder[]>();
    for (const po of filteredData) {
      const list = map.get(po.salesOrderId);
      if (list) list.push(po);
      else map.set(po.salesOrderId, [po]);
    }

    const result: SalesOrderGroup[] = [];
    map.forEach((pos, salesOrderId) => {
      const sorted = [...pos].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const first = sorted[0];
      result.push({
        salesOrderId,
        soOrderNumber: first.soOrderNumber,
        clientName: first.clientName,
        purchaseOrders: sorted,
      });
    });

    result.sort((a, b) => {
      const aTime = Math.max(
        ...a.purchaseOrders.map((p) => new Date(p.createdAt).getTime())
      );
      const bTime = Math.max(
        ...b.purchaseOrders.map((p) => new Date(p.createdAt).getTime())
      );
      return bTime - aTime;
    });

    return result;
  }, [filteredData]);

  const toggleSo = useCallback((salesOrderId: number) => {
    setExpandedSoIds((prev) => {
      const next = new Set(prev);
      if (next.has(salesOrderId)) next.delete(salesOrderId);
      else next.add(salesOrderId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSoIds(new Set(groups.map((g) => g.salesOrderId)));
  }, [groups]);

  const collapseAll = useCallback(() => {
    setExpandedSoIds(new Set());
  }, []);

  const getShipmentTypeLabel = (type: "drop_ship" | "in_house") => {
    return type === "drop_ship" ? "Drop Ship" : "In House";
  };

  const baseColDefs = useMemo<ColDef<PurchaseOrder>[]>(() => {
    return [
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
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => (
          <Badge color={params.value === "drop_ship" ? "blue" : "purple"}>
            {getShipmentTypeLabel(params.value)}
          </Badge>
        ),
      },
      {
        field: "status",
        headerName: "PO status",
        flex: 1,
        minWidth: 130,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => (
          <Badge color={poHeaderStatusBadgeColor(params.value as POHeaderStatus)}>
            {poHeaderStatusLabel(params.value as POHeaderStatus)}
          </Badge>
        ),
      },
      {
        field: "expectedShipDate",
        headerName: "Expected Ship Date",
        flex: 1,
        minWidth: 130,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) =>
          params.value ? formatAppDate(params.value as string, "-") : "-",
      },
      {
        field: "expectedArrivalDate",
        headerName: "Expected Arrival Date",
        flex: 1,
        minWidth: 140,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) =>
          params.value ? formatAppDate(params.value as string, "-") : "-",
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
    ];
  }, []);

  const colDefs = useMemo<ColDef<PurchaseOrder>[]>(() => {
    return baseColDefs.map((colDef) => {
      if (colDef.field && !colDef.lockVisible) {
        const field = colDef.field;
        return {
          ...colDef,
          hide: getAgGridColumnHide(field, columnVisibility, isNarrowScreen, NARROW_AUTO_HIDE_FIELDS),
        };
      }
      return colDef;
    });
  }, [columnVisibility, baseColDefs, isNarrowScreen]);

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
    setColumnVisibility((prev) => ({ ...prev, [field]: visible }));
  };

  const defaultColDef = useMemo<ColDef>(() => ({ resizable: true, minWidth: 80 }), []);

  return (
    <Flex direction="column" gap="4" style={{ height: "100%", minHeight: 0 }}>
      <Flex
        direction={{ initial: "column", md: "row" }}
        align={{ initial: "stretch", md: "start" }}
        justify={{ initial: "start", md: "between" }}
        wrap="wrap"
        gap="4"
        className="w-full min-w-0"
      >
        <Flex align="start" gap="3" className="min-w-0 w-full md:flex-1">
          <Box
            style={{
              padding: "10px",
              background: "var(--color-primary-light)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FiShoppingCart size={22} style={{ color: "var(--color-primary)" }} />
          </Box>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Heading
              size={{ initial: "6", md: "8" }}
              style={{
                wordBreak: "normal",
                overflowWrap: "break-word",
              }}
            >
              Purchase Orders
            </Heading>
            <Text
              size="3"
              style={{
                color: "var(--color-text-secondary)",
                marginTop: "6px",
                maxWidth: "min(560px, 100%)",
              }}
            >
              {view === "by_sales_order"
                ? "By sales order — expand an SO to see its purchase orders, or switch to the table for a flat sortable list."
                : "Flat table with filters and column controls — switch to by sales order for a cleaner SO-first view."}
            </Text>
          </Box>
        </Flex>
        <Flex
          gap="2"
          wrap="wrap"
          align="center"
          justify={{ initial: "start", md: "end" }}
          className="w-full min-w-0 shrink-0 md:w-auto"
        >
          {view === "by_sales_order" && groups.length > 0 && (
            <>
              <Button
                size="2"
                variant="soft"
                onClick={expandAll}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              >
                Expand all
              </Button>
              <Button
                size="2"
                variant="soft"
                onClick={collapseAll}
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              >
                Collapse all
              </Button>
            </>
          )}
          {view === "table" && filteredData.length > 0 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button
                  size="2"
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
                  <FiColumns size={16} />
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
                        style={{ pointerEvents: "none" }}
                      />
                      <Text size="2" style={{ flex: 1 }}>
                        {col.headerName}
                      </Text>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
          <Flex
            gap="0"
            align="stretch"
            className="w-full min-w-0 md:w-auto"
            style={{
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid var(--color-dark-bg-tertiary)",
              background: "var(--color-dark-bg-secondary)",
              flexShrink: 0,
              minWidth: isNarrowScreen ? 0 : "min(100%, 268px)",
              maxWidth: "100%",
            }}
          >
            <button
              type="button"
              onClick={() => setView("by_sales_order")}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                minHeight: "40px",
                padding: "0 12px",
                margin: 0,
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "14px",
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: "nowrap",
                color:
                  view === "by_sales_order"
                    ? "var(--color-text-dark)"
                    : "var(--color-text-primary)",
                background:
                  view === "by_sales_order"
                    ? "var(--color-primary)"
                    : "transparent",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
            >
              <FiLayers size={15} style={{ flexShrink: 0 }} aria-hidden />
              <span>By SO</span>
            </button>
            <Box
              style={{
                width: "1px",
                alignSelf: "stretch",
                minHeight: "40px",
                background: "var(--color-dark-bg-tertiary)",
                flexShrink: 0,
              }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => setView("table")}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                minHeight: "40px",
                padding: "0 12px",
                margin: 0,
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "14px",
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: "nowrap",
                color:
                  view === "table" ? "var(--color-text-dark)" : "var(--color-text-primary)",
                background:
                  view === "table" ? "var(--color-primary)" : "transparent",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
            >
              <FiGrid size={15} style={{ flexShrink: 0 }} aria-hidden />
              <span>Table</span>
            </button>
          </Flex>
        </Flex>
      </Flex>

      <Box className="w-full min-w-0 max-w-2xl">
        <TextField.Root
          placeholder={
            isNarrowScreen
              ? "Search PO, SO, vendor, status…"
              : "Search by PO, SO, vendor, client, or status…"
          }
          title="Search by PO number, sales order, vendor, client, or status"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="3"
          className="w-full min-w-0"
          style={{
            width: "100%",
            minWidth: 0,
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <TextField.Slot>
            <FiSearch style={{ color: "var(--color-text-secondary)" }} size={16} />
          </TextField.Slot>
        </TextField.Root>
      </Box>

      <Box style={{ flex: 1, minHeight: "420px", minWidth: 0 }}>
        {isLoading ? (
          <TableDataLoader minHeight={420} />
        ) : filteredData.length === 0 ? (
          <Card
            style={{
              padding: "2.5rem",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
              textAlign: "center",
            }}
          >
            <Text size="3" style={{ color: "var(--color-text-secondary)" }}>
              {searchText
                ? "No purchase orders match your search."
                : "No purchase orders yet."}
            </Text>
          </Card>
        ) : view === "table" ? (
          <Box
            className="table-scroll-x"
            style={{
              height: "100%",
              minHeight: "500px",
              background: "var(--color-dark-bg-secondary)",
              borderRadius: "8px",
            }}
          >
            <AgGridThemeShell style={{ minHeight: "500px" }}>
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
            </AgGridThemeShell>
          </Box>
        ) : (
          <Flex direction="column" gap="3" className="pb-4">
            {groups.map((group) => {
              const isOpen = expandedSoIds.has(group.salesOrderId);
              const poCount = group.purchaseOrders.length;
              const completedCount = group.purchaseOrders.filter(
                (po) => po.status === "completed"
              ).length;
              const startedCount = poCount - completedCount;

              return (
                <Card
                  key={group.salesOrderId}
                  style={{
                    overflow: "hidden",
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    borderRadius: "12px",
                  }}
                >
                  <Flex
                    align="center"
                    justify="between"
                    gap="3"
                    wrap="wrap"
                    p="4"
                    style={{
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    className="po-so-header-hover"
                    onClick={() => toggleSo(group.salesOrderId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSo(group.salesOrderId);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                  >
                    <Flex align="center" gap="3" className="min-w-0 flex-1">
                      <Box
                        style={{
                          color: "var(--color-text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          flexShrink: 0,
                          padding: "6px",
                          borderRadius: "999px",
                          background: "var(--color-dark-bg-tertiary)",
                        }}
                        aria-hidden
                      >
                        {isOpen ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                      </Box>
                      <Box className="min-w-0">
                        <Flex align="center" gap="2" wrap="wrap">
                          <Text
                            size="4"
                            weight="bold"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            SO {group.soOrderNumber}
                          </Text>
                          <Badge color="gray" size="1" variant="soft">
                            {poCount} PO{poCount === 1 ? "" : "s"}
                          </Badge>
                          {startedCount > 0 && (
                            <Badge color="blue" size="1" variant="soft">
                              {startedCount} started
                            </Badge>
                          )}
                          {completedCount > 0 && (
                            <Badge color="green" size="1" variant="soft">
                              {completedCount} completed
                            </Badge>
                          )}
                        </Flex>
                        <Text
                          size="2"
                          style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}
                        >
                          {group.clientName}
                        </Text>
                      </Box>
                    </Flex>
                    <Button
                      type="button"
                      size="1"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/sales-orders/${group.salesOrderId}`);
                      }}
                      style={{
                        color: "var(--color-primary)",
                        background: "transparent",
                        border: "1px dashed var(--color-dark-bg-tertiary)",
                        borderRadius: "8px",
                        padding: "0 12px",
                        height: "30px",
                        flexShrink: 0,
                        fontWeight: 600,
                      }}
                    >
                      <FiExternalLink size={13} style={{ marginRight: "6px" }} />
                      Open SO
                    </Button>
                  </Flex>

                  {isOpen && (
                    <>
                      <Separator size="4" style={{ background: "var(--color-dark-bg-tertiary)" }} />
                      <Box style={{ padding: "0 12px 12px", background: "var(--color-dark-bg-primary)" }}>
                        <Flex
                          display={{ initial: "none", sm: "flex" }}
                          align="center"
                          gap="3"
                          px="3"
                          py="2"
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "var(--color-text-secondary)",
                            borderBottom: "1px solid var(--color-dark-bg-tertiary)",
                          }}
                        >
                          <Box style={{ flex: "1 1 100px", minWidth: 0 }}>PO</Box>
                          <Box style={{ flex: "1.2 1 140px", minWidth: 0 }}>Vendor</Box>
                          <Box style={{ flex: "0 0 100px" }}>Shipment</Box>
                          <Box style={{ flex: "0 0 120px" }}>Status</Box>
                          <Box style={{ flex: "0 0 72px", textAlign: "right" }}>Lines</Box>
                          <Box style={{ flex: "0 0 72px", textAlign: "right" }}>Qty</Box>
                          <Box style={{ flex: "0 0 100px", textAlign: "right" }}>Ship date</Box>
                        </Flex>

                        <Flex direction="column" gap="0">
                          {group.purchaseOrders.map((po, idx) => (
                            <Box key={po.id}>
                              {idx > 0 && (
                                <Separator
                                  size="4"
                                  style={{ background: "var(--color-dark-bg-tertiary)" }}
                                />
                              )}
                              <Box
                                display={{ initial: "block", sm: "none" }}
                                p="3"
                                style={{
                                  borderRadius: "10px",
                                  cursor: "pointer",
                                  border: "1px solid transparent",
                                  marginTop: "6px",
                                }}
                                className="po-po-row"
                                onClick={() => router.push(`/purchase-orders/${po.id}`)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    router.push(`/purchase-orders/${po.id}`);
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                              >
                                <Flex justify="between" align="center" width="100%" mb="2">
                                  <Text
                                    weight="bold"
                                    size="3"
                                    style={{ color: "var(--color-text-primary)" }}
                                  >
                                    {po.poNumber}
                                  </Text>
                                  <Badge color={poHeaderStatusBadgeColor(po.status)} size="1">
                                    {poHeaderStatusLabel(po.status)}
                                  </Badge>
                                </Flex>
                                <Text size="2" style={{ color: "var(--color-text-primary)" }} mb="2">
                                  {po.vendorName}
                                </Text>
                                <Flex wrap="wrap" gap="2" align="center">
                                  <Badge
                                    color={po.shipmentType === "drop_ship" ? "blue" : "purple"}
                                    size="1"
                                  >
                                    {getShipmentTypeLabel(po.shipmentType)}
                                  </Badge>
                                  <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                                    {po.lineCount} lines · {po.totalQuantity} qty · ship{" "}
                                    {formatAppDate(po.expectedShipDate)}
                                  </Text>
                                </Flex>
                              </Box>
                              <Flex
                                display={{ initial: "none", sm: "flex" }}
                                align="center"
                                gap="3"
                                p="3"
                                style={{
                                  borderRadius: "10px",
                                  cursor: "pointer",
                                  border: "1px solid transparent",
                                  marginTop: "6px",
                                }}
                                className="po-po-row"
                                onClick={() => router.push(`/purchase-orders/${po.id}`)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    router.push(`/purchase-orders/${po.id}`);
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                              >
                                <Box style={{ flex: "1 1 100px", minWidth: 0 }}>
                                  <Text weight="bold" size="2" style={{ color: "var(--color-text-primary)" }}>
                                    {po.poNumber}
                                  </Text>
                                </Box>
                                <Box style={{ flex: "1.2 1 140px", minWidth: 0 }}>
                                  <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                                    {po.vendorName}
                                  </Text>
                                </Box>
                                <Box style={{ flex: "0 0 100px" }}>
                                  <Badge
                                    color={po.shipmentType === "drop_ship" ? "blue" : "purple"}
                                    size="1"
                                  >
                                    {getShipmentTypeLabel(po.shipmentType)}
                                  </Badge>
                                </Box>
                                <Box style={{ flex: "0 0 120px" }}>
                                  <Badge color={poHeaderStatusBadgeColor(po.status)} size="1">
                                    {poHeaderStatusLabel(po.status)}
                                  </Badge>
                                </Box>
                                <Box style={{ flex: "0 0 72px", textAlign: "right" }}>
                                  <Text size="2">{po.lineCount}</Text>
                                </Box>
                                <Box style={{ flex: "0 0 72px", textAlign: "right" }}>
                                  <Text size="2">{po.totalQuantity}</Text>
                                </Box>
                                <Box style={{ flex: "0 0 100px", textAlign: "right" }}>
                                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                    {formatAppDate(po.expectedShipDate)}
                                  </Text>
                                </Box>
                              </Flex>
                            </Box>
                          ))}
                        </Flex>
                      </Box>
                    </>
                  )}
                </Card>
              );
            })}
          </Flex>
        )}
      </Box>

      <style jsx global>{`
        .po-so-header-hover:hover {
          background: var(--color-dark-bg-tertiary);
        }
        .po-po-row:hover {
          background: var(--color-dark-bg-tertiary);
          border-color: var(--color-primary);
        }
      `}</style>
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
