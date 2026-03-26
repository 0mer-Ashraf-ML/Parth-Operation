import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { login, refreshToken, getMe, LoginRequest, LoginResponse, MeResponse, removeAccessToken } from "../api/auth";
import { resetRoleScopedCache } from "./resetRoleScopedCache";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  vendor_id: number | null;
  client_ids: number[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  expiresInMinutes: number | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  expiresInMinutes: null,
};

// Async thunk for login
export const loginAsync = createAsyncThunk(
  "auth/login",
  async (credentials: LoginRequest, { rejectWithValue, dispatch }) => {
    try {
      const response: LoginResponse = await login(credentials);
      // Drop previous user's cached lists so vendor/AM never see admin-sized data
      resetRoleScopedCache(dispatch);
      return {
        accessToken: response.data.access_token,
        expiresInMinutes: response.data.expires_in_minutes,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Login failed");
    }
  }
);

// Async thunk for refreshing token
export const refreshTokenAsync = createAsyncThunk(
  "auth/refreshToken",
  async (_, { rejectWithValue }) => {
    try {
      const response = await refreshToken();
      // Update token and expiry on refresh
      return {
        accessToken: response.data.access_token,
        expiresInMinutes: response.data.expires_in_minutes,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Token refresh failed");
    }
  }
);

// Async thunk for getting current user
export const getMeAsync = createAsyncThunk(
  "auth/getMe",
  async (_, { rejectWithValue }) => {
    try {
      const response: MeResponse = await getMe();
      return {
        user_id: response.data.user_id,
        email: response.data.email,
        full_name: response.data.full_name,
        role: response.data.role,
        vendor_id: response.data.vendor_id,
        client_ids: response.data.client_ids,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to fetch user info");
    }
  }
);

// Async thunk for logout
export const logoutAsync = createAsyncThunk(
  "auth/logout",
  async (_, { dispatch }) => {
    resetRoleScopedCache(dispatch);
    removeAccessToken();
    // Clear persisted state from localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("persist:root");
      } catch (error) {
        console.error("Error clearing persisted state:", error);
      }
    }
    return null;
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action: PayloadAction<{ accessToken: string; user: User }>) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.accessToken;
        state.expiresInMinutes = action.payload.expiresInMinutes;
        state.isAuthenticated = true;
        state.error = null;
        // User data will be fetched separately via getMeAsync
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.accessToken = null;
        state.expiresInMinutes = null;
      });

    // Refresh token
    builder
      .addCase(refreshTokenAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(refreshTokenAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.accessToken;
        state.expiresInMinutes = action.payload.expiresInMinutes;
        state.isAuthenticated = true;
        state.error = null;
        // Keep existing user data, only update token and expiry
      })
      .addCase(refreshTokenAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.accessToken = null;
        state.expiresInMinutes = null;
        // Clear user data on refresh failure
        state.user = null;
      });

    // Get me
    builder
      .addCase(getMeAsync.pending, (state) => {
        // Don't set isLoading to true for getMe to avoid blocking UI
        state.error = null;
      })
      .addCase(getMeAsync.fulfilled, (state, action) => {
        state.user = {
          id: action.payload.user_id,
          email: action.payload.email,
          full_name: action.payload.full_name,
          role: action.payload.role,
          vendor_id: action.payload.vendor_id,
          client_ids: action.payload.client_ids,
        };
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(getMeAsync.rejected, (state, action) => {
        state.error = action.payload as string;
        // Don't clear authentication on getMe failure, just log the error
        // User might still have valid token
      });

    // Logout
    builder
      .addCase(logoutAsync.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = null;
        state.expiresInMinutes = null;
      });
  },
});

export const { clearError, setCredentials } = authSlice.actions;
export default authSlice.reducer;
