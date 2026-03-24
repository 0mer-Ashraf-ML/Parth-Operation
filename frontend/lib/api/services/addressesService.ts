/**
 * Addresses API Service
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import type { AddressRequest } from '@/lib/store/clientsSlice';

export interface Address {
  id: number;
  client_id: number;
  label: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
}

/**
 * Create an address for a client
 */
export const createAddress = async (
  clientId: number,
  addressData: AddressRequest
): Promise<Address> => {
  try {
    const response = await axiosClient.post<ApiResponse<Address>>(
      `/clients/${clientId}/addresses`,
      addressData
    );
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an address
 */
export const updateAddress = async (
  clientId: number,
  addressId: number,
  addressData: AddressRequest
): Promise<Address> => {
  try {
    const response = await axiosClient.patch<ApiResponse<Address>>(
      `/clients/${clientId}/addresses/${addressId}`,
      addressData
    );
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete an address
 */
export const deleteAddress = async (clientId: number, addressId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(
      `/clients/${clientId}/addresses/${addressId}`
    );
    if (!response.data.success) {
      throw new Error('Failed to delete address');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
