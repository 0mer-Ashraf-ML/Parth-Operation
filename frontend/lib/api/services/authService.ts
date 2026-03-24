/**
 * Authentication API Service
 */

import { axiosClient, parseApiError } from '../axiosClient';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    expires_in_minutes: number;
  };
}

export interface MeResponse {
  success: boolean;
  data: {
    id: number;
    email: string;
    full_name: string;
    role: string;
    vendor_id: number | null;
    client_ids: number[];
  };
}

/**
 * Login user
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  try {
    const response = await axiosClient.post<LoginResponse>('/auth/login', credentials);
    return response.data;
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (): Promise<LoginResponse> => {
  try {
    const response = await axiosClient.post<LoginResponse>('/auth/refresh');
    return response.data;
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Get current user info
 */
export const getMe = async (): Promise<MeResponse> => {
  try {
    const response = await axiosClient.get<MeResponse>('/auth/me');
    return response.data;
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
