import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import * as vendorsService from "../api/services/vendorsService";

export interface VendorAddress {
  id?: number;
  label: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
}

export interface Vendor {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  lead_time_weeks?: number;
  created_at: string;
  updated_at?: string;
  addresses?: VendorAddress[];
}

interface VendorsState {
  vendors: Vendor[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null; // timestamp of last successful fetch
}

const initialState: VendorsState = {
  vendors: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

/** Body for POST/PATCH `/vendors/{id}/addresses` */
export interface VendorAddressRequest {
  label: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
}

// Create vendor request interface
export interface CreateVendorRequest {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  lead_time_weeks?: number;
}

// Update vendor request interface
export interface UpdateVendorRequest {
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
  lead_time_weeks?: number;
}

// Async thunk for fetching vendors
export const fetchVendorsAsync = createAsyncThunk(
  "vendors/fetchVendors",
  async (_, { rejectWithValue }) => {
    try {
      const vendors = await vendorsService.fetchVendors();
      return vendors;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to fetch vendors");
    }
  }
);

// Async thunk for fetching a single vendor
export const fetchVendorByIdAsync = createAsyncThunk(
  "vendors/fetchVendorById",
  async (vendorId: string, { rejectWithValue }) => {
    try {
      const vendor = await vendorsService.fetchVendorById(vendorId);
      return vendor;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to fetch vendor");
    }
  }
);

// Async thunk for creating a vendor
export const createVendorAsync = createAsyncThunk(
  "vendors/createVendor",
  async (vendorData: CreateVendorRequest, { rejectWithValue }) => {
    try {
      const newVendor = await vendorsService.createVendor(vendorData);
      toast.success("Vendor created successfully");
      return newVendor;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to create vendor");
    }
  }
);

// Async thunk for updating a vendor
export const updateVendorAsync = createAsyncThunk(
  "vendors/updateVendor",
  async (
    { vendorId, vendorData }: { vendorId: number; vendorData: UpdateVendorRequest },
    { rejectWithValue }
  ) => {
    try {
      const updatedVendor = await vendorsService.updateVendor(vendorId, vendorData);
      toast.success("Vendor updated successfully");
      return updatedVendor;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to update vendor");
    }
  }
);

// Async thunk for deleting a vendor
export const deleteVendorAsync = createAsyncThunk(
  "vendors/deleteVendor",
  async (vendorId: number, { rejectWithValue }) => {
    try {
      await vendorsService.deleteVendor(vendorId);
      toast.success("Vendor deactivated successfully");
      return vendorId;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to deactivate vendor");
    }
  }
);

export const createVendorAddressAsync = createAsyncThunk(
  "vendors/createVendorAddress",
  async (
    { vendorId, addressData }: { vendorId: number; addressData: VendorAddressRequest },
    { rejectWithValue }
  ) => {
    try {
      const address = await vendorsService.createVendorAddress(vendorId, addressData);
      toast.success("Address created successfully");
      return { vendorId, address };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

export const updateVendorAddressAsync = createAsyncThunk(
  "vendors/updateVendorAddress",
  async (
    {
      vendorId,
      addressId,
      addressData,
    }: { vendorId: number; addressId: number; addressData: VendorAddressRequest },
    { rejectWithValue }
  ) => {
    try {
      const address = await vendorsService.updateVendorAddress(vendorId, addressId, addressData);
      toast.success("Address updated successfully");
      return { vendorId, address };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to update address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

export const deleteVendorAddressAsync = createAsyncThunk(
  "vendors/deleteVendorAddress",
  async (
    { vendorId, addressId }: { vendorId: number; addressId: number },
    { rejectWithValue }
  ) => {
    try {
      await vendorsService.deleteVendorAddress(vendorId, addressId);
      toast.success("Address deleted successfully");
      return { vendorId, addressId };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to delete address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const vendorsSlice = createSlice({
  name: "vendors",
  initialState,
  reducers: {
    clearVendors: (state) => {
      state.vendors = [];
      state.lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch vendors
    builder
      .addCase(fetchVendorsAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchVendorsAsync.fulfilled, (state, action: PayloadAction<Vendor[]>) => {
        state.isLoading = false;
        state.vendors = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchVendorsAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        toast.error(action.payload as string || "Failed to fetch vendors");
      });

    // Fetch vendor by ID
    builder
      .addCase(fetchVendorByIdAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchVendorByIdAsync.fulfilled, (state, action: PayloadAction<Vendor>) => {
        state.isLoading = false;
        const vendor = action.payload;
        const existingIndex = state.vendors.findIndex((v) => v.id === vendor.id);
        if (existingIndex >= 0) {
          state.vendors[existingIndex] = vendor;
        } else {
          state.vendors.push(vendor);
        }
        state.error = null;
      })
      .addCase(fetchVendorByIdAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        toast.error(action.payload as string || "Failed to fetch vendor");
      });

    // Create vendor
    builder
      .addCase(createVendorAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createVendorAsync.fulfilled, (state, action: PayloadAction<Vendor>) => {
        state.isLoading = false;
        // Add new vendor to the top of the array
        state.vendors.unshift(action.payload);
        state.error = null;
      })
      .addCase(createVendorAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        toast.error(action.payload as string || "Failed to create vendor");
      });

    // Update vendor
    builder
      .addCase(updateVendorAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateVendorAsync.fulfilled, (state, action: PayloadAction<Vendor>) => {
        state.isLoading = false;
        const updatedVendor = action.payload;
        const index = state.vendors.findIndex((v) => v.id === updatedVendor.id);
        if (index >= 0) {
          state.vendors[index] = updatedVendor;
        }
        state.error = null;
      })
      .addCase(updateVendorAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        toast.error(action.payload as string || "Failed to update vendor");
      });

    // Delete vendor
    builder
      .addCase(deleteVendorAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteVendorAsync.fulfilled, (state, action: PayloadAction<number>) => {
        state.isLoading = false;
        // Filter out the deleted vendor from the frontend
        state.vendors = state.vendors.filter((v) => v.id !== action.payload);
        state.error = null;
      })
      .addCase(deleteVendorAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        toast.error(action.payload as string || "Failed to deactivate vendor");
      });
  },
});

export const { clearVendors } = vendorsSlice.actions;
export default vendorsSlice.reducer;
