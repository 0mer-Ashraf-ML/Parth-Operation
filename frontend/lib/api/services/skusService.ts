/**
 * SKUs API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';

// API Response Types (snake_case from backend)
export interface SKUApiResponse {
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
  tier_prices?: TierPriceApiResponse[];
  sku_vendors?: any[];
}

export interface TierPriceApiResponse {
  id: number;
  sku_id: number;
  min_qty: number;
  max_qty: number | null;
  unit_price: string; // API returns as string
}

// Request Types
export interface CreateSKURequest {
  sku_code: string;
  name: string;
  description?: string;
  default_vendor_id: number | null;
  secondary_vendor_id?: number | null;
  track_inventory: boolean;
  inventory_count?: number;
  tier_prices?: {
    min_qty: number;
    max_qty: number | null;
    unit_price: number;
  }[];
}

export interface UpdateSKURequest {
  sku_code?: string;
  name?: string;
  description?: string;
  default_vendor_id?: number | null;
  secondary_vendor_id?: number | null;
  track_inventory?: boolean;
  inventory_count?: number;
  is_active?: boolean;
}

/**
 * Fetch all SKUs
 */
export const fetchSKUs = async (): Promise<SKUApiResponse[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<SKUApiResponse[]>>('/skus');
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Fetch a single SKU by ID
 */
export const fetchSKUById = async (skuId: string | number): Promise<SKUApiResponse> => {
  try {
    const response = await axiosClient.get<ApiResponse<SKUApiResponse>>(`/skus/${skuId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Create a new SKU
 */
export const createSKU = async (skuData: CreateSKURequest): Promise<SKUApiResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<SKUApiResponse>>('/skus', skuData);
    if (response.data.success && response.data.data) {
      const newSKU = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return newSKU;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing SKU
 */
export const updateSKU = async (
  skuId: number,
  skuData: UpdateSKURequest
): Promise<SKUApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<SKUApiResponse>>(`/skus/${skuId}`, skuData);
    if (response.data.success && response.data.data) {
      const updatedSKU = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return updatedSKU;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete/deactivate a SKU
 */
export const deleteSKU = async (skuId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(`/skus/${skuId}`);
    if (!response.data.success) {
      throw new Error('Failed to delete SKU');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

// Tier Price Management

export interface CreateTierPriceRequest {
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

export interface UpdateTierPriceRequest {
  min_qty?: number;
  max_qty?: number | null;
  unit_price?: number;
}

/**
 * Create a new tier price for a SKU
 */
export const createTierPrice = async (
  skuId: number,
  tierData: CreateTierPriceRequest
): Promise<TierPriceApiResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<TierPriceApiResponse>>(
      `/skus/${skuId}/tiers`,
      tierData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Replace all tier prices for a SKU
 */
export const replaceTierPrices = async (
  skuId: number,
  tiers: CreateTierPriceRequest[]
): Promise<TierPriceApiResponse[]> => {
  try {
    const response = await axiosClient.put<ApiResponse<TierPriceApiResponse[]>>(
      `/skus/${skuId}/tiers`,
      tiers
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update a specific tier price
 */
export const updateTierPrice = async (
  skuId: number,
  tierId: number,
  tierData: UpdateTierPriceRequest
): Promise<TierPriceApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<TierPriceApiResponse>>(
      `/skus/${skuId}/tiers/${tierId}`,
      tierData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete a specific tier price
 */
export const deleteTierPrice = async (skuId: number, tierId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message?: string }>>(
      `/skus/${skuId}/tiers/${tierId}`
    );
    if (!response.data.success) {
      throw new Error('Failed to delete tier price');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

// SKU Vendor Management

export interface SKUVendorResponse {
  id: number;
  sku_id: number;
  vendor_id: number;
  is_default: boolean;
  vendor_name: string | null;
}

export interface CreateSKUVendorRequest {
  vendor_id: number;
  is_default: boolean;
}

/**
 * Fetch all vendors linked to a SKU
 */
export const fetchSKUVendors = async (skuId: number): Promise<SKUVendorResponse[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<SKUVendorResponse[]>>(`/skus/${skuId}/vendors`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Link a vendor to a SKU
 */
export const linkVendorToSKU = async (
  skuId: number,
  vendorData: CreateSKUVendorRequest
): Promise<SKUVendorResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<SKUVendorResponse>>(
      `/skus/${skuId}/vendors`,
      vendorData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Unlink a vendor from a SKU
 */
export const unlinkVendorFromSKU = async (skuId: number, vendorId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(
      `/skus/${skuId}/vendors/${vendorId}`
    );
    if (!response.data.success) {
      throw new Error('Failed to unlink vendor from SKU');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
