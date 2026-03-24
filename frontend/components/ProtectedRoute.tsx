"use client";

import { useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Flex, Spinner } from "@radix-ui/themes";
import MainLayout from "./MainLayout";
import { useAppSelector } from "@/lib/store/hooks";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, accessToken } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Only check authentication status, don't fetch user data here
    if (!isAuthenticated && !isLoading && pathname !== "/login") {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  const content = useMemo(() => {
    // Show loading while checking authentication
    if (isLoading) {
      return (
        <Flex
          align="center"
          justify="center"
          style={{ 
            minHeight: "100vh",
            background: "var(--gray-1)",
          }}
        >
          <Spinner size="3" />
        </Flex>
      );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated || !accessToken) {
      return null;
    }

    return <MainLayout>{children}</MainLayout>;
  }, [isAuthenticated, isLoading, accessToken, children]);

  return content;
}
