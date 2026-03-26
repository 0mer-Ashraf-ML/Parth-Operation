"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, TextField, Button, Badge, Select, DropdownMenu, Checkbox, Card } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiDownload, FiColumns, FiMail, FiPrinter } from "react-icons/fi";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { formatAppDate } from "@/lib/formatDate";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";

type InvoiceStatus = "Draft" | "Sent" | "Viewed" | "Partially Paid" | "Paid" | "Overdue" | "Void";

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalAmount: number;
  balance: number;
  paidAmount: number;
  currency: string;
  salesOrderNumber: string | null;
}

// Mock data - replace with actual API call
const mockInvoices: Invoice[] = [
  {
    id: "1",
    invoiceNumber: "INV-2024-001",
    customerName: "Acme Corporation",
    customerId: "1",
    invoiceDate: "2024-01-15",
    dueDate: "2024-02-14",
    status: "Paid",
    totalAmount: 16250.00,
    balance: 0.00,
    paidAmount: 16250.00,
    currency: "USD",
    salesOrderNumber: "SO-2024-001",
  },
  {
    id: "2",
    invoiceNumber: "INV-2024-002",
    customerName: "Tech Solutions Inc",
    customerId: "2",
    invoiceDate: "2024-01-20",
    dueDate: "2024-02-19",
    status: "Partially Paid",
    totalAmount: 9450.50,
    balance: 3200.50,
    paidAmount: 6250.00,
    currency: "USD",
    salesOrderNumber: "SO-2024-002",
  },
  {
    id: "3",
    invoiceNumber: "INV-2024-003",
    customerName: "Global Industries",
    customerId: "3",
    invoiceDate: "2024-01-25",
    dueDate: "2024-02-24",
    status: "Viewed",
    totalAmount: 24525.75,
    balance: 24525.75,
    paidAmount: 0.00,
    currency: "USD",
    salesOrderNumber: "SO-2024-003",
  },
  {
    id: "4",
    invoiceNumber: "INV-2024-004",
    customerName: "Acme Corporation",
    customerId: "1",
    invoiceDate: "2024-02-01",
    dueDate: "2024-03-02",
    status: "Sent",
    totalAmount: 3456.00,
    balance: 3456.00,
    paidAmount: 0.00,
    currency: "USD",
    salesOrderNumber: "SO-2024-004",
  },
  {
    id: "5",
    invoiceNumber: "INV-2024-005",
    customerName: "Metro Distributors",
    customerId: "4",
    invoiceDate: "2024-01-10",
    dueDate: "2024-02-09",
    status: "Overdue",
    totalAmount: 8750.00,
    balance: 8750.00,
    paidAmount: 0.00,
    currency: "USD",
    salesOrderNumber: null,
  },
  {
    id: "6",
    invoiceNumber: "INV-2024-006",
    customerName: "Tech Solutions Inc",
    customerId: "2",
    invoiceDate: "2024-02-05",
    dueDate: "2024-03-06",
    status: "Draft",
    totalAmount: 12500.00,
    balance: 12500.00,
    paidAmount: 0.00,
    currency: "USD",
    salesOrderNumber: null,
  },
];

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "invoices-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set([
  "invoiceDate",
  "dueDate",
  "paidAmount",
  "salesOrderNumber",
]);

function InvoicesContent() {
  const router = useRouter();
  const [rowData] = useState<Invoice[]>(mockInvoices);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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

  const filteredData = useMemo(() => {
    let filtered = rowData;

    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (invoice) =>
          invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
          invoice.customerName.toLowerCase().includes(searchLower) ||
          (invoice.salesOrderNumber && invoice.salesOrderNumber.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((invoice) => invoice.status === statusFilter);
    }

    return filtered;
  }, [rowData, searchText, statusFilter]);

  const getStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case "Draft":
        return "gray";
      case "Sent":
        return "blue";
      case "Viewed":
        return "purple";
      case "Partially Paid":
        return "orange";
      case "Paid":
        return "green";
      case "Overdue":
        return "red";
      case "Void":
        return "gray";
      default:
        return "gray";
    }
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<Invoice>[]>(() => [
    {
      field: "invoiceNumber",
      headerName: "Invoice #",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      lockVisible: true, // Always show Invoice Number (primary identifier)
    },
    {
      field: "customerName",
      headerName: "Customer",
      flex: 2,
      minWidth: 140,
      filter: true,
      sortable: true,
    },
    {
      field: "invoiceDate",
      headerName: "Invoice Date",
      flex: 1,
      minWidth: 118,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) =>
        params.value ? formatAppDate(params.value as string) : "—",
    },
    {
      field: "dueDate",
      headerName: "Due Date",
      flex: 1,
      minWidth: 118,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        const dueDate = new Date(params.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = dueDate < today && params.data?.status !== "Paid";
        const label = params.value ? formatAppDate(params.value as string) : "—";
        return (
          <span style={{ color: isOverdue ? "var(--color-error)" : "inherit" }}>
            {label}
          </span>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        return (
          <Badge color={getStatusColor(params.value as InvoiceStatus)}>
            {params.value}
          </Badge>
        );
      },
    },
    {
      field: "totalAmount",
      headerName: "Total Amount",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        return `$${params.value?.toFixed(2)}`;
      },
    },
    {
      field: "balance",
      headerName: "Balance",
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        return `$${params.value?.toFixed(2)}`;
      },
    },
    {
      field: "paidAmount",
      headerName: "Paid Amount",
      flex: 1,
      minWidth: 110,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        return `$${params.value?.toFixed(2)}`;
      },
    },
    {
      field: "salesOrderNumber",
      headerName: "Sales Order",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<Invoice>) => {
        return params.value || <Text style={{ color: "var(--color-text-secondary)" }}>—</Text>;
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<Invoice>[]>(() => {
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

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const total = filteredData.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const paid = filteredData.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const balance = filteredData.reduce((sum, inv) => sum + inv.balance, 0);
    const overdue = filteredData.filter(inv => inv.status === "Overdue").length;
    return { total, paid, balance, overdue };
  }, [filteredData]);

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
          <Heading size={{ initial: "6", md: "8" }}>Invoices</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage your invoices and billing
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
            onClick={() => router.push("/invoices/new")}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiPlus size={18} style={{ marginRight: "8px" }} />
            Create Invoice
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

      {/* Summary Cards */}
      <Flex gap="3" wrap="wrap">
        <Card
          style={{
            flex: "1",
            minWidth: "200px",
            padding: "20px",
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <Flex direction="column" gap="2">
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Total Amount
            </Text>
            <Text size="5" weight="bold" style={{ color: "var(--color-text-primary)" }}>
              ${summaryStats.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </Flex>
        </Card>
        <Card
          style={{
            flex: "1",
            minWidth: "200px",
            padding: "20px",
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <Flex direction="column" gap="2">
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Paid Amount
            </Text>
            <Text size="5" weight="bold" style={{ color: "var(--color-success)" }}>
              ${summaryStats.paid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </Flex>
        </Card>
        <Card
          style={{
            flex: "1",
            minWidth: "200px",
            padding: "20px",
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <Flex direction="column" gap="2">
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Outstanding Balance
            </Text>
            <Text size="5" weight="bold" style={{ color: "var(--color-error)" }}>
              ${summaryStats.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </Flex>
        </Card>
        <Card
          style={{
            flex: "1",
            minWidth: "200px",
            padding: "20px",
            background: "var(--color-dark-bg-secondary)",
            border: "1px solid var(--color-dark-bg-tertiary)",
          }}
        >
          <Flex direction="column" gap="2">
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Overdue Invoices
            </Text>
            <Text size="5" weight="bold" style={{ color: "var(--color-error)" }}>
              {summaryStats.overdue}
            </Text>
          </Flex>
        </Card>
      </Flex>

      <Flex gap="3" wrap="wrap" align="center" className="w-full min-w-0">
        <Box className="w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
          <TextField.Root
            placeholder="Search invoices..."
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
            value={statusFilter}
            onValueChange={setStatusFilter}
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
              <Select.Item value="all">All Status</Select.Item>
              <Select.Item value="Draft">Draft</Select.Item>
              <Select.Item value="Sent">Sent</Select.Item>
              <Select.Item value="Viewed">Viewed</Select.Item>
              <Select.Item value="Partially Paid">Partially Paid</Select.Item>
              <Select.Item value="Paid">Paid</Select.Item>
              <Select.Item value="Overdue">Overdue</Select.Item>
              <Select.Item value="Void">Void</Select.Item>
            </Select.Content>
          </Select.Root>
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
              router.push(`/invoices/${params.data?.id}`);
            }}
            suppressCellFocus={true}
            rowStyle={{ cursor: "pointer" }}
          />
        </AgGridThemeShell>
      </Box>
    </Flex>
  );
}

export default function InvoicesPage() {
  return (
    <ProtectedRoute>
      <InvoicesContent />
    </ProtectedRoute>
  );
}
