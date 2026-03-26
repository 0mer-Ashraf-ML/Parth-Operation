"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { fetchSalesOrdersAsync, type SalesOrder as ReduxSalesOrder } from "@/lib/store/salesOrdersSlice";
import { Flex, Text, Heading, Box, TextField, Button, Badge, DropdownMenu, Checkbox, Dialog } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiUpload, FiColumns, FiCheckCircle, FiX } from "react-icons/fi";
import { parsePdf, type ParsedPdfResponse } from "@/lib/api/services/pdfService";
import { toast } from "react-toastify";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";
import { formatAppDate } from "@/lib/formatDate";
import {
  formatSoStatus,
  formatPaymentStatus,
  soStatusBadgeColor,
  paymentStatusBadgeColor,
  type SoUiStatus,
  type PaymentUiStatus,
} from "@/lib/salesOrderStatusDisplay";

interface SalesOrder {
  id: number;
  soNumber: string;
  clientName: string;
  clientId: number;
  orderDate: string | null;
  status: SoUiStatus;
  paymentStatus: PaymentUiStatus;
  totalAmount: number;
  lineItemsCount: number;
}

const mapSalesOrderFromRedux = (reduxSO: ReduxSalesOrder): SalesOrder => {
  return {
    id: reduxSO.id,
    soNumber: reduxSO.order_number,
    clientName: reduxSO.client_name,
    clientId: reduxSO.client_id,
    orderDate: reduxSO.order_date,
    status: formatSoStatus(reduxSO.status),
    paymentStatus: formatPaymentStatus(reduxSO.payment_status),
    totalAmount: reduxSO.total_amount || 0,
    lineItemsCount: reduxSO.line_count || 0,
  };
};

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "sales-orders-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set(["orderDate", "lineItemsCount", "paymentStatus"]);

function SalesOrdersContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { salesOrders, isLoading, lastFetched } = useAppSelector((state) => state.salesOrders);
  const [searchText, setSearchText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Fetch sales orders from API only if not already loaded
  useEffect(() => {
    // Check if we already have sales orders data
    const hasData = salesOrders.length > 0 || lastFetched !== null;
    
    // Only fetch if we haven't fetched before and don't have data
    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchSalesOrdersAsync());
    } else if (hasData) {
      // Mark as fetched if we already have data
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map sales orders from Redux to frontend structure
  const rowData = useMemo(() => {
    return salesOrders.map(so => mapSalesOrderFromRedux(so));
  }, [salesOrders]);

  const filteredData = useMemo(() => {
    if (!searchText) return rowData;
    
    const searchLower = searchText.toLowerCase();
    return rowData.filter(
      (so) =>
        so.soNumber.toLowerCase().includes(searchLower) ||
        so.clientName.toLowerCase().includes(searchLower) ||
        so.status.toLowerCase().includes(searchLower) ||
        so.paymentStatus.toLowerCase().includes(searchLower)
    );
  }, [rowData, searchText]);

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<SalesOrder>[]>(() => [
    {
      field: "soNumber",
      headerName: "SO Number",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      lockVisible: true, // Always show SO Number (primary identifier)
    },
    {
      field: "clientName",
      headerName: "Client",
      flex: 2,
      minWidth: 140,
      filter: true,
      sortable: true,
    },
    {
      field: "orderDate",
      headerName: "Order Date",
      flex: 1,
      minWidth: 118,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SalesOrder>) =>
        params.value ? formatAppDate(params.value as string, "—") : "—",
    },
    {
      field: "status",
      headerName: "SO status",
      flex: 1,
      minWidth: 140,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SalesOrder>) => {
        const st = params.value as SoUiStatus;
        return <Badge color={soStatusBadgeColor(st)}>{st}</Badge>;
      },
    },
    {
      field: "paymentStatus",
      headerName: "Payment",
      flex: 1,
      minWidth: 140,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SalesOrder>) => {
        const ps = params.value as PaymentUiStatus;
        return <Badge color={paymentStatusBadgeColor(ps)}>{ps}</Badge>;
      },
    },
    {
      field: "lineItemsCount",
      headerName: "Line Items",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
    },
    {
      field: "totalAmount",
      headerName: "Total Amount",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<SalesOrder>) => {
        return `$${params.value?.toFixed(2)}`;
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<SalesOrder>[]>(() => {
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

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if file is PDF
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus("error");
      setUploadMessage("Please upload a PDF file");
      setUploadDialogOpen(true);
      event.target.value = "";
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadStatus("error");
      setUploadMessage("File size must be less than 10MB");
      setUploadDialogOpen(true);
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadStatus("processing");
    setUploadMessage("Processing PDF file...");
    setUploadDialogOpen(true);

    try {
      // Call the PDF parsing API
      const parsedData: ParsedPdfResponse = await parsePdf(file);

      // Store parsed data in sessionStorage for the draft page
      sessionStorage.setItem("soDraft", JSON.stringify(parsedData));
      
      setUploadStatus("success");
      setUploadMessage(`PDF processed successfully! Extracted ${parsedData.line_items.length} line item(s). Redirecting to verification page...`);

      // Navigate to draft verification page after a short delay
      setTimeout(() => {
        router.push("/sales-orders/draft");
        setUploadDialogOpen(false);
        setIsUploading(false);
      }, 1500);
    } catch (error: any) {
      console.error("Error uploading PDF:", error);
      setUploadStatus("error");
      setUploadMessage(error.message || "Failed to process PDF. Please try again or create the sales order manually.");
      setIsUploading(false);
    } finally {
      // Reset file input
      event.target.value = "";
    }
  };

  const handleUploadButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

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
          <Heading size={{ initial: "6", md: "8" }}>Sales Orders</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage your sales orders and transactions
          </Text>
        </Box>
        <Flex
          gap="3"
          wrap="wrap"
          align="center"
          justify="end"
          className="w-full min-w-0 sm:w-auto sm:ml-auto"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            style={{ display: "none" }}
            id="pdf-upload-input"
            disabled={isUploading}
          />
          <Button
            size="3"
            variant="soft"
            onClick={handleUploadButtonClick}
            disabled={isUploading}
            style={{
              color: "var(--color-text-primary)",
              cursor: isUploading ? "not-allowed" : "pointer",
              fontWeight: "600",
              opacity: isUploading ? 0.6 : 1,
            }}
          >
            <FiUpload size={18} style={{ marginRight: "8px" }} />
            {isUploading ? "Processing..." : "Upload PDF"}
          </Button>
          <Button
            size="3"
            onClick={() => router.push("/sales-orders/new")}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={18} style={{ marginRight: "8px" }} />
            Create SO
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
            placeholder="Search sales orders..."
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
                router.push(`/sales-orders/${params.data?.id}`);
              }}
              suppressCellFocus={true}
              rowStyle={{ cursor: "pointer" }}
            />
          </AgGridThemeShell>
        )}
      </Box>

      {/* Upload Status Dialog */}
      <Dialog.Root open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>
            {uploadStatus === "processing" && "Processing PDF"}
            {uploadStatus === "success" && "PDF Processed Successfully"}
            {uploadStatus === "error" && "Upload Error"}
          </Dialog.Title>
          <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
            {uploadMessage || "Processing your PDF file..."}
          </Dialog.Description>

          {uploadStatus === "processing" && (
            <Flex align="center" gap="3" mb="4">
              <Box
                style={{
                  width: "40px",
                  height: "40px",
                  border: "3px solid var(--color-primary)",
                  borderTop: "3px solid transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Extracting data from PDF...
              </Text>
            </Flex>
          )}

          {uploadStatus === "success" && (
            <Flex align="center" gap="3" mb="4">
              <FiCheckCircle size={24} style={{ color: "var(--color-success)" }} />
              <Text size="2" style={{ color: "var(--color-success)" }}>
                PDF processed successfully!
              </Text>
            </Flex>
          )}

          {uploadStatus === "error" && (
            <Flex align="center" gap="3" mb="4">
              <FiX size={24} style={{ color: "var(--color-error)" }} />
              <Text size="2" style={{ color: "var(--color-error)" }}>
                {uploadMessage}
              </Text>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            {uploadStatus === "error" && (
              <>
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  onClick={() => {
                    setUploadDialogOpen(false);
                    handleUploadButtonClick();
                  }}
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-text-dark)",
                    fontWeight: "600",
                  }}
                >
                  Try Again
                </Button>
              </>
            )}
            {uploadStatus === "success" && (
              <Dialog.Close>
                <Button
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-text-dark)",
                    fontWeight: "600",
                  }}
                >
                  Continue
                </Button>
              </Dialog.Close>
            )}
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export default function SalesOrdersPage() {
  return (
    <ProtectedRoute>
      <SalesOrdersContent />
    </ProtectedRoute>
  );
}
