"use client";

import type { CSSProperties, ReactNode } from "react";

const agGridThemeVariables = {
  height: "100%",
  width: "100%",
  "--ag-background-color": "var(--color-dark-bg-secondary)",
  "--ag-header-background-color": "var(--color-dark-bg-tertiary)",
  "--ag-odd-row-background-color": "var(--color-dark-bg)",
  "--ag-row-hover-color": "var(--color-primary-hover)",
  "--ag-header-foreground-color": "var(--color-text-primary)",
  "--ag-foreground-color": "var(--color-text-primary)",
  "--ag-border-color": "var(--color-dark-bg-tertiary)",
} as CSSProperties;

export interface AgGridThemeShellProps {
  children: ReactNode;
  /** Extra classes on the wrapper (e.g. h-full) */
  className?: string;
  /** Merged after base layout + theme variables */
  style?: CSSProperties;
}

/**
 * Shared AG Grid host: `ag-theme-alpine-dark` + app dark CSS variables.
 * Use inside a sized parent (e.g. table shell with minHeight).
 */
export function AgGridThemeShell({ children, className, style }: AgGridThemeShellProps) {
  return (
    <div
      className={["ag-theme-alpine-dark", "min-w-0", className].filter(Boolean).join(" ")}
      style={{ ...agGridThemeVariables, ...style }}
    >
      {children}
    </div>
  );
}
