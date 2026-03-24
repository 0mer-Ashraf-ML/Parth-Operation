"use client";

import NotFound from "@/components/NotFound";
import { FiTruck } from "react-icons/fi";

export default function VendorNotFound() {
  return (
    <NotFound
      title="Vendor Not Found"
      description="The vendor you're looking for doesn't exist or has been removed."
      icon={FiTruck}
      backButtonLabel="Back to Vendors"
      backButtonPath="/vendors"
    />
  );
}
