"use client";

import { useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, Button, Select, Card, Badge } from "@radix-ui/themes";
import { FiDownload, FiTrendingUp, FiTrendingDown, FiDollarSign, FiPackage, FiShoppingCart, FiFileText } from "react-icons/fi";

type ReportType = "Sales" | "Purchase" | "Inventory" | "Financial" | "Profit & Loss" | "Tax";

interface Report {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  lastGenerated: string;
}

const availableReports: Report[] = [
  {
    id: "1",
    name: "Sales Summary",
    type: "Sales",
    description: "Overview of sales performance by period, customer, and product",
    lastGenerated: "2024-02-15",
  },
  {
    id: "2",
    name: "Sales by Customer",
    type: "Sales",
    description: "Detailed sales breakdown by customer",
    lastGenerated: "2024-02-14",
  },
  {
    id: "3",
    name: "Sales by Item",
    type: "Sales",
    description: "Sales performance by SKU/product",
    lastGenerated: "2024-02-13",
  },
  {
    id: "4",
    name: "Purchase Summary",
    type: "Purchase",
    description: "Overview of purchase orders and vendor performance",
    lastGenerated: "2024-02-15",
  },
  {
    id: "5",
    name: "Purchase by Vendor",
    type: "Purchase",
    description: "Purchase breakdown by vendor",
    lastGenerated: "2024-02-14",
  },
  {
    id: "6",
    name: "Inventory Valuation",
    type: "Inventory",
    description: "Current inventory value and stock levels",
    lastGenerated: "2024-02-15",
  },
  {
    id: "7",
    name: "Stock Movement",
    type: "Inventory",
    description: "Track inventory movements and adjustments",
    lastGenerated: "2024-02-12",
  },
  {
    id: "8",
    name: "Profit & Loss",
    type: "Profit & Loss",
    description: "Comprehensive P&L statement",
    lastGenerated: "2024-02-15",
  },
  {
    id: "9",
    name: "Accounts Receivable",
    type: "Financial",
    description: "Outstanding invoices and customer payments",
    lastGenerated: "2024-02-15",
  },
  {
    id: "10",
    name: "Accounts Payable",
    type: "Financial",
    description: "Outstanding bills and vendor payments",
    lastGenerated: "2024-02-15",
  },
  {
    id: "11",
    name: "Tax Summary",
    type: "Tax",
    description: "Tax collected and paid summary",
    lastGenerated: "2024-02-15",
  },
];

function ReportsContent() {
  const [selectedReportType, setSelectedReportType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("thisMonth");

  const filteredReports = useMemo(() => {
    if (selectedReportType === "all") return availableReports;
    return availableReports.filter((report) => report.type === selectedReportType);
  }, [selectedReportType]);

  const getReportTypeColor = (type: ReportType) => {
    switch (type) {
      case "Sales":
        return "blue";
      case "Purchase":
        return "green";
      case "Inventory":
        return "purple";
      case "Financial":
        return "orange";
      case "Profit & Loss":
        return "red";
      case "Tax":
        return "yellow";
      default:
        return "gray";
    }
  };

  const getReportIcon = (type: ReportType) => {
    switch (type) {
      case "Sales":
        return FiTrendingUp;
      case "Purchase":
        return FiShoppingCart;
      case "Inventory":
        return FiPackage;
      case "Financial":
        return FiDollarSign;
      case "Profit & Loss":
        return FiFileText;
      case "Tax":
        return FiFileText;
      default:
        return FiFileText;
    }
  };

  // Mock summary statistics
  const summaryStats = {
    totalSales: 125450.75,
    totalPurchases: 87500.50,
    profit: 37950.25,
    profitMargin: 30.2,
    totalInvoices: 24,
    paidInvoices: 18,
    outstandingAmount: 45250.00,
  };

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Box>
        <Heading size={{ initial: "6", md: "8" }}>Reports</Heading>
        <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
          View analytics and generate reports
        </Text>
      </Box>

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
            <Flex align="center" gap="2">
              <FiTrendingUp size={20} style={{ color: "var(--color-success)" }} />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Total Sales
              </Text>
            </Flex>
            <Text size="5" weight="bold" style={{ color: "var(--color-text-primary)" }}>
              ${summaryStats.totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text size="1" style={{ color: "var(--color-success)" }}>
              +12.5% from last month
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
            <Flex align="center" gap="2">
              <FiShoppingCart size={20} style={{ color: "var(--color-primary)" }} />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Total Purchases
              </Text>
            </Flex>
            <Text size="5" weight="bold" style={{ color: "var(--color-text-primary)" }}>
              ${summaryStats.totalPurchases.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              +8.3% from last month
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
            <Flex align="center" gap="2">
              <FiDollarSign size={20} style={{ color: "var(--color-success)" }} />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Profit
              </Text>
            </Flex>
            <Text size="5" weight="bold" style={{ color: "var(--color-success)" }}>
              ${summaryStats.profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              {summaryStats.profitMargin}% margin
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
            <Flex align="center" gap="2">
              <FiFileText size={20} style={{ color: "var(--color-primary)" }} />
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Outstanding
              </Text>
            </Flex>
            <Text size="5" weight="bold" style={{ color: "var(--color-error)" }}>
              ${summaryStats.outstandingAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              {summaryStats.totalInvoices - summaryStats.paidInvoices} unpaid invoices
            </Text>
          </Flex>
        </Card>
      </Flex>

      {/* Filters */}
      <Flex gap="3" wrap="wrap" align="center">
        <Box style={{ minWidth: "200px" }}>
          <Select.Root
            value={selectedReportType}
            onValueChange={setSelectedReportType}
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
              <Select.Item value="all">All Report Types</Select.Item>
              <Select.Item value="Sales">Sales</Select.Item>
              <Select.Item value="Purchase">Purchase</Select.Item>
              <Select.Item value="Inventory">Inventory</Select.Item>
              <Select.Item value="Financial">Financial</Select.Item>
              <Select.Item value="Profit & Loss">Profit & Loss</Select.Item>
              <Select.Item value="Tax">Tax</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
        <Box style={{ minWidth: "200px" }}>
          <Select.Root
            value={dateRange}
            onValueChange={setDateRange}
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
              <Select.Item value="today">Today</Select.Item>
              <Select.Item value="thisWeek">This Week</Select.Item>
              <Select.Item value="thisMonth">This Month</Select.Item>
              <Select.Item value="thisQuarter">This Quarter</Select.Item>
              <Select.Item value="thisYear">This Year</Select.Item>
              <Select.Item value="custom">Custom Range</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
      </Flex>

      {/* Reports Grid */}
      <Box
        style={{
          flex: 1,
          minHeight: "400px",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          padding: "24px",
          overflowY: "auto",
        }}
      >
        <Flex direction="column" gap="3">
          <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)", marginBottom: "8px" }}>
            Available Reports ({filteredReports.length})
          </Text>
          
          <Flex direction="column" gap="3">
            {filteredReports.map((report) => {
              const Icon = getReportIcon(report.type);
              return (
                <Card
                  key={report.id}
                  style={{
                    padding: "20px",
                    background: "var(--color-dark-bg)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.background = "var(--color-dark-bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-dark-bg-tertiary)";
                    e.currentTarget.style.background = "var(--color-dark-bg)";
                  }}
                >
                  <Flex align="center" justify="between" wrap="wrap" gap="3">
                    <Flex align="center" gap="3" style={{ flex: 1, minWidth: "300px" }}>
                      <Box
                        style={{
                          padding: "12px",
                          background: "var(--color-dark-bg-tertiary)",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={24} style={{ color: "var(--color-primary)" }} />
                      </Box>
                      <Flex direction="column" gap="1" style={{ flex: 1 }}>
                        <Flex align="center" gap="2">
                          <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                            {report.name}
                          </Text>
                          <Badge color={getReportTypeColor(report.type) as any} size="1">
                            {report.type}
                          </Badge>
                        </Flex>
                        <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                          {report.description}
                        </Text>
                        <Text size="1" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
                          Last generated: {report.lastGenerated}
                        </Text>
                      </Flex>
                    </Flex>
                    <Button
                      size="3"
                      variant="soft"
                      onClick={() => {
                        // TODO: Generate report
                        console.log("Generating report:", report.name);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FiDownload size={16} />
                      Generate
                    </Button>
                  </Flex>
                </Card>
              );
            })}
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <ReportsContent />
    </ProtectedRoute>
  );
}
