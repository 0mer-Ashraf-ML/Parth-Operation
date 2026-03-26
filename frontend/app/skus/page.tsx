"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { fetchSKUsAsync, type SKU as ReduxSKU } from "@/lib/store/skusSlice";
import { Flex, Text, Heading, Box, TextField, Button, Badge, DropdownMenu, Checkbox } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiColumns } from "react-icons/fi";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";

interface SKU {
  id: number;
  skuCode: string;
  name: string;
  description: string;
  defaultVendorId: number | null;
  defaultVendorName: string;
  trackInventory: boolean;
  inventoryCount: number;
  status: string;
  tierPrices?: Array<{
    minQty: number;
    maxQty: number | null;
    unitPrice: number;
  }>;
}

// Helper function to map Redux SKU to frontend structure
const mapSKUFromRedux = (reduxSKU: ReduxSKU, vendors: Array<{ id: number; company_name: string }> = []): SKU => {
  const vendor = reduxSKU.default_vendor_id 
    ? vendors.find(v => v.id === reduxSKU.default_vendor_id) 
    : null;
  
  // Get the first tier price as base price, or default to 0
  const basePrice = reduxSKU.tier_prices && reduxSKU.tier_prices.length > 0
    ? parseFloat(reduxSKU.tier_prices[0].unit_price)
    : 0;

  return {
    id: reduxSKU.id,
    skuCode: reduxSKU.sku_code,
    name: reduxSKU.name,
    description: reduxSKU.description || "",
    defaultVendorId: reduxSKU.default_vendor_id,
    defaultVendorName: vendor?.company_name || "N/A",
    trackInventory: reduxSKU.track_inventory,
    inventoryCount: reduxSKU.inventory_count,
    status: reduxSKU.is_active ? "Active" : "Inactive",
    tierPrices: reduxSKU.tier_prices?.map(tp => ({
      minQty: tp.min_qty,
      maxQty: tp.max_qty,
      unitPrice: parseFloat(tp.unit_price),
    })),
  };
};

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "skus-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set([
  "description",
  "trackInventory",
  "inventoryCount",
]);

function SKUsContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { skus, isLoading, lastFetched } = useAppSelector((state) => state.skus);
  const { vendors } = useAppSelector((state) => state.vendors);
  const [searchText, setSearchText] = useState("");
  const hasFetchedRef = useRef(false);
  const isNarrowScreen = useNarrowScreen();

  // Column visibility state - track which columns are visible
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    // Load from localStorage if available
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

  // Fetch SKUs from API only if not already loaded
  useEffect(() => {
    // Check if we already have SKUs data
    const hasData = skus.length > 0 || lastFetched !== null;
    
    // Only fetch if we haven't fetched before and don't have data
    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchSKUsAsync());
    } else if (hasData) {
      // Mark as fetched if we already have data
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map SKUs from Redux to frontend structure
  const rowData = useMemo(() => {
    return skus.map(sku => mapSKUFromRedux(sku, vendors));
  }, [skus, vendors]);

  const filteredData = useMemo(() => {
    if (!searchText) return rowData;
    
    const searchLower = searchText.toLowerCase();
        return rowData.filter(
      (sku) =>
        sku.skuCode.toLowerCase().includes(searchLower) ||
        sku.name.toLowerCase().includes(searchLower) ||
        sku.description.toLowerCase().includes(searchLower) ||
        sku.defaultVendorName.toLowerCase().includes(searchLower)
    );
  }, [rowData, searchText]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "green";
      case "inactive":
        return "red";
      default:
        return "gray";
    }
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<SKU>[]>(() => [
    {
      field: "skuCode",
      headerName: "SKU Code",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
      lockVisible: true, // Always show SKU Code (primary identifier)
    },
    {
      field: "name",
      headerName: "Name",
      flex: 2,
      minWidth: 140,
      filter: true,
      sortable: true,
    },
    {
      field: "description",
      headerName: "Description",
      flex: 2,
      minWidth: 160,
      filter: true,
      sortable: true,
    },
    {
      field: "defaultVendorName",
      headerName: "Default Vendor",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
    },
    {
      field: "trackInventory",
      headerName: "Track Inventory",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SKU>) => {
        return params.value ? "Yes" : "No";
      },
    },
    {
      field: "inventoryCount",
      headerName: "Inventory",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SKU>) => {
        if (!params.data?.trackInventory) return "N/A";
        return params.value?.toString() || "0";
      },
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SKU>) => {
        const status = params.value || "";
        return (
          <Badge size="2" color={getStatusColor(status) as any}>
            {status}
          </Badge>
        );
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<SKU>[]>(() => {
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
  const columnMenuItems = useMemo<Array<{ field: string; headerName: string; isVisible: boolean }>>(() => {
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
          <Heading size={{ initial: "6", md: "8" }}>SKUs</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage your stock keeping units and inventory
          </Text>
        </Box>
        <Flex
          gap="3"
          wrap="wrap"
          align="center"
          justify="end"
          className="w-full min-w-0 sm:w-auto sm:ml-auto"
        >
          <Button
            size="3"
            onClick={() => router.push("/skus/new")}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={18} style={{ marginRight: "8px" }} />
            Add SKU
          </Button>
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
            placeholder="Search SKUs..."
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
          <AgGridThemeShell>
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
                router.push(`/skus/${params.data?.id}`);
              }}
              suppressCellFocus={true}
              rowStyle={{ cursor: "pointer" }}
            />
          </AgGridThemeShell>
        )}
      </Box>
    </Flex>
  );
}

export default function SKUsPage() {
  return (
    <ProtectedRoute>
      <SKUsContent />
    </ProtectedRoute>
  );
}
