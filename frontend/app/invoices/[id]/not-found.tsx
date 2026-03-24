"use client";

import NotFound from "@/components/NotFound";
import { FiDollarSign } from "react-icons/fi";

export default function InvoiceNotFound() {
  return (
    <NotFound
      title="Invoice Not Found"
      description="The invoice you're looking for doesn't exist or has been removed."
      icon={FiDollarSign}
      backButtonLabel="Back to Invoices"
      backButtonPath="/invoices"
    />
  );
}
