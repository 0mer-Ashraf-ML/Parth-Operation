import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import * as clientsService from "../api/services/clientsService";
import * as contactsService from "../api/services/contactsService";
import * as addressesService from "../api/services/addressesService";

/** Client address classification for `/clients/.../addresses` (API enum values). */
export type ClientAddressType = "ship_to" | "billing";

/** Ship-to picker: everything except explicit `billing` (includes legacy rows with no type). */
export function isClientShipToAddress(addr: { address_type?: string }): boolean {
  if (addr.address_type == null || addr.address_type === "") return true;
  return String(addr.address_type).toLowerCase() !== "billing";
}

export interface Contact {
  id?: number;
  client_id?: number;
  contact_type: string;
  name: string;
  email: string;
  phone: string;
}

export interface Address {
  id?: number;
  client_id?: number;
  label: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
  address_type?: ClientAddressType;
}

export interface Client {
  id: number;
  company_name: string;
  payment_terms: number;
  tax_percentage: string;
  discount_percentage: string;
  auto_invoice: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  notes?: string;
  contacts?: Contact[];
  addresses?: Address[];
}

interface ApiResponse {
  success: boolean;
  data: Client[] | Client;
}

interface ClientsState {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null; // timestamp of last successful fetch
}

const initialState: ClientsState = {
  clients: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

// Create client request interface
export interface CreateClientRequest {
  company_name: string;
  payment_terms: number;
  tax_percentage: number;
  discount_percentage: number;
  auto_invoice: boolean;
  notes?: string;
  contacts?: Array<{
    contact_type: string;
    name: string;
    email: string;
    phone: string;
  }>;
  addresses?: Array<{
    label: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    is_default: boolean;
    address_type: ClientAddressType;
  }>;
}

// Update client request interface
export interface UpdateClientRequest {
  company_name: string;
  payment_terms: number;
  tax_percentage: number;
  discount_percentage: number;
  auto_invoice: boolean;
  notes?: string;
  is_active?: boolean;
}

// Async thunk for fetching clients
export const fetchClientsAsync = createAsyncThunk(
  "clients/fetchClients",
  async (_, { rejectWithValue }) => {
    try {
      return await clientsService.fetchClients();
    } catch (error: any) {
      const errorMessage = error.message || "Failed to fetch clients";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for fetching a single client by ID
export const fetchClientByIdAsync = createAsyncThunk(
  "clients/fetchClientById",
  async (clientId: string, { rejectWithValue }) => {
    try {
      return await clientsService.fetchClientById(clientId);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to fetch client";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for creating a client
export const createClientAsync = createAsyncThunk(
  "clients/createClient",
  async (clientData: CreateClientRequest, { rejectWithValue }) => {
    try {
      const newClient = await clientsService.createClient(clientData);
      toast.success("Client created successfully");
      return newClient;
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create client";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for updating a client
export const updateClientAsync = createAsyncThunk(
  "clients/updateClient",
  async (
    { clientId, clientData }: { clientId: number; clientData: UpdateClientRequest },
    { rejectWithValue }
  ) => {
    try {
      const updatedClient = await clientsService.updateClient(clientId, clientData);
      toast.success("Client updated successfully");
      return updatedClient;
    } catch (error: any) {
      const errorMessage = error.message || "Failed to update client";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Contact request interface
export interface ContactRequest {
  contact_type: string;
  name: string;
  email: string;
  phone: string;
}

// Address request interface
export interface AddressRequest {
  label: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
  address_type: ClientAddressType;
}

// Async thunk for creating a contact
export const createContactAsync = createAsyncThunk(
  "clients/createContact",
  async (
    { clientId, contactData }: { clientId: number; contactData: ContactRequest },
    { rejectWithValue }
  ) => {
    try {
      const contact = await contactsService.createContact(clientId, contactData);
      toast.success("Contact created successfully");
      return { clientId, contact };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create contact";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for updating a contact
export const updateContactAsync = createAsyncThunk(
  "clients/updateContact",
  async (
    {
      clientId,
      contactId,
      contactData,
    }: { clientId: number; contactId: number; contactData: ContactRequest },
    { rejectWithValue }
  ) => {
    try {
      const contact = await contactsService.updateContact(clientId, contactId, contactData);
      toast.success("Contact updated successfully");
      return { clientId, contact };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to update contact";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for deleting a contact
export const deleteContactAsync = createAsyncThunk(
  "clients/deleteContact",
  async (
    { clientId, contactId }: { clientId: number; contactId: number },
    { rejectWithValue }
  ) => {
    try {
      await contactsService.deleteContact(clientId, contactId);
      toast.success("Contact deleted successfully");
      return { clientId, contactId };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to delete contact";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for creating an address
export const createAddressAsync = createAsyncThunk(
  "clients/createAddress",
  async (
    { clientId, addressData }: { clientId: number; addressData: AddressRequest },
    { rejectWithValue }
  ) => {
    try {
      const address = await addressesService.createAddress(clientId, addressData);
      toast.success("Address created successfully");
      return { clientId, address };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for updating an address
export const updateAddressAsync = createAsyncThunk(
  "clients/updateAddress",
  async (
    {
      clientId,
      addressId,
      addressData,
    }: { clientId: number; addressId: number; addressData: AddressRequest },
    { rejectWithValue }
  ) => {
    try {
      const address = await addressesService.updateAddress(clientId, addressId, addressData);
      toast.success("Address updated successfully");
      return { clientId, address };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to update address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for deleting an address
export const deleteAddressAsync = createAsyncThunk(
  "clients/deleteAddress",
  async (
    { clientId, addressId }: { clientId: number; addressId: number },
    { rejectWithValue }
  ) => {
    try {
      await addressesService.deleteAddress(clientId, addressId);
      toast.success("Address deleted successfully");
      return { clientId, addressId };
    } catch (error: any) {
      const errorMessage = error.message || "Failed to delete address";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for deleting/deactivating a client
export const deleteClientAsync = createAsyncThunk(
  "clients/deleteClient",
  async (clientId: number, { rejectWithValue }) => {
    try {
      await clientsService.deleteClient(clientId);
      toast.success("Client deactivated successfully");
      return clientId; // Return the client ID to remove from state
    } catch (error: any) {
      const errorMessage = error.message || "Failed to delete client";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const clientsSlice = createSlice({
  name: "clients",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearClients: (state) => {
      state.clients = [];
      state.lastFetched = null;
    },
    removeClients: (state, action: PayloadAction<number[]>) => {
      // Filter out clients with IDs in the provided array
      state.clients = state.clients.filter(
        (client) => !action.payload.includes(client.id)
      );
    },
    addClient: (state, action: PayloadAction<Client>) => {
      // Add new client to the top of the array
      state.clients = [action.payload, ...state.clients];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClientsAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchClientsAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.clients = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchClientsAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to fetch clients";
        state.error = errorMessage;
        // Show toast notification for error
        toast.error(errorMessage);
      });

    // Fetch client by ID
    builder
      .addCase(fetchClientByIdAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchClientByIdAsync.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(fetchClientByIdAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to fetch client";
        state.error = errorMessage;
        // Show toast notification for error
        toast.error(errorMessage);
      });

    // Create client
    builder
      .addCase(createClientAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createClientAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Add new client to the top of the array
        state.clients = [action.payload, ...state.clients];
        state.error = null;
      })
      .addCase(createClientAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to create client";
        state.error = errorMessage;
      
      });

    // Update client
    builder
      .addCase(updateClientAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateClientAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update the client in the state
        const index = state.clients.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.clients[index] = action.payload;
        }
        state.error = null;
        
      })
      .addCase(updateClientAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to update client";
        state.error = errorMessage;
        // Show toast notification for error
        toast.error(errorMessage);
      });

    // Delete client
    builder
      .addCase(deleteClientAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteClientAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Remove the deleted client from the state
        state.clients = state.clients.filter(
          (client) => client.id !== action.payload
        );
        state.error = null;
        // Don't show toast here - let the component handle it for better control
      })
      .addCase(deleteClientAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to delete client";
        state.error = errorMessage;
        // Show toast notification for error
        toast.error(errorMessage);
      });

    // Create contact
    builder
      .addCase(createContactAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createContactAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update the client's contacts array
        const client = state.clients.find((c) => c.id === action.payload.clientId);
        if (client) {
          if (!client.contacts) {
            client.contacts = [];
          }
          client.contacts.push(action.payload.contact);
        }
        state.error = null;
        // Toast is already shown in the async thunk
      })
      .addCase(createContactAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to create contact";
        state.error = errorMessage;
        toast.error(errorMessage);
      });

    // Update contact
    builder
      .addCase(updateContactAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateContactAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update the contact in the client's contacts array
        const client = state.clients.find((c) => c.id === action.payload.clientId);
        if (client && client.contacts) {
          const index = client.contacts.findIndex((c) => c.id === action.payload.contact.id);
          if (index !== -1) {
            client.contacts[index] = action.payload.contact;
          }
        }
        state.error = null;
        // Toast is already shown in the async thunk
      })
      .addCase(updateContactAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to update contact";
        state.error = errorMessage;
        toast.error(errorMessage);
      });

    // Delete contact
    builder
      .addCase(deleteContactAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteContactAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        // Remove the contact from the client's contacts array
        const client = state.clients.find((c) => c.id === action.payload.clientId);
        if (client && client.contacts) {
          client.contacts = client.contacts.filter((c) => c.id !== action.payload.contactId);
        }
        state.error = null;
        // Toast is already shown in the async thunk
      })
      .addCase(deleteContactAsync.rejected, (state, action) => {
        state.isLoading = false;
        const errorMessage = (action.payload as string) || "Failed to delete contact";
        state.error = errorMessage;
        toast.error(errorMessage);
      });
  },
});

export const { clearError, clearClients, removeClients, addClient } = clientsSlice.actions;
export default clientsSlice.reducer;
