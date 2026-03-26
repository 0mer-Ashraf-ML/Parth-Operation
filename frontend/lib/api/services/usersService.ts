import { axiosClient, parseApiError } from "../axiosClient";
import type { ApiResponse } from "../types";

export type ApiUserRole = "admin" | "account_manager" | "vendor";

export interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  role: ApiUserRole;
  is_active: boolean;
  vendor_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: ApiUserRole;
  vendor_id?: number | null;
}

export interface UpdateUserRequest {
  email?: string;
  full_name?: string;
  password?: string;
  is_active?: boolean;
}

export interface UpdateUserRoleRequest {
  role: ApiUserRole;
  vendor_id?: number | null;
}

export const fetchUsers = async (): Promise<ApiUser[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<ApiUser[]>>("/users");
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error("Invalid response format");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const fetchUserById = async (userId: string): Promise<ApiUser> => {
  try {
    const response = await axiosClient.get<ApiResponse<ApiUser>>(`/users/${userId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error("Invalid response format");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const createUser = async (payload: CreateUserRequest): Promise<ApiUser> => {
  try {
    const response = await axiosClient.post<ApiResponse<ApiUser>>("/users", payload);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error("Invalid response format");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const updateUser = async (userId: string, payload: UpdateUserRequest): Promise<ApiUser> => {
  try {
    const response = await axiosClient.patch<ApiResponse<ApiUser>>(`/users/${userId}`, payload);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error("Invalid response format");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const deactivateUser = async (userId: string): Promise<string> => {
  try {
    const response = await axiosClient.delete<ApiResponse<{ message: string }>>(`/users/${userId}`);
    if (response.data.success && response.data.data) {
      return response.data.data.message;
    }
    throw new Error("Failed to deactivate user");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

export const updateUserRole = async (userId: string, payload: UpdateUserRoleRequest): Promise<ApiUser> => {
  try {
    const response = await axiosClient.patch<ApiResponse<ApiUser>>(`/users/${userId}/role`, payload);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error("Invalid response format");
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
