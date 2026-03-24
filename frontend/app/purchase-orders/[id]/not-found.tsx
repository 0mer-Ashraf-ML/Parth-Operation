"use client";

import NotFound from "@/components/NotFound";
import { FiShoppingCart } from "react-icons/fi";

export default function PurchaseOrderNotFound() {
  return (
    <NotFound
      title="Purchase Order Not Found"
      description="The purchase order you're looking for doesn't exist or has been removed."
      icon={FiShoppingCart}
      backButtonLabel="Back to Purchase Orders"
      backButtonPath="/purchase-orders"
    />
  );
}
