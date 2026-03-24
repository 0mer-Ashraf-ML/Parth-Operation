/**
 * Contacts API Service
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import type { ContactRequest } from '@/lib/store/clientsSlice';

export interface Contact {
  id: number;
  client_id: number;
  contact_type: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Create a contact for a client
 */
export const createContact = async (
  clientId: number,
  contactData: ContactRequest
): Promise<Contact> => {
  try {
    const response = await axiosClient.post<ApiResponse<Contact>>(
      `/clients/${clientId}/contacts`,
      contactData
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
 * Update a contact
 */
export const updateContact = async (
  clientId: number,
  contactId: number,
  contactData: ContactRequest
): Promise<Contact> => {
  try {
    const response = await axiosClient.patch<ApiResponse<Contact>>(
      `/clients/${clientId}/contacts/${contactId}`,
      contactData
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
 * Delete a contact
 */
export const deleteContact = async (clientId: number, contactId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(
      `/clients/${clientId}/contacts/${contactId}`
    );
    if (!response.data.success) {
      throw new Error('Failed to delete contact');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
