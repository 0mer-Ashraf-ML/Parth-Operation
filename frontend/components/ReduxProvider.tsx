"use client";

import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/lib/store";
import { Flex, Spinner } from "@radix-ui/themes";
import { useState, useEffect } from "react";
import { initializeApiClient } from "@/lib/api/axiosClient";

export default function ReduxProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Mark component as mounted on client side
    setIsMounted(true);
    
    // Initialize API client with store dispatch for 401 handling
    initializeApiClient(store.dispatch);
  }, []);

  // Show loading state until client-side hydration is complete
  if (!isMounted) {
    return (
      <Provider store={store}>
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
      </Provider>
    );
  }

  return (
    <Provider store={store}>
      <PersistGate
        loading={
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
        }
        persistor={persistor}
      >
        {children}
      </PersistGate>
    </Provider>
  );
}
