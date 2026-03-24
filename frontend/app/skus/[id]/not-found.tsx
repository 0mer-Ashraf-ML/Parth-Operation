"use client";

import NotFound from "@/components/NotFound";
import { FiPackage } from "react-icons/fi";

export default function SKUNotFound() {
  return (
    <NotFound
      title="SKU Not Found"
      description="The SKU you're looking for doesn't exist or has been removed."
      icon={FiPackage}
      backButtonLabel="Back to SKUs"
      backButtonPath="/skus"
    />
  );
}
