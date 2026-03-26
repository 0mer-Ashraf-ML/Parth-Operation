import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import "react-toastify/dist/ReactToastify.css";

import { Theme } from "@radix-ui/themes";
import AgGridProviderWrapper from "@/components/AgGridProviderWrapper";
import ReduxProvider from "@/components/ReduxProvider";
import { AllCommunityModule, ModuleRegistry } from "ag-charts-community";
import ToastContainer from "@/components/ToastContainer";
const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Parth",
  description: "Finance Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <html lang="en-US" style={{ background: "black" }}>
      <body
        className={`${poppins.variable} antialiased`}
        style={{ 
          fontFamily: "var(--font-poppins), sans-serif",
          background: "var(--gray-1)",
          margin: 0,
          padding: 0,
        }}
      >
        <Theme appearance="dark" style={{ fontFamily: "var(--font-poppins), sans-serif" }}>
          <ReduxProvider>
            <AgGridProviderWrapper>
              {children}
            </AgGridProviderWrapper>
            <ToastContainer />
          </ReduxProvider>
        </Theme>
      </body>
    </html>
  );
}
