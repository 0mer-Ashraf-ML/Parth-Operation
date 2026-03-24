"use client";

import { Flex, Spinner } from "@radix-ui/themes";

export interface TableDataLoaderProps {
  /** Minimum height of the loading region (matches main table shells) */
  minHeight?: number;
}

/**
 * Shared full-area loader for main list/grid pages while Redux/API data is loading.
 */
export function TableDataLoader({ minHeight = 500 }: TableDataLoaderProps) {
  return (
    <Flex
      align="center"
      justify="center"
      className="w-full"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
      style={{
        height: "100%",
        minHeight,
      }}
    >
      <Spinner size="3" />
    </Flex>
  );
}
