"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, TextField, Button, Badge, DropdownMenu, Checkbox } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiColumns, FiTrash2 } from "react-icons/fi";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { fetchVendorsAsync, deleteVendorAsync, Vendor } from "@/lib/store/vendorsSlice";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { toast } from "react-toastify";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";
import { formatAppDateTime } from "@/lib/formatDate";

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "vendors-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set(["email", "phone", "created_at"]);

function VendorsContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { vendors, isLoading, error, lastFetched } = useAppSelector((state) => state.vendors);
  const [searchText, setSearchText] = useState("");
  const [selectedRows, setSelectedRows] = useState<Vendor[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const hasFetchedRef = useRef(false);
  const gridRef = useRef<AgGridReact<Vendor>>(null);
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

  // Fetch full vendor list when this page mounts. Do not use vendors.length — a single
  // vendor may exist in Redux from fetchVendorById (detail page) and must not skip list fetch.
  useEffect(() => {
    const listAlreadyLoaded = lastFetched !== null;

    if (!hasFetchedRef.current && !listAlreadyLoaded && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchVendorsAsync());
    } else if (listAlreadyLoaded) {
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredData = useMemo(() => {
    if (!searchText) return vendors;
    
    const searchLower = searchText.toLowerCase();
    return vendors.filter((vendor) => {
      const name = vendor.company_name ?? "";
      const contact = vendor.contact_name ?? "";
      const email = vendor.email ?? "";
      const phone = vendor.phone ?? "";
      return (
        name.toLowerCase().includes(searchLower) ||
        contact.toLowerCase().includes(searchLower) ||
        email.toLowerCase().includes(searchLower) ||
        phone.toLowerCase().includes(searchLower)
      );
    });
  }, [vendors, searchText]);

  const onSelectionChanged = () => {
    if (gridRef.current) {
      const selectedNodes = gridRef.current.api.getSelectedRows();
      setSelectedRows(selectedNodes);
    }
  };

  const handleBulkDelete = () => {
    if (selectedRows.length === 0) return;
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    const vendorIdsToDelete = selectedRows.map(v => v.id);
    
    try {
      // Delete each vendor via API
      const results = await Promise.allSettled(
        vendorIdsToDelete.map(vendorId =>
          dispatch(deleteVendorAsync(vendorId)).unwrap()
        )
      );
      
      // Count successful and failed deletions
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      // Clear selection and close dialog
      gridRef.current?.api.deselectAll();
      setSelectedRows([]);
      setDeleteDialogOpen(false);
      
      // Show appropriate message
      if (successful > 0 && failed === 0) {
        toast.success(`${successful} vendor${successful > 1 ? "s" : ""} deactivated successfully`);
      } else if (successful > 0 && failed > 0) {
        toast.warning(`${successful} vendor${successful > 1 ? "s" : ""} deactivated, ${failed} failed`);
      } else if (failed > 0) {
        toast.error(`Failed to deactivate ${failed} vendor${failed > 1 ? "s" : ""}`);
      }
    } catch (error) {
      console.error("Error deleting vendors:", error);
      toast.error("An error occurred while deleting vendors");
    }
  };

  // Helper function to get status color
  const getStatusColor = (isActive: boolean): "green" | "red" => {
    return isActive ? "green" : "red";
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<Vendor>[]>(() => [
    {
      field: "company_name",
      headerName: "Vendor Name",
      flex: 2,
      minWidth: 160,
      filter: true,
      sortable: true,
      lockVisible: true, // Always show Vendor Name (primary identifier)
    },
    {
      field: "contact_name",
      headerName: "Contact Person",
      flex: 1,
      minWidth: 130,
      filter: true,
      sortable: true,
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 180,
      filter: true,
      sortable: true,
    },
    {
      field: "phone",
      headerName: "Phone",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Vendor>) => {
        return params.value || "—";
      },
    },
    {
      field: "is_active",
      headerName: "Status",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Vendor>) => {
        const isActive = params.value === true;
        return (
          <Badge size="2" color={getStatusColor(isActive) as any}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
    {
      field: "created_at",
      headerName: "Created At",
      flex: 1,
      minWidth: 150,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Vendor>) => {
        if (!params.value) return "";
        return formatAppDateTime(params.value as string, "");
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<Vendor>[]>(() => {
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
        field: col.field as string,
        headerName: (col.headerName as string) || col.field!,
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
          <Heading size={{ initial: "6", md: "8" }}>Vendors</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage your vendors and suppliers
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
            onClick={() => router.push("/vendors/new")}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={18} style={{ marginRight: "8px" }} />
            Add Vendor
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
            placeholder="Search vendors..."
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

      {/* Selected rows actions */}
      {selectedRows.length > 0 && (
        <Flex
          align="center"
          justify="between"
          wrap="wrap"
          gap="3"
          style={{
            padding: "12px 16px",
            background: "var(--color-dark-bg-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
            {selectedRows.length} vendor{selectedRows.length > 1 ? "s" : ""} selected
          </Text>
          <Flex gap="2" wrap="wrap">
            <Button
              size="2"
              variant="soft"
              color="red"
              onClick={handleBulkDelete}
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <FiTrash2 size={16} style={{ marginRight: "6px" }} />
              Delete
            </Button>
            <Button
              size="2"
              variant="ghost"
              onClick={() => {
                gridRef.current?.api.deselectAll();
                setSelectedRows([]);
              }}
              style={{
                color: "var(--color-text-secondary)",
                display: "flex",
                alignItems: "center",
              }}
            >
              Clear Selection
            </Button>
          </Flex>
        </Flex>
      )}

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
              ref={gridRef}
              rowData={filteredData}
              getRowId={(params) => String(params.data?.id ?? "")}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50, 100]}
              animateRows={false}
              rowSelection="multiple"
              // onSelectionChanged={onSelectionChanged}
              onRowClicked={(params) => {
                router.push(`/vendors/${params.data?.id}`);
              }}
              suppressCellFocus={true}
              rowStyle={{ cursor: "pointer" }}
            />
          </AgGridThemeShell>
        )}
      </Box>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmBulkDelete}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${selectedRows.length} vendor${selectedRows.length > 1 ? "s" : ""}? This action cannot be undone.`}
      />
    </Flex>
  );
}

export default function VendorsPage() {
  return (
    <ProtectedRoute>
      <VendorsContent />
    </ProtectedRoute>
  );
}
