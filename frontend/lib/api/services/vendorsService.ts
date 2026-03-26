/**
 * Vendors API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import type {
  Vendor,
  VendorAddress,
  VendorAddressRequest,
  CreateVendorRequest,
  UpdateVendorRequest,
} from '@/lib/store/vendorsSlice';

/** Normalize GET /vendors body: plain array, or wrapped `{ vendors | items | data: [] }`. */
function normalizeVendorListPayload(data: unknown): Vendor[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data as Vendor[];
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.vendors)) {
      return o.vendors as Vendor[];
    }
    if (Array.isArray(o.items)) {
      return o.items as Vendor[];
    }
    if (Array.isArray(o.results)) {
      return o.results as Vendor[];
    }
    if (Array.isArray(o.data)) {
      return normalizeVendorListPayload(o.data);
    }
    if (typeof o.id === 'number' && o.company_name != null) {
      return [data as Vendor];
    }
  }
  return [];
}

/**
 * Fetch all vendors
 */
export const fetchVendors = async (): Promise<Vendor[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<unknown>>('/vendors');
    if (response.data.success && response.data.data != null) {
      const list = normalizeVendorListPayload(response.data.data);
      return list;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Fetch a single vendor by ID
 */
export const fetchVendorById = async (vendorId: string): Promise<Vendor> => {
  try {
    const response = await axiosClient.get<ApiResponse<Vendor>>(`/vendors/${vendorId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Create a new vendor
 */
export const createVendor = async (vendorData: CreateVendorRequest): Promise<Vendor> => {
  try {
    const response = await axiosClient.post<ApiResponse<Vendor>>('/vendors', vendorData);
    if (response.data.success && response.data.data) {
      const newVendor = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return newVendor;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing vendor
 */
export const updateVendor = async (
  vendorId: number,
  vendorData: UpdateVendorRequest
): Promise<Vendor> => {
  try {
    const response = await axiosClient.patch<ApiResponse<Vendor>>(`/vendors/${vendorId}`, vendorData);
    if (response.data.success && response.data.data) {
      const updatedVendor = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return updatedVendor;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete/deactivate a vendor
 */
export const deleteVendor = async (vendorId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(`/vendors/${vendorId}`);
    if (!response.data.success) {
      throw new Error('Failed to delete vendor');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const createVendorAddress = async (
  vendorId: number,
  addressData: VendorAddressRequest
): Promise<VendorAddress> => {
  try {
    const response = await axiosClient.post<ApiResponse<VendorAddress>>(
      `/vendors/${vendorId}/addresses`,
      addressData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const updateVendorAddress = async (
  vendorId: number,
  addressId: number,
  addressData: VendorAddressRequest
): Promise<VendorAddress> => {
  try {
    const response = await axiosClient.patch<ApiResponse<VendorAddress>>(
      `/vendors/${vendorId}/addresses/${addressId}`,
      addressData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const deleteVendorAddress = async (vendorId: number, addressId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(
      `/vendors/${vendorId}/addresses/${addressId}`
    );
    if (!response.data.success) {
      throw new Error('Failed to delete address');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/** SKU row from `GET /vendors/{id}/clients`. */
export interface VendorClientSku {
  sku_code: string;
  sku_name: string;
  relationship: string;
  /** When present, links directly to `/skus/{sku_id}`. */
  sku_id?: number;
}

/** Client row from `GET /vendors/{id}/clients`. */
export interface VendorClientLink {
  client_id: number;
  company_name: string;
  skus: VendorClientSku[];
}

/**
 * Clients (and their SKUs) associated with a vendor.
 * GET /vendors/{vendorId}/clients
 */
export const fetchVendorClients = async (vendorId: string): Promise<VendorClientLink[]> => {
  try {
    const response = await axiosClient.get<
      ApiResponse<{ clients: VendorClientLink[] }>
    >(`/vendors/${vendorId}/clients`);
    if (response.data.success && response.data.data?.clients) {
      return response.data.data.clients;
    }
    return [];
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
