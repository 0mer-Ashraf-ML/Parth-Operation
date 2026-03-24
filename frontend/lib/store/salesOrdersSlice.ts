import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import {
  fetchSalesOrders,
  type SalesOrderApiResponse,
} from "../api/services/salesOrdersService";

// Use the API response type directly
export type SalesOrder = SalesOrderApiResponse;

interface SalesOrdersState {
  salesOrders: SalesOrder[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null; // timestamp of last successful fetch
}

const initialState: SalesOrdersState = {
  salesOrders: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

// Async thunk for fetching sales orders
export const fetchSalesOrdersAsync = createAsyncThunk(
  "salesOrders/fetchSalesOrders",
  async (_, { rejectWithValue }) => {
    try {
      const salesOrders = await fetchSalesOrders();
      return salesOrders;
    } catch (error: any) {
      const errorMessage = error.message || "Failed to fetch sales orders";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const salesOrdersSlice = createSlice({
  name: "salesOrders",
  initialState,
  reducers: {
    clearSalesOrders: (state) => {
      state.salesOrders = [];
      state.lastFetched = null;
    },
    addSalesOrder: (state, action: PayloadAction<SalesOrder>) => {
      // Add new sales order to the top of the array
      state.salesOrders = [action.payload, ...state.salesOrders];
    },
    updateSalesOrder: (state, action: PayloadAction<SalesOrder>) => {
      const index = state.salesOrders.findIndex((so) => so.id === action.payload.id);
      if (index >= 0) {
        state.salesOrders[index] = action.payload;
      }
    },
    removeSalesOrder: (state, action: PayloadAction<number>) => {
      state.salesOrders = state.salesOrders.filter((so) => so.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSalesOrdersAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSalesOrdersAsync.fulfilled, (state, action: PayloadAction<SalesOrderApiResponse[]>) => {
        state.isLoading = false;
        state.salesOrders = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchSalesOrdersAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to fetch sales orders";
        state.error = errorMessage;
      });
  },
});

export const { clearSalesOrders, addSalesOrder, updateSalesOrder, removeSalesOrder } =
  salesOrdersSlice.actions;
export default salesOrdersSlice.reducer;
