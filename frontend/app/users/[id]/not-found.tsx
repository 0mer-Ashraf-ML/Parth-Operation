"use client";

import NotFound from "@/components/NotFound";
import { FiUserX } from "react-icons/fi";

export default function UserNotFound() {
  return (
    <NotFound
      title="User Not Found"
      description="The user you're looking for doesn't exist or has been removed."
      icon={FiUserX}
      backButtonLabel="Back to Users"
      backButtonPath="/users"
    />
  );
}
