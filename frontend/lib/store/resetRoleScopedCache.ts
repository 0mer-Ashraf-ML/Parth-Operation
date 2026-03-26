import type { Dispatch } from "@reduxjs/toolkit";
import { clearClients } from "./clientsSlice";
import { clearVendors } from "./vendorsSlice";
import { clearUsers } from "./usersSlice";
import { clearSKUs } from "./skusSlice";
import { clearSalesOrders } from "./salesOrdersSlice";
import { clearPurchaseOrders } from "./purchaseOrdersSlice";

/**
 * Clears all cached entity lists that are scoped by the current user (admin vs vendor vs AM).
 * Must run on logout and on successful login so a new session refetches with correct permissions.
 */
export function resetRoleScopedCache(dispatch: Dispatch) {
  dispatch(clearClients());
  dispatch(clearVendors());
  dispatch(clearUsers());
  dispatch(clearSKUs());
  dispatch(clearSalesOrders());
  dispatch(clearPurchaseOrders());
}
