/**
 * Clients API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import type { Client, CreateClientRequest, UpdateClientRequest } from '@/lib/store/clientsSlice';

/**
 * Fetch all clients
 */
export const fetchClients = async (): Promise<Client[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<Client[]>>('/clients');
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Fetch a single client by ID
 */
export const fetchClientById = async (clientId: string): Promise<Client> => {
  try {
    const response = await axiosClient.get<ApiResponse<Client>>(`/clients/${clientId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Create a new client
 */
export const createClient = async (clientData: CreateClientRequest): Promise<Client> => {
  try {
    const response = await axiosClient.post<ApiResponse<Client>>('/clients', clientData);
    if (response.data.success && response.data.data) {
      const newClient = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return newClient;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing client
 */
export const updateClient = async (
  clientId: number,
  clientData: UpdateClientRequest
): Promise<Client> => {
  try {
    const response = await axiosClient.patch<ApiResponse<Client>>(`/clients/${clientId}`, clientData);
    if (response.data.success && response.data.data) {
      const updatedClient = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return updatedClient;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete/deactivate a client
 */
export const deleteClient = async (clientId: number): Promise<void> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(`/clients/${clientId}`);
    if (!response.data.success) {
      throw new Error('Failed to delete client');
    }
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
