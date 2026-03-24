"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { getMeAsync } from "@/lib/store/authSlice";
import {
  Flex,
  Text,
  Heading,
  Card,
  Box,
  Badge,
  Table,
} from "@radix-ui/themes";
import {
  FiDollarSign,
  FiShoppingCart,
  FiUsers,
  FiTrendingUp,
  FiFileText,
  FiPackage,
  FiTruck,
  FiArrowUp,
  FiArrowDown,
} from "react-icons/fi";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions, AgPolarChartOptions } from "ag-charts-community";
import { AllCommunityModule, ModuleRegistry } from "ag-charts-community";

// Mock data - replace with actual API calls
const mockSalesData = [
  { month: "Jan", sales: 45000, orders: 120 },
  { month: "Feb", sales: 52000, orders: 145 },
  { month: "Mar", sales: 48000, orders: 130 },
  { month: "Apr", sales: 61000, orders: 165 },
  { month: "May", sales: 55000, orders: 150 },
  { month: "Jun", sales: 67000, orders: 180 },
];

const mockOrderStatusData = [
  { status: "Pending", count: 45, color: "#FBB615" },
  { status: "Partial Delivered", count: 23, color: "#3b82f6" },
  { status: "Delivered", count: 132, color: "#10b981" },
];

const mockRevenueByClient = [
  { client: "Acme Corp", revenue: 125000 },
  { client: "Tech Solutions", revenue: 98000 },
  { client: "Global Industries", revenue: 87000 },
  { client: "Metro Distributors", revenue: 65000 },
  { client: "Others", revenue: 95000 },
];

const mockRecentActivity = [
  { id: "1", type: "Sales Order", description: "SO-2024-001 created", time: "2 hours ago", status: "success" },
  { id: "2", type: "Purchase Order", description: "PO-2024-045 delivered", time: "5 hours ago", status: "success" },
  { id: "3", type: "Client", description: "New client added: Tech Solutions", time: "1 day ago", status: "info" },
  { id: "4", type: "SKU", description: "SKU-004 price updated", time: "2 days ago", status: "info" },
  { id: "5", type: "Sales Order", description: "SO-2024-002 partially delivered", time: "2 days ago", status: "warning" },
];

function HomeContent() {
  const dispatch = useAppDispatch();
  const { accessToken } = useAppSelector((state) => state.auth);
  const [selectedPeriod, setSelectedPeriod] = useState<"month" | "quarter" | "year">("month");
  const [chartsReady, setChartsReady] = useState(false);
  const hasFetchedUser = useRef(false);

  // Fetch user data on main app screen - only once when we have token but no user
  useEffect(() => {
    // Only fetch if we have a token, no user data, and haven't fetched yet
    if (accessToken && !hasFetchedUser.current) {
      hasFetchedUser.current = true;
      dispatch(getMeAsync());
    }
  }, [dispatch, accessToken]);

  // Register AG Charts modules only on client side to avoid hydration errors
  useEffect(() => {
    if (typeof window !== "undefined") {
      ModuleRegistry.registerModules([AllCommunityModule]);
      setChartsReady(true);
    }
  }, []);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalSales = mockSalesData.reduce((sum, item) => sum + item.sales, 0);
    const totalOrders = mockSalesData.reduce((sum, item) => sum + item.orders, 0);
    const totalClients = 24;
    const totalRevenue = mockRevenueByClient.reduce((sum, item) => sum + item.revenue, 0);
    const avgOrderValue = totalSales / totalOrders;
    const growthRate = ((mockSalesData[mockSalesData.length - 1].sales - mockSalesData[0].sales) / mockSalesData[0].sales) * 100;

    return {
      totalSales,
      totalOrders,
      totalClients,
      totalRevenue,
      avgOrderValue,
      growthRate,
    };
  }, []);

  // Sales Trend Chart Configuration
  const salesChartOptions = useMemo<AgCartesianChartOptions>(() => ({
    data: mockSalesData,
    series: [
      {
        type: "line" as const,
        xKey: "month",
        yKey: "sales",
        yName: "Sales",
        stroke: "#FBB615",
        strokeWidth: 3,
        marker: {
          fill: "#FBB615",
          stroke: "#FBB615",
          size: 6,
        },
      },
    ],
    background: {
      fill: "transparent",
    },
    theme: "ag-default-dark" as const,
    axes: {
      bottom: {
        type: "category" as const,
      },
      left: {
        type: "number" as const,
        label: {
          formatter: (params: any) => `$${(params.value / 1000).toFixed(0)}k`,
        },
      },
    },
  }), []);

  // Order Status Chart Configuration
  const orderStatusChartOptions = useMemo<AgCartesianChartOptions>(() => ({
    data: mockOrderStatusData,
    series: [
      {
        type: "bar" as const,
        xKey: "status",
        yKey: "count",
        yName: "Orders",
      },
    ],
    background: {
      fill: "transparent",
    },
    theme: "ag-default-dark" as const,
    axes: {
      bottom: {
        type: "category" as const,
      },
      left: {
        type: "number" as const,
      },
    },
  }), []);

  // Revenue Distribution Chart Configuration
  const revenueChartOptions = useMemo<AgPolarChartOptions>(() => ({
    data: mockRevenueByClient,
    series: [
      {
        type: "pie" as const,
        angleKey: "revenue",
        calloutLabelKey: "client",
        sectorLabelKey: "revenue",
        sectorLabel: {
          formatter: (params: any) => `$${(params.value / 1000).toFixed(0)}k`,
          color: "#e5e5e5",
        },
        fills: ["#FBB615", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"],
        strokes: ["#FBB615", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"],
      },
    ],
    background: {
      fill: "transparent",
    },
    theme: "ag-default-dark" as const,
    legend: {
      enabled: true,
    },
  }), []);

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" wrap="wrap" gap="4">
        <Box>
          <Heading size={{ initial: "6", md: "8" }}>Dashboard</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Overview of your business performance
          </Text>
        </Box>
        <Badge size="2" color={kpis.growthRate >= 0 ? "green" : "red"}>
          {kpis.growthRate >= 0 ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
          {Math.abs(kpis.growthRate).toFixed(1)}% Growth
        </Badge>
      </Flex>

      {/* KPI Cards */}
      <Flex gap="4" wrap="wrap">
        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
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
                <FiDollarSign size={20} style={{ color: "var(--color-primary)" }} />
              </Box>
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Total Revenue
              </Text>
            </Flex>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              ${(kpis.totalRevenue / 1000).toFixed(0)}k
            </Heading>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              Last 6 months
            </Text>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Box
                style={{
                  padding: "10px",
                  background: "rgba(59, 130, 246, 0.1)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiShoppingCart size={20} style={{ color: "#3b82f6" }} />
              </Box>
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Total Orders
              </Text>
            </Flex>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              {kpis.totalOrders}
            </Heading>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              Avg: ${kpis.avgOrderValue.toFixed(0)} per order
            </Text>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Box
                style={{
                  padding: "10px",
                  background: "rgba(16, 185, 129, 0.1)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiUsers size={20} style={{ color: "#10b981" }} />
              </Box>
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Active Clients
              </Text>
            </Flex>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              {kpis.totalClients}
            </Heading>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              {mockOrderStatusData.reduce((sum, item) => sum + item.count, 0)} active orders
            </Text>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Box
                style={{
                  padding: "10px",
                  background: "rgba(139, 92, 246, 0.1)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiTrendingUp size={20} style={{ color: "#8b5cf6" }} />
              </Box>
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Sales Growth
              </Text>
            </Flex>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: kpis.growthRate >= 0 ? "#10b981" : "#ef4444" }}>
              {kpis.growthRate >= 0 ? "+" : ""}{kpis.growthRate.toFixed(1)}%
            </Heading>
            <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
              Compared to last period
            </Text>
          </Flex>
        </Card>
      </Flex>

      {/* Charts Row */}
      <Flex gap="4" wrap="wrap">
        {/* Sales Trend Chart */}
        <Card style={{ flex: "2", minWidth: "400px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Heading size={{ initial: "4", md: "5" }} style={{ color: "var(--color-text-primary)" }}>
                Sales Trend
              </Heading>
              <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                Last 6 months
              </Text>
            </Flex>
            <Box style={{ height: "300px", width: "100%" }}>
              {chartsReady && <AgCharts options={salesChartOptions} />}
            </Box>
          </Flex>
        </Card>

        {/* Order Status Chart */}
        <Card style={{ flex: "1", minWidth: "300px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="3">
            <Heading size={{ initial: "4", md: "5" }} style={{ color: "var(--color-text-primary)" }}>
              Orders by Status
            </Heading>
            <Box style={{ height: "300px", width: "100%" }}>
              {chartsReady && <AgCharts options={orderStatusChartOptions} />}
            </Box>
          </Flex>
        </Card>
      </Flex>

      {/* Revenue Distribution and Recent Activity */}
      <Flex gap="4" wrap="wrap">
        {/* Revenue Distribution Chart */}
        <Card style={{ flex: "1", minWidth: "400px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="3">
            <Heading size={{ initial: "4", md: "5" }} style={{ color: "var(--color-text-primary)" }}>
              Revenue by Client
            </Heading>
            <Box style={{ height: "300px", width: "100%" }}>
              {chartsReady && <AgCharts options={revenueChartOptions} />}
            </Box>
          </Flex>
        </Card>

        {/* Recent Activity */}
        <Card style={{ flex: "1", minWidth: "400px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="3">
            <Heading size={{ initial: "4", md: "5" }} style={{ color: "var(--color-text-primary)" }}>
              Recent Activity
            </Heading>
            <Box className="table-scroll-x w-full min-w-0">
            <Table.Root>
              <Table.Body>
                {mockRecentActivity.map((activity) => (
                  <Table.Row key={activity.id}>
                    <Table.Cell>
                      <Flex align="center" gap="3">
                        <Box
                          style={{
                            padding: "8px",
                            background: "var(--color-dark-bg-tertiary)",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {activity.type === "Sales Order" && <FiFileText size={16} style={{ color: "var(--color-primary)" }} />}
                          {activity.type === "Purchase Order" && <FiShoppingCart size={16} style={{ color: "#3b82f6" }} />}
                          {activity.type === "Client" && <FiUsers size={16} style={{ color: "#10b981" }} />}
                          {activity.type === "SKU" && <FiPackage size={16} style={{ color: "#8b5cf6" }} />}
                        </Box>
                        <Box style={{ flex: 1 }}>
                          <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                            {activity.description}
                          </Text>
                          <Text size="1" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
                            {activity.time}
                          </Text>
                        </Box>
                        <Badge
                          size="1"
                          color={
                            activity.status === "success"
                              ? "green"
                              : activity.status === "warning"
                              ? "yellow"
                              : "blue"
                          }
                        >
                          {activity.type}
                        </Badge>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
            </Box>
          </Flex>
        </Card>
      </Flex>

      {/* Quick Stats */}
      <Flex gap="4" wrap="wrap">
        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2" align="center">
            <FiFileText size={24} style={{ color: "var(--color-primary)" }} />
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Sales Orders
            </Text>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              {mockOrderStatusData.reduce((sum, item) => sum + item.count, 0)}
            </Heading>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2" align="center">
            <FiTruck size={24} style={{ color: "#3b82f6" }} />
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Purchase Orders
            </Text>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              87
            </Heading>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2" align="center">
            <FiPackage size={24} style={{ color: "#10b981" }} />
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Total SKUs
            </Text>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              156
            </Heading>
          </Flex>
        </Card>

        <Card style={{ flex: "1", minWidth: "200px", padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
          <Flex direction="column" gap="2" align="center">
            <FiTruck size={24} style={{ color: "#8b5cf6" }} />
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Active Vendors
            </Text>
            <Heading size={{ initial: "5", md: "6" }} style={{ color: "var(--color-text-primary)" }}>
              12
            </Heading>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
