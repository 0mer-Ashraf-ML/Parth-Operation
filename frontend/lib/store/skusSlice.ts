import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { fetchSKUs, type SKUApiResponse } from "../api/services/skusService";

export interface SKU {
  id: number;
  sku_code: string;
  name: string;
  description?: string | null;
  default_vendor_id: number | null;
  secondary_vendor_id: number | null;
  track_inventory: boolean;
  inventory_count: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  tier_prices?: Array<{
    id: number;
    sku_id: number;
    min_qty: number;
    max_qty: number | null;
    unit_price: string;
  }>;
}

interface SKUsState {
  skus: SKU[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null; // timestamp of last successful fetch
}

const initialState: SKUsState = {
  skus: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

// Helper function to map API response to frontend structure
const mapSKUFromApi = (apiSKU: SKUApiResponse): SKU => {
  return {
    id: apiSKU.id,
    sku_code: apiSKU.sku_code,
    name: apiSKU.name,
    description: apiSKU.description,
    default_vendor_id: apiSKU.default_vendor_id,
    secondary_vendor_id: apiSKU.secondary_vendor_id ?? null,
    track_inventory: apiSKU.track_inventory,
    inventory_count: apiSKU.inventory_count,
    is_active: apiSKU.is_active,
    created_at: apiSKU.created_at,
    updated_at: apiSKU.updated_at,
    tier_prices: apiSKU.tier_prices?.map((tp) => ({
      id: tp.id,
      sku_id: tp.sku_id,
      min_qty: tp.min_qty,
      max_qty: tp.max_qty,
      unit_price: tp.unit_price,
    })),
  };
};

// Async thunk for fetching SKUs
export const fetchSKUsAsync = createAsyncThunk(
  "skus/fetchSKUs",
  async (_, { rejectWithValue }) => {
    try {
      const skus = await fetchSKUs();
      return skus.map(mapSKUFromApi);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to fetch SKUs";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const skusSlice = createSlice({
  name: "skus",
  initialState,
  reducers: {
    clearSKUs: (state) => {
      state.skus = [];
      state.lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSKUsAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSKUsAsync.fulfilled, (state, action: PayloadAction<SKU[]>) => {
        state.isLoading = false;
        state.skus = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchSKUsAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to fetch SKUs";
        state.error = errorMessage;
      });
  },
});

export const { clearSKUs } = skusSlice.actions;
export default skusSlice.reducer;
