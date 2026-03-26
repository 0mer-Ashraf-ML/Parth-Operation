"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { notFound } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
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
} from "@radix-ui/themes";
import { 
  FiArrowLeft, 
  FiFileText, 
  FiUsers, 
  FiCalendar, 
  FiDollarSign, 
  FiMapPin,
  FiMail,
  FiPrinter,
  FiDownload,
  FiCheckCircle,
  FiClock,
  FiHash,
  FiTrendingUp,
} from "react-icons/fi";
import { formatAppDate } from "@/lib/formatDate";

type InvoiceStatus = "Draft" | "Sent" | "Viewed" | "Partially Paid" | "Paid" | "Overdue" | "Void";

interface InvoiceLineItem {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  totalPrice: number;
}

interface Payment {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string;
  notes: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  salesOrderNumber: string | null;
  billingAddress: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  shippingAddress: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  currency: string;
  notes: string;
  terms: string;
  payments: Payment[];
}

// Mock function to fetch invoice data - replace with actual API call
const fetchInvoiceData = async (id: string): Promise<InvoiceDetail | null> => {
  // Mock data - replace with actual API call
  const mockInvoices: Record<string, InvoiceDetail> = {
    "1": {
      id: "1",
      invoiceNumber: "INV-2024-001",
      customerId: "1",
      customerName: "Acme Corporation",
      customerEmail: "accounting@acme.com",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-14",
      status: "Paid",
      salesOrderNumber: "SO-2024-001",
      billingAddress: {
        addressLine1: "123 Main St",
        addressLine2: "Suite 100",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        country: "USA",
      },
      shippingAddress: {
        addressLine1: "123 Main St",
        addressLine2: "Suite 100",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        country: "USA",
      },
      lineItems: [
        {
          id: "line-1",
          skuId: "1",
          skuCode: "SKU-001",
          skuName: "Premium Widget A",
          description: "High-quality widget for industrial use",
          quantity: 1000,
          unitPrice: 3.0,
          discount: 5.0,
          tax: 8.5,
          totalPrice: 3000.0,
        },
        {
          id: "line-2",
          skuId: "2",
          skuCode: "SKU-002",
          skuName: "Standard Widget B",
          description: "Standard widget for general use",
          quantity: 500,
          unitPrice: 2.5,
          discount: 3.0,
          tax: 8.5,
          totalPrice: 1250.0,
        },
      ],
      subtotal: 4250.0,
      taxAmount: 361.25,
      discountAmount: 212.5,
      totalAmount: 16250.0,
      paidAmount: 16250.0,
      balance: 0.0,
      currency: "USD",
      notes: "Thank you for your business!",
      terms: "Net 30",
      payments: [
        {
          id: "pay-1",
          paymentDate: "2024-02-10",
          amount: 16250.0,
          paymentMethod: "Bank Transfer",
          referenceNumber: "TXN-2024-001",
          notes: "Full payment received",
        },
      ],
    },
    "2": {
      id: "2",
      invoiceNumber: "INV-2024-002",
      customerId: "2",
      customerName: "Tech Solutions Inc",
      customerEmail: "finance@techsolutions.com",
      invoiceDate: "2024-01-20",
      dueDate: "2024-02-19",
      status: "Partially Paid",
      salesOrderNumber: "SO-2024-002",
      billingAddress: {
        addressLine1: "456 Tech Park",
        addressLine2: "",
        city: "San Francisco",
        state: "CA",
        zipCode: "94102",
        country: "USA",
      },
      shippingAddress: {
        addressLine1: "456 Tech Park",
        addressLine2: "",
        city: "San Francisco",
        state: "CA",
        zipCode: "94102",
        country: "USA",
      },
      lineItems: [
        {
          id: "line-1",
          skuId: "3",
          skuCode: "SKU-003",
          skuName: "Deluxe Component X",
          description: "Premium component with advanced features",
          quantity: 200,
          unitPrice: 5.75,
          discount: 0,
          tax: 7.25,
          totalPrice: 1150.0,
        },
      ],
      subtotal: 1150.0,
      taxAmount: 83.375,
      discountAmount: 0,
      totalAmount: 9450.5,
      paidAmount: 6250.0,
      balance: 3200.5,
      currency: "USD",
      notes: "Partial payment received",
      terms: "Net 30",
      payments: [
        {
          id: "pay-1",
          paymentDate: "2024-02-05",
          amount: 6250.0,
          paymentMethod: "Check",
          referenceNumber: "CHK-2024-001",
          notes: "Partial payment",
        },
      ],
    },
  };
  
  return mockInvoices[id] || null;
};

function InvoiceDetailContent() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params?.id as string;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadInvoice = async () => {
      const invoiceData = await fetchInvoiceData(invoiceId);
      setInvoice(invoiceData);
      setIsLoading(false);
    };
    loadInvoice();
  }, [invoiceId]);

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

  if (isLoading) {
    return (
      <Flex direction="column" gap="4" style={{ height: "100%" }}>
        <Text>Loading invoice...</Text>
      </Flex>
    );
  }

  // Trigger Next.js 404 handling when resource is not found
  if (!invoice) {
    notFound();
  }

  const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== "Paid";

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      {/* Header */}
      <Flex align="center" justify="between" wrap="wrap" gap="4">
        <Flex align="center" gap="3">
          <Button
            variant="ghost"
            onClick={() => router.push("/invoices")}
            style={{
              color: "var(--color-text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiArrowLeft size={18} />
            Back
          </Button>
          <Flex direction="column" gap="1">
            <Flex align="center" gap="3">
              <Heading size={{ initial: "6", md: "7" }} style={{ color: "var(--color-text-primary)" }}>
                {invoice.invoiceNumber}
              </Heading>
              <Badge color={getStatusColor(invoice.status) as any} size="2">
                {invoice.status}
              </Badge>
              {isOverdue && (
                <Badge color="red" size="2">
                  Overdue
                </Badge>
              )}
            </Flex>
            <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
              Invoice Details
            </Text>
          </Flex>
        </Flex>
        <Flex gap="2" wrap="wrap">
          <Button
            variant="soft"
            onClick={() => {
              // TODO: Send invoice email
              console.log("Sending invoice email");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiMail size={16} />
            Send Email
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              // TODO: Print invoice
              window.print();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiPrinter size={16} />
            Print
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              // TODO: Download PDF
              console.log("Downloading invoice PDF");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiDownload size={16} />
            Download PDF
          </Button>
        </Flex>
      </Flex>

      <Flex gap="4" wrap="wrap">
        {/* Left Column - Main Details */}
        <Flex direction="column" gap="4" style={{ flex: "1", minWidth: "600px" }}>
          {/* Customer & Dates Card */}
          <Card
            style={{
              padding: "24px",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <Flex direction="column" gap="4">
              <Flex align="center" gap="2">
                <FiUsers size={18} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Customer Information
                </Heading>
              </Flex>
              <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Customer Name
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {invoice.customerName}
                  </Text>
                </Box>
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Email
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {invoice.customerEmail}
                  </Text>
                </Box>
                {invoice.salesOrderNumber && (
                  <Box>
                    <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                      Sales Order
                    </Text>
                    <Text 
                      size="3" 
                      style={{ 
                        color: "var(--color-primary)",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                      onClick={() => router.push(`/sales-orders/${invoice.salesOrderNumber?.replace("SO-", "")}`)}
                    >
                      {invoice.salesOrderNumber}
                    </Text>
                  </Box>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Dates Card */}
          <Card
            style={{
              padding: "24px",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <Flex direction="column" gap="4">
              <Flex align="center" gap="2">
                <FiCalendar size={18} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Dates
                </Heading>
              </Flex>
              <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Invoice Date
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {formatAppDate(invoice.invoiceDate)}
                  </Text>
                </Box>
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Due Date
                  </Text>
                  <Text 
                    size="3" 
                    style={{ 
                      color: isOverdue ? "var(--color-error)" : "var(--color-text-primary)",
                    }}
                  >
                    {formatAppDate(invoice.dueDate)}
                  </Text>
                </Box>
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Payment Terms
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {invoice.terms}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          </Card>

          {/* Line Items Card */}
          <Card
            style={{
              padding: "24px",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <Flex direction="column" gap="4">
              <Flex align="center" gap="2">
                <FiFileText size={18} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Line Items
                </Heading>
              </Flex>
              <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
              <Box style={{ overflowX: "auto" }}>
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>SKU</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ textAlign: "right" }}>Quantity</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ textAlign: "right" }}>Unit Price</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ textAlign: "right" }}>Discount</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ textAlign: "right" }}>Tax</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ textAlign: "right" }}>Total</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {invoice.lineItems.map((item) => (
                      <Table.Row key={item.id}>
                        <Table.Cell>
                          <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                            {item.skuCode}
                          </Text>
                          <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                            {item.skuName}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                            {item.description}
                          </Text>
                        </Table.Cell>
                        <Table.Cell style={{ textAlign: "right" }}>
                          <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                            {item.quantity.toLocaleString()}
                          </Text>
                        </Table.Cell>
                        <Table.Cell style={{ textAlign: "right" }}>
                          <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                            ${item.unitPrice.toFixed(2)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell style={{ textAlign: "right" }}>
                          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                            {item.discount > 0 ? `${item.discount}%` : "—"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell style={{ textAlign: "right" }}>
                          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                            {item.tax > 0 ? `${item.tax}%` : "—"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell style={{ textAlign: "right" }}>
                          <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                            ${item.totalPrice.toFixed(2)}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </Flex>
          </Card>
        </Flex>

        {/* Right Column - Summary & Payments */}
        <Flex direction="column" gap="4" style={{ width: "400px" }}>
          {/* Summary Card */}
          <Card
            style={{
              padding: "24px",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <Flex direction="column" gap="4">
              <Flex align="center" gap="2">
                <FiDollarSign size={18} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Summary
                </Heading>
              </Flex>
              <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
              <Flex direction="column" gap="3">
                <Flex justify="between" align="center">
                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                    Subtotal
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    ${invoice.subtotal.toFixed(2)}
                  </Text>
                </Flex>
                {invoice.discountAmount > 0 && (
                  <Flex justify="between" align="center">
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      Discount
                    </Text>
                    <Text size="3" style={{ color: "var(--color-success)" }}>
                      -${invoice.discountAmount.toFixed(2)}
                    </Text>
                  </Flex>
                )}
                <Flex justify="between" align="center">
                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                    Tax
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    ${invoice.taxAmount.toFixed(2)}
                  </Text>
                </Flex>
                <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
                <Flex justify="between" align="center">
                  <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                    Total Amount
                  </Text>
                  <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                    ${invoice.totalAmount.toFixed(2)}
                  </Text>
                </Flex>
                <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
                <Flex justify="between" align="center">
                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                    Paid Amount
                  </Text>
                  <Text size="3" style={{ color: "var(--color-success)" }}>
                    ${invoice.paidAmount.toFixed(2)}
                  </Text>
                </Flex>
                <Flex justify="between" align="center">
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)" }}>
                    Balance
                  </Text>
                  <Text 
                    size="3" 
                    weight="bold" 
                    style={{ 
                      color: invoice.balance > 0 ? "var(--color-error)" : "var(--color-success)",
                    }}
                  >
                    ${invoice.balance.toFixed(2)}
                  </Text>
                </Flex>
              </Flex>
            </Flex>
          </Card>

          {/* Addresses Card */}
          <Card
            style={{
              padding: "24px",
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <Flex direction="column" gap="4">
              <Flex align="center" gap="2">
                <FiMapPin size={18} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Addresses
                </Heading>
              </Flex>
              <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
              <Flex direction="column" gap="4">
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                    Billing Address
                  </Text>
                  <Text size="2" style={{ color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                    {invoice.billingAddress.addressLine1}
                    {invoice.billingAddress.addressLine2 && (
                      <>
                        <br />
                        {invoice.billingAddress.addressLine2}
                      </>
                    )}
                    <br />
                    {invoice.billingAddress.city}, {invoice.billingAddress.state} {invoice.billingAddress.zipCode}
                    <br />
                    {invoice.billingAddress.country}
                  </Text>
                </Box>
                <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
                <Box>
                  <Text size="2" weight="medium" style={{ color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                    Shipping Address
                  </Text>
                  <Text size="2" style={{ color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                    {invoice.shippingAddress.addressLine1}
                    {invoice.shippingAddress.addressLine2 && (
                      <>
                        <br />
                        {invoice.shippingAddress.addressLine2}
                      </>
                    )}
                    <br />
                    {invoice.shippingAddress.city}, {invoice.shippingAddress.state} {invoice.shippingAddress.zipCode}
                    <br />
                    {invoice.shippingAddress.country}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          </Card>

          {/* Payments Card */}
          {invoice.payments.length > 0 && (
            <Card
              style={{
                padding: "24px",
                background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
              }}
            >
              <Flex direction="column" gap="4">
                <Flex align="center" gap="2">
                  <FiCheckCircle size={18} style={{ color: "var(--color-primary)" }} />
                  <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                    Payment History
                  </Heading>
                </Flex>
                <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
                <Flex direction="column" gap="3">
                  {invoice.payments.map((payment) => (
                    <Box
                      key={payment.id}
                      style={{
                        padding: "12px",
                        background: "var(--color-dark-bg)",
                        borderRadius: "8px",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                      }}
                    >
                      <Flex direction="column" gap="2">
                        <Flex justify="between" align="center">
                          <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                            ${payment.amount.toFixed(2)}
                          </Text>
                          <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                            {formatAppDate(payment.paymentDate)}
                          </Text>
                        </Flex>
                        <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                          {payment.paymentMethod}
                        </Text>
                        {payment.referenceNumber && (
                          <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                            Ref: {payment.referenceNumber}
                          </Text>
                        )}
                        {payment.notes && (
                          <Text size="1" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
                            {payment.notes}
                          </Text>
                        )}
                      </Flex>
                    </Box>
                  ))}
                </Flex>
              </Flex>
            </Card>
          )}

          {/* Notes Card */}
          {invoice.notes && (
            <Card
              style={{
                padding: "24px",
                background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
              }}
            >
              <Flex direction="column" gap="4">
                <Heading size={{ initial: "3", md: "4" }} style={{ color: "var(--color-text-primary)" }}>
                  Notes
                </Heading>
                <Separator style={{ background: "var(--color-dark-bg-tertiary)" }} />
                <Text size="2" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  {invoice.notes}
                </Text>
              </Flex>
            </Card>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}

export default function InvoiceDetailPage() {
  return (
    <ProtectedRoute>
      <InvoiceDetailContent />
    </ProtectedRoute>
  );
}
