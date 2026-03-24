/**
 * Centralized API client with 401 handling
 */

import { getAccessToken, removeAccessToken } from "./auth";
import type { AppDispatch } from "../store";
import { logoutAsync } from "../store/authSlice";
import { toast } from "react-toastify";

const API_BASE_URL = "https://5572-44-222-197-242.ngrok-free.app/";

export interface ApiError {
  message: string;
  status?: number;
}

// Store reference will be set after store is created (lazy initialization)
let storeDispatch: AppDispatch | null = null;

/**
 * Initialize the API client with the store dispatch function
 * This should be called once after the store is created
 */
export const initializeApiClient = (dispatch: AppDispatch) => {
  storeDispatch = dispatch;
};

/**
 * Handle 401 Unauthorized responses by logging out the user
 */
const handle401 = async () => {
  // Don't redirect if already on login page
  if (typeof window !== "undefined" && window.location.pathname === "/login") {
    return;
  }

  // Clear token first
  removeAccessToken();
  
  // Dispatch logout action to clear Redux state if store is initialized
  if (storeDispatch) {
    await storeDispatch(logoutAsync());
  }
  
  // Redirect to login page (use window.location to force full page reload)
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

/**
 * Centralized API fetch wrapper with 401 handling
 */
export const apiFetch = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getAccessToken();
  
  // Add authorization header if token exists
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  
  if (token && !endpoint.includes("/auth/login")) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - automatically logout
  // BUT: Don't auto-logout for login endpoint (invalid credentials should show error, not logout)
  if (response.status === 401 && !endpoint.includes("/auth/login")) {
    // Show toast notification
    toast.error("Session expired. Please login again.");
    
    // Handle logout (don't await to avoid blocking the error throw)
    // But ensure it executes
    handle401().catch((error) => {
      console.error("Error during 401 logout handling:", error);
    });
    
    throw {
      message: "Session expired. Please login again.",
      status: 401,
    } as ApiError;
  }

  return response;
};

/**
 * Get API base URL
 */
export const getApiBaseUrl = () => API_BASE_URL;
