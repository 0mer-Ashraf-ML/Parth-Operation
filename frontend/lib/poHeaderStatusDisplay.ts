import type { BadgeProps } from "@radix-ui/themes";

/** PO header workflow (API `status`, typically `started` | `completed`, snake_case). */
export type POHeaderStatus = "started" | "completed";

export function mapPoHeaderStatus(api: string | null | undefined): POHeaderStatus {
  const s = (api ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  if (s === "completed" || s === "delivered") return "completed";
  if (s === "started") return "started";
  // Legacy header values → treat as in progress
  if (
    s === "in_production" ||
    s === "packed_and_shipped" ||
    s === "ready_for_pickup"
  ) {
    return "started";
  }
  return "started";
}

export function poHeaderStatusLabel(status: POHeaderStatus): string {
  return status === "completed" ? "Completed" : "Started";
}

export function poHeaderStatusBadgeColor(status: POHeaderStatus): BadgeProps["color"] {
  return status === "completed" ? "green" : "blue";
}

const PO_HEADER_ORDER: POHeaderStatus[] = ["started", "completed"];

/** Forward-only: current step and later steps (for header status select). */
export function getPoHeaderStatusOptions(fromStatus?: POHeaderStatus): {
  value: POHeaderStatus;
  label: string;
}[] {
  const start =
    fromStatus !== undefined ? PO_HEADER_ORDER.indexOf(fromStatus) : 0;
  const slice = start >= 0 ? PO_HEADER_ORDER.slice(start) : [...PO_HEADER_ORDER];
  return slice.map((value) => ({
    value,
    label: poHeaderStatusLabel(value),
  }));
}
