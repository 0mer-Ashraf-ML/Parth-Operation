"use client";

import NotFound from "@/components/NotFound";
import { FiAlertCircle } from "react-icons/fi";

export default function GlobalNotFound() {
  return (
    <NotFound
      title="404 - Page Not Found"
      description="The page you're looking for doesn't exist or has been moved."
      icon={FiAlertCircle}
      backButtonLabel="Go Back"
      showHomeButton={true}
    />
  );
}
