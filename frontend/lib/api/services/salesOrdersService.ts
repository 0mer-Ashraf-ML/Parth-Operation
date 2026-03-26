/**
 * Sales Orders API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';

// API Response Types (snake_case from backend)
export interface SalesOrderLineApiResponse {
  id: number;
  sales_order_id: number;
  sku_id: number;
  line_number: number;
  ordered_qty: number;
  unit_price: number;
  due_date: string | null;
  delivered_qty: number;
  invoiced_qty: number;
  remaining_qty: number;
  invoiceable_qty: number;
  sku_code: string;
  sku_name: string;
}

export interface SalesOrderApiResponse {
  id: number;
  order_number: string;
  client_id: number;
  client_name: string;
  ship_to_address_id: number | null;
  status: string;
  /** Billing / payment lifecycle (snake_case from API). */
  payment_status?: string | null;
  order_date: string | null;
  due_date: string | null;
  original_pdf_url: string | null;
  notes: string | null;
  created_by: number;
  creator_name: string;
  is_deletable: boolean;
  created_at: string;
  updated_at: string;
  line_count?: number;
  total_amount?: number;
  lines?: SalesOrderLineApiResponse[];
}

// Request Types
export interface CreateSalesOrderRequest {
  order_number: string;
  client_id: number;
  ship_to_address_id?: number | null;
  order_date?: string | null;
  due_date?: string | null;
  original_pdf_url?: string | null;
  notes?: string | null;
  lines: {
    sku_id: number;
    line_number: number;
    ordered_qty: number;
    unit_price?: number;
    due_date?: string | null;
  }[];
}

export interface UpdateSalesOrderRequest {
  order_number?: string;
  ship_to_address_id?: number | null;
  order_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface CreateSalesOrderLineRequest {
  sku_id: number;
  line_number: number;
  ordered_qty: number;
  unit_price?: number;
  due_date?: string | null;
}

export interface UpdateSalesOrderLineRequest {
  ordered_qty?: number;
  due_date?: string | null;
}

/**
 * Fetch all sales orders
 */
export const fetchSalesOrders = async (): Promise<SalesOrderApiResponse[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<SalesOrderApiResponse[]>>('/sales-orders');
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Fetch a single sales order by ID
 */
export const fetchSalesOrderById = async (soId: string | number): Promise<SalesOrderApiResponse> => {
  try {
    const response = await axiosClient.get<ApiResponse<SalesOrderApiResponse>>(`/sales-orders/${soId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Create a new sales order
 */
export const createSalesOrder = async (soData: CreateSalesOrderRequest): Promise<SalesOrderApiResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<SalesOrderApiResponse>>('/sales-orders', soData);
    if (response.data.success && response.data.data) {
      const newSO = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return newSO;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing sales order (header fields only)
 */
export const updateSalesOrder = async (
  soId: number,
  soData: UpdateSalesOrderRequest
): Promise<SalesOrderApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<SalesOrderApiResponse>>(`/sales-orders/${soId}`, soData);
    if (response.data.success && response.data.data) {
      const updatedSO = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
      return updatedSO;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete a sales order
 */
export const deleteSalesOrder = async (soId: number): Promise<void> => {
  try {
    await axiosClient.delete(`/sales-orders/${soId}`);
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Create a new line item for a sales order
 */
export const createSalesOrderLine = async (
  soId: number,
  lineData: CreateSalesOrderLineRequest
): Promise<SalesOrderLineApiResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<SalesOrderLineApiResponse>>(
      `/sales-orders/${soId}/lines`,
      lineData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing line item for a sales order
 */
export const updateSalesOrderLine = async (
  soId: number,
  lineId: number,
  lineData: UpdateSalesOrderLineRequest
): Promise<SalesOrderLineApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<SalesOrderLineApiResponse>>(
      `/sales-orders/${soId}/lines/${lineId}`,
      lineData
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Delete a line item from a sales order
 */
export const deleteSalesOrderLine = async (soId: number, lineId: number): Promise<void> => {
  try {
    await axiosClient.delete(`/sales-orders/${soId}/lines/${lineId}`);
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Generate Purchase Orders for a sales order
 */
import type { PurchaseOrderApiResponse } from './purchaseOrdersService';

export interface GeneratePOsRequest {
  shipment_type: 'drop_ship' | 'in_house';
}

export interface GeneratePOsResponse {
  message: string;
  purchase_orders: PurchaseOrderApiResponse[];
}

export const generatePOs = async (
  soId: number,
  request: GeneratePOsRequest
): Promise<GeneratePOsResponse> => {
  try {
    const response = await axiosClient.post<ApiResponse<GeneratePOsResponse>>(
      `/sales-orders/${soId}/generate-pos`,
      request
    );
    if (response.data.success && response.data.data) {
      // The API returns the data directly with message and purchase_orders
      return response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
