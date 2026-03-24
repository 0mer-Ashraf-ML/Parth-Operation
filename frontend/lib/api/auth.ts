/**
 * Authentication API service
 * Token management and authentication functions
 */

import { axiosClient, parseApiError } from "./axiosClient";
import { setAccessToken as saveToken } from "./auth";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    token_type: string;
    expires_in_minutes: number;
    user: {
      id: number;
      email: string;
      full_name: string;
      role: string;
      vendor_id: number | null;
      client_ids: number[];
    };
  };
}

export interface RefreshResponse {
  success: boolean;
  data: {
    access_token: string;
    token_type: string;
    expires_in_minutes: number;
    user: {
      id: number;
      email: string;
      full_name: string;
      role: string;
      vendor_id: number | null;
      client_ids: number[];
    };
  };
}

export interface MeResponse {
  success: boolean;
  data: {
    user_id: number;
    role: string;
    client_ids: number[];
    vendor_id: number | null;
    email: string;
    full_name: string;
  };
}

// Re-export types
export interface ApiError {
  message: string;
  status?: number;
}

/**
 * Get the stored access token
 */
export const getAccessToken = (): string | null => {
  
  return localStorage.getItem("access_token");
};

/**
 * Set the access token
 */
export const setAccessToken = (token: string): void => {
  
  localStorage.setItem("access_token", token);
};

/**
 * Remove the access token
 */
export const removeAccessToken = (): void => {
  
  localStorage.removeItem("access_token");
};

/**
 * Login API call
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  try {
    const response = await axiosClient.post<LoginResponse>("/auth/login", credentials);
    const data = response.data;
    
    // Store the token
    if (data.success && data.data.access_token) {
      saveToken(data.data.access_token);
    }

    return data;
  } catch (error: any) {
    const errorMessage = parseApiError(error);
    throw {
      message: errorMessage || "Login failed",
      status: error.response?.status || 0,
    } as ApiError;
  }
};

/**
 * Refresh token API call
 */
export const refreshToken = async (): Promise<RefreshResponse> => {
  const token = getAccessToken();
  
  if (!token) {
    throw {
      message: "No access token available",
      status: 401,
    } as ApiError;
  }

  try {
    const response = await axiosClient.post<RefreshResponse>("/auth/refresh");
    const data = response.data;
    
    // Update the stored token
    if (data.success && data.data.access_token) {
      saveToken(data.data.access_token);
    }

    return data;
  } catch (error: any) {
    const errorMessage = parseApiError(error);
    throw {
      message: errorMessage || "Token refresh failed",
      status: error.response?.status || 401,
    } as ApiError;
  }
};

/**
 * Get current user info API call
 */
export const getMe = async (): Promise<MeResponse> => {
  const token = getAccessToken();
  
  if (!token) {
    throw {
      message: "No access token available",
      status: 401,
    } as ApiError;
  }

  try {
    const response = await axiosClient.get<MeResponse>("/auth/me");
    return response.data;
  } catch (error: any) {
    const errorMessage = parseApiError(error);
    throw {
      message: errorMessage || "Failed to fetch user info",
      status: error.response?.status || 401,
    } as ApiError;
  }
};
