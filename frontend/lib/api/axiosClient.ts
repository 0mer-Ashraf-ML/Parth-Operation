/**
 * Axios-based API client with interceptors and error handling
 * Follows best practices for maintainable and scalable code
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getAccessToken, removeAccessToken } from './auth';
import type { AppDispatch } from '../store';
import { logoutAsync } from '../store/authSlice';
import { toast } from 'react-toastify';

const API_BASE_URL = 'https://5572-44-222-197-242.ngrok-free.app/';

// Store reference for dispatch (lazy initialization)
let storeDispatch: AppDispatch | null = null;

/**
 * Initialize the API client with the store dispatch function
 */
export const initializeApiClient = (dispatch: AppDispatch) => {
  storeDispatch = dispatch;
};

/**
 * Parse API error responses (FastAPI validation errors and custom error formats)
 */
export const parseApiError = (error: any): string => {
  // Handle Axios error response
  if (error?.response?.data) {
    const errorData = error.response.data;
    
    // Custom error format: { success: false, error: { code, message } }
    if (errorData.error && typeof errorData.error === 'object') {
      if (errorData.error.message) {
        return errorData.error.message;
      }
      if (errorData.error.code) {
        return errorData.error.code;
      }
    }
    
    // FastAPI validation error format
    if (errorData.detail && Array.isArray(errorData.detail)) {
      const errorMessages = errorData.detail.map((err: any) => {
        if (err.msg) {
          const field = err.loc && err.loc.length > 1 ? err.loc[err.loc.length - 1] : 'field';
          return `${field}: ${err.msg}`;
        }
        return err.msg || JSON.stringify(err);
      });
      return errorMessages.join(', ');
    }
    
    // Simple error message
    if (errorData.detail && typeof errorData.detail === 'string') {
      return errorData.detail;
    }
    
    // Message field
    if (errorData.message) {
      return errorData.message;
    }
  }
  
  // Handle error object passed from interceptor
  if (error?.message && typeof error.message === 'string') {
    return error.message;
  }
  
  // Network error or other errors
  if (error.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
};

/**
 * Handle 401 Unauthorized responses
 */
const handle401 = async () => {
  if (typeof window !== 'undefined' && window.location.pathname === '/login') {
    return;
  }

  removeAccessToken();
  
  if (storeDispatch) {
    await storeDispatch(logoutAsync());
  }
  
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};

/**
 * Create and configure Axios instance
 */
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
    },
    timeout: 30000, // 30 seconds timeout
  });

  // Request interceptor - Add auth token
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getAccessToken();
      
      // Add authorization header if token exists and not login endpoint
      if (token && !config.url?.includes('/auth/login')) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      // If FormData is being sent, remove Content-Type header to let axios set it with boundary
      if (config.data instanceof FormData) {
        // Remove Content-Type to let axios automatically set multipart/form-data with boundary
        // Use delete operator to remove the header completely
        delete (config.headers as any)['Content-Type'];
      }
      
      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - Handle errors and 401
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      return response;
    },
    async (error: AxiosError) => {
      // Handle 401 Unauthorized
      if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
        toast.error('Session expired. Please login again.');
        await handle401();
        return Promise.reject({
          message: 'Session expired. Please login again.',
          status: 401,
        });
      }

      // Parse and format error message
      const errorMessage = parseApiError(error);
      
      // Don't show toast for 401 (already handled above)
      if (error.response?.status !== 401) {
        // Error toast will be shown in the calling code if needed
        // This prevents duplicate toasts
      }

      // Return error with original response data preserved for parsing
      return Promise.reject({
        ...error,
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data,
      });
    }
  );

  return instance;
};

// Export the configured Axios instance
export const axiosClient = createAxiosInstance();

// Export API base URL getter
export const getApiBaseUrl = () => API_BASE_URL;
