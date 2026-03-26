import type { BadgeProps } from "@radix-ui/themes";

/** UI label for sales order workflow status (from API `status`, snake_case). */
export type SoUiStatus = "Pending" | "Started" | "Partially Completed" | "Completed";

/** UI label for billing / payment (from API `payment_status`, snake_case). */
export type PaymentUiStatus = "Not Invoiced" | "Partially Invoiced" | "Fully Paid";

export function formatSoStatus(apiStatus: string | undefined | null): SoUiStatus {
  const s = (apiStatus ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  switch (s) {
    case "pending":
      return "Pending";
    case "started":
      return "Started";
    case "partially_completed":
      return "Partially Completed";
    case "completed":
      return "Completed";
    // Legacy API values
    case "partial_delivered":
      return "Partially Completed";
    case "delivered":
      return "Completed";
    case "partial_invoiced":
      return "Partially Completed";
    case "fully_invoiced":
      return "Completed";
    default:
      return "Pending";
  }
}

export function formatPaymentStatus(api: string | undefined | null): PaymentUiStatus {
  const s = (api ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  switch (s) {
    case "not_invoiced":
      return "Not Invoiced";
    case "partially_invoiced":
      return "Partially Invoiced";
    case "fully_paid":
      return "Fully Paid";
    default:
      return "Not Invoiced";
  }
}

export function soStatusBadgeColor(status: SoUiStatus): BadgeProps["color"] {
  switch (status) {
    case "Pending":
      return "orange";
    case "Started":
      return "blue";
    case "Partially Completed":
      return "amber";
    case "Completed":
      return "green";
    default:
      return "gray";
  }
}

export function paymentStatusBadgeColor(status: PaymentUiStatus): BadgeProps["color"] {
  switch (status) {
    case "Not Invoiced":
      return "gray";
    case "Partially Invoiced":
      return "amber";
    case "Fully Paid":
      return "green";
    default:
      return "gray";
  }
}
