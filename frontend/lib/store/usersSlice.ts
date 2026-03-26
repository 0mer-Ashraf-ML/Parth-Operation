import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import * as usersService from "../api/services/usersService";

export type UserRole = usersService.ApiUserRole;

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  vendor_id: number | null;
  created_at: string;
  updated_at: string;
}

interface UsersState {
  users: User[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const initialState: UsersState = {
  users: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

export const fetchUsersAsync = createAsyncThunk("users/fetchUsers", async (_, { rejectWithValue }) => {
  try {
    return await usersService.fetchUsers();
  } catch (error: any) {
    return rejectWithValue(error.message || "Failed to fetch users");
  }
});

export const fetchUserByIdAsync = createAsyncThunk(
  "users/fetchUserById",
  async (userId: string, { rejectWithValue }) => {
    try {
      return await usersService.fetchUserById(userId);
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to fetch user");
    }
  }
);

export const createUserAsync = createAsyncThunk(
  "users/createUser",
  async (payload: usersService.CreateUserRequest, { rejectWithValue }) => {
    try {
      const created = await usersService.createUser(payload);
      toast.success("User created successfully");
      return created;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to create user");
    }
  }
);

export const updateUserAsync = createAsyncThunk(
  "users/updateUser",
  async (
    { userId, payload }: { userId: string; payload: usersService.UpdateUserRequest },
    { rejectWithValue }
  ) => {
    try {
      const updated = await usersService.updateUser(userId, payload);
      toast.success("User updated successfully");
      return updated;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to update user");
    }
  }
);

export const deactivateUserAsync = createAsyncThunk(
  "users/deactivateUser",
  async (userId: string, { rejectWithValue }) => {
    try {
      await usersService.deactivateUser(userId);
      toast.success("User deactivated successfully");
      return Number(userId);
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to deactivate user");
    }
  }
);

export const updateUserRoleAsync = createAsyncThunk(
  "users/updateUserRole",
  async (
    { userId, payload }: { userId: string; payload: usersService.UpdateUserRoleRequest },
    { rejectWithValue }
  ) => {
    try {
      return await usersService.updateUserRole(userId, payload);
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to update user role");
    }
  }
);

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    clearUsers: (state) => {
      state.users = [];
      state.lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsersAsync.fulfilled, (state, action: PayloadAction<User[]>) => {
        state.isLoading = false;
        state.users = action.payload;
        state.lastFetched = Date.now();
      })
      .addCase(fetchUsersAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || "Failed to fetch users";
      })
      .addCase(createUserAsync.fulfilled, (state, action: PayloadAction<User>) => {
        state.users = [action.payload, ...state.users];
      })
      .addCase(updateUserAsync.fulfilled, (state, action: PayloadAction<User>) => {
        const idx = state.users.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.users[idx] = action.payload;
      })
      .addCase(updateUserRoleAsync.fulfilled, (state, action: PayloadAction<User>) => {
        const idx = state.users.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.users[idx] = action.payload;
      })
      .addCase(fetchUserByIdAsync.fulfilled, (state, action: PayloadAction<User>) => {
        const idx = state.users.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.users[idx] = action.payload;
        else state.users.push(action.payload);
      })
      .addCase(deactivateUserAsync.fulfilled, (state, action: PayloadAction<number>) => {
        const idx = state.users.findIndex((u) => u.id === action.payload);
        if (idx !== -1) state.users[idx].is_active = false;
      });
  },
});

export const { clearUsers } = usersSlice.actions;
export default usersSlice.reducer;
