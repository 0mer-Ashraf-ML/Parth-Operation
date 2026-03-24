"use client";

import NotFound from "@/components/NotFound";
import { FiUsers } from "react-icons/fi";

export default function ClientNotFound() {
  return (
    <NotFound
      title="Client Not Found"
      description="The client you're looking for doesn't exist or has been removed."
      icon={FiUsers}
      backButtonLabel="Back to Clients"
      backButtonPath="/clients"
    />
  );
}
