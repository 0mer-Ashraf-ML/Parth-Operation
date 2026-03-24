import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import {
  fetchPurchaseOrders,
  type PurchaseOrderApiResponse,
} from "../api/services/purchaseOrdersService";

// Use the API response type directly
export type PurchaseOrder = PurchaseOrderApiResponse;

interface PurchaseOrdersState {
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null; // timestamp of last successful fetch
}

const initialState: PurchaseOrdersState = {
  purchaseOrders: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

// Async thunk for fetching purchase orders
export const fetchPurchaseOrdersAsync = createAsyncThunk(
  "purchaseOrders/fetchPurchaseOrders",
  async (_, { rejectWithValue }) => {
    try {
      const purchaseOrders = await fetchPurchaseOrders();
      return purchaseOrders;
    } catch (error: any) {
      const errorMessage = error.message || "Failed to fetch purchase orders";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const purchaseOrdersSlice = createSlice({
  name: "purchaseOrders",
  initialState,
  reducers: {
    clearPurchaseOrders: (state) => {
      state.purchaseOrders = [];
      state.lastFetched = null;
    },
    addPurchaseOrder: (state, action: PayloadAction<PurchaseOrder>) => {
      // Add new purchase order to the top of the array
      state.purchaseOrders = [action.payload, ...state.purchaseOrders];
    },
    updatePurchaseOrder: (state, action: PayloadAction<PurchaseOrder>) => {
      const index = state.purchaseOrders.findIndex((po) => po.id === action.payload.id);
      if (index >= 0) {
        state.purchaseOrders[index] = action.payload;
      }
    },
    removePurchaseOrder: (state, action: PayloadAction<number>) => {
      state.purchaseOrders = state.purchaseOrders.filter((po) => po.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchaseOrdersAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPurchaseOrdersAsync.fulfilled, (state, action: PayloadAction<PurchaseOrderApiResponse[]>) => {
        state.isLoading = false;
        state.purchaseOrders = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchPurchaseOrdersAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to fetch purchase orders";
        state.error = errorMessage;
      });
  },
});

export const {
  clearPurchaseOrders,
  addPurchaseOrder,
  updatePurchaseOrder,
  removePurchaseOrder,
} = purchaseOrdersSlice.actions;
export default purchaseOrdersSlice.reducer;
