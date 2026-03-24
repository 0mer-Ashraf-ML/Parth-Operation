"use client";

import NotFound from "@/components/NotFound";
import { FiFileText } from "react-icons/fi";

export default function SalesOrderNotFound() {
  return (
    <NotFound
      title="Sales Order Not Found"
      description="The sales order you're looking for doesn't exist or has been removed."
      icon={FiFileText}
      backButtonLabel="Back to Sales Orders"
      backButtonPath="/sales-orders"
    />
  );
}
