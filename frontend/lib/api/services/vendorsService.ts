/**
 * Vendors API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import type { Vendor, CreateVendorRequest, UpdateVendorRequest } from '@/lib/store/vendorsSlice';

/**
 * Fetch all vendors
 */
export const fetchVendors = async (): Promise<Vendor[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<Vendor[]>>('/vendors');
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
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
