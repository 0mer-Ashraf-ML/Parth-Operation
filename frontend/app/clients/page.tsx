"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, TextField, Button, Select, DropdownMenu, Checkbox, Badge } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiTrash2, FiDownload, FiMail, FiColumns } from "react-icons/fi";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { fetchClientsAsync, deleteClientAsync, Client } from "@/lib/store/clientsSlice";
import { toast } from "react-toastify";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";
import { formatAppDateTime } from "@/lib/formatDate";

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "clients-table-column-visibility";

/** Hidden by default on narrow viewports; user can re-enable via Columns menu */
const NARROW_AUTO_HIDE_FIELDS = new Set([
  "created_at",
  "discount_percentage",
  "tax_percentage",
]);

function ClientsContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { clients, isLoading, error, lastFetched } = useAppSelector((state) => state.clients);
  const [searchText, setSearchText] = useState("");
  const [netTermsFilter, setNetTermsFilter] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Client[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const hasFetchedRef = useRef(false);
  const gridRef = useRef<AgGridReact<Client>>(null);
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

  // Fetch clients from API only if not already loaded
  useEffect(() => {
    // Check if we already have clients data
    const hasData = clients.length > 0 || lastFetched !== null;
    
    // Only fetch if we haven't fetched before and don't have data
    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchClientsAsync());
    } else if (hasData) {
      // Mark as fetched if we already have data
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredData = useMemo(() => {
    let filtered = clients;

    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (client) =>
          client.company_name.toLowerCase().includes(searchLower)
      );
    }

    // Payment terms filter
    if (netTermsFilter !== "all") {
      filtered = filtered.filter(
        (client) => client.payment_terms === parseInt(netTermsFilter)
      );
    }

    return filtered;
  }, [clients, searchText, netTermsFilter]);

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
    const clientIdsToDelete = selectedRows.map(c => c.id);
    
    try {
      // Delete each client via API
      const results = await Promise.allSettled(
        clientIdsToDelete.map(clientId =>
          dispatch(deleteClientAsync(clientId)).unwrap()
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
        toast.success(`${successful} client${successful > 1 ? "s" : ""} deactivated successfully`);
      } else if (successful > 0 && failed > 0) {
        toast.warning(`${successful} client${successful > 1 ? "s" : ""} deactivated, ${failed} failed`);
      } else if (failed > 0) {
        toast.error(`Failed to deactivate ${failed} client${failed > 1 ? "s" : ""}`);
      }
    } catch (error: any) {
      console.error("Error deleting clients:", error);
      toast.error("An error occurred while deactivating clients");
      // Still clear selection
      gridRef.current?.api.deselectAll();
      setSelectedRows([]);
      setDeleteDialogOpen(false);
    }
  };

  const handleBulkExport = () => {
    if (selectedRows.length === 0) return;
    // TODO: Implement export functionality
    console.log("Exporting clients:", selectedRows);
  };

  const handleBulkEmail = () => {
    if (selectedRows.length === 0) return;
    // TODO: Implement email functionality
    console.log("Sending email to selected clients");
  };

  // Helper function to get status color
  const getStatusColor = (isActive: boolean) => {
    return isActive ? "green" : "red";
  };

  // Helper function to get auto invoice color
  const getAutoInvoiceColor = (isOn: boolean) => {
    return isOn ? "green" : "gray";
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<Client>[]>(() => [
    {
      field: "company_name",
      headerName: "Company Name",
      flex: 2,
      minWidth: 160,
      filter: true,
      sortable: true,
      checkboxSelection: false,
      headerCheckboxSelection: true,
      lockVisible: true, // Always show Company Name (has checkbox)
    },
    {
      field: "payment_terms",
      headerName: "Payment Terms",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Client>) => {
        return `${params.value} days`;
      },
    },
    {
      field: "tax_percentage",
      headerName: "Tax %",
      flex: 1,
      minWidth: 88,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Client>) => {
        return `${parseFloat(params.value || "0").toFixed(2)}%`;
      },
    },
    {
      field: "discount_percentage",
      headerName: "Discount %",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Client>) => {
        return `${parseFloat(params.value || "0").toFixed(2)}%`;
      },
    },
    {
      field: "auto_invoice",
      headerName: "Auto Invoice",
      flex: 1,
      minWidth: 112,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Client>) => {
        const isOn = params.value === true;
        return (
          <Badge size="2" color={getAutoInvoiceColor(isOn) as any}>
            {isOn ? "ON" : "OFF"}
          </Badge>
        );
      },
    },
    {
      field: "is_active",
      headerName: "Status",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Client>) => {
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
      cellRenderer: (params: ICellRendererParams<Client>) => {
        if (!params.value) return "";
        return formatAppDateTime(params.value as string, "");
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<Client>[]>(() => {
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

  // Get all column definitions for the visibility menu (reflects narrow-screen auto-hide)
  const columnMenuItems = useMemo(() => {
    return colDefs
      .filter((col) => col.field && !col.lockVisible)
      .map((col) => ({
        field: col.field as string,
        headerName: (col.headerName || col.field) as string,
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
          <Heading size={{ initial: "6", md: "8" }}>Clients</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage your clients and customer relationships
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
            onClick={() => router.push("/clients/new")}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={18} style={{ marginRight: "8px" }} />
            Add Client
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
                const field = col.field as string;
                const isVisible = col.isVisible;
                return (
                  <DropdownMenu.Item
                    key={field}
                    onSelect={(e) => {
                      e.preventDefault();
                      setColumnVisible(field, !isVisible);
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
                        setColumnVisible(field, checked === true)
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
            placeholder="Search clients..."
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
        <Box className="w-full min-w-0 sm:w-auto sm:min-w-[180px]">
          <Select.Root
            value={netTermsFilter}
            onValueChange={setNetTermsFilter}
          >
            <Select.Trigger
              style={{
                background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
                color: "var(--color-text-primary)",
                width: "100%",
                height: "36px",
                minHeight: "36px",
              }}
            />
            <Select.Content>
              <Select.Item value="all">All Payment Terms</Select.Item>
              <Select.Item value="1">1 Day</Select.Item>
              <Select.Item value="30">30 Days</Select.Item>
              <Select.Item value="45">45 Days</Select.Item>
              <Select.Item value="60">60 Days</Select.Item>
              <Select.Item value="90">90 Days</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
      </Flex>

      {/* Action Toolbar - Shows when rows are selected */}
      {selectedRows.length > 0 && (
        <Box
          style={{
            padding: "12px 16px",
            background: "var(--color-primary-light)",
            borderRadius: "8px",
            border: "1px solid var(--color-primary-border)",
          }}
        >
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Flex align="center">
              <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                {selectedRows.length} client{selectedRows.length > 1 ? "s" : ""} selected
              </Text>
            </Flex>
            <Flex gap="2" wrap="wrap" align="center">
              <Button
                size="2"
                variant="soft"
                onClick={handleBulkEmail}
                style={{
                  color: "var(--color-text-primary)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <FiMail size={16} style={{ marginRight: "6px" }} />
                Send Email
              </Button>
              <Button
                size="2"
                variant="soft"
                onClick={handleBulkExport}
                style={{
                  color: "var(--color-text-primary)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <FiDownload size={16} style={{ marginRight: "6px" }} />
                Export
              </Button>
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
        </Box>
      )}

      <Box
        className="table-scroll-x"
        style={{
          flex: 1,
          minHeight: "500px",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          position: "relative",
        }}
      >
        {isLoading ? (
          <TableDataLoader minHeight={500} />
        ) : (
          <AgGridThemeShell>
            <AgGridReact
              ref={gridRef}
              rowData={filteredData}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50, 100]}
              animateRows={true}
              rowSelection={undefined}
              onSelectionChanged={onSelectionChanged}
              onRowClicked={(params) => {
                // Only navigate if clicking on the row, not on the checkbox
                if (params.event?.target && !(params.event.target as HTMLElement).closest('.ag-selection-checkbox')) {
                  router.push(`/clients/${params.data?.id}`);
                }
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
        description={`Are you sure you want to delete ${selectedRows.length} client${selectedRows.length > 1 ? "s" : ""}? This action cannot be undone.`}
      />
    </Flex>
  );
}

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <ClientsContent />
    </ProtectedRoute>
  );
}
