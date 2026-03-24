"use client";

import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider } from 'ag-grid-react';
import { ReactNode } from 'react';

const modules = [AllCommunityModule];

interface AgGridProviderWrapperProps {
  children: ReactNode;
}

export default function AgGridProviderWrapper({ children }: AgGridProviderWrapperProps) {
  return (
    <AgGridProvider modules={modules}>
      {children}
    </AgGridProvider>
  );
}
