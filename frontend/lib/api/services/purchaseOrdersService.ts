/**
 * Purchase Orders API Service
 * Clean separation of API calls from business logic
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';

// API Response Types (snake_case from backend)
export interface PurchaseOrderLineApiResponse {
  id: number;
  purchase_order_id: number;
  so_line_id: number;
  sku_id: number;
  quantity: number;
  status: string;
  delivered_qty: number;
  remaining_qty: number;
  is_fully_delivered: boolean;
  due_date: string | null;
  expected_ship_date: string | null;
  expected_arrival_date: string | null;
  created_at: string;
  sku_code: string;
  sku_name: string;
}

export interface PurchaseOrderApiResponse {
  id: number;
  po_number: string;
  sales_order_id: number;
  so_order_number: string;
  vendor_id: number;
  vendor_name: string;
  client_name: string;
  shipment_type: 'drop_ship' | 'in_house';
  status: string;
  expected_ship_date: string | null;
  expected_arrival_date: string | null;
  is_deletable: boolean;
  created_at: string;
  updated_at: string;
  line_count?: number;
  total_quantity?: number;
  lines?: PurchaseOrderLineApiResponse[];
}

// Request Types
export interface UpdatePurchaseOrderRequest {
  status?: string;
  shipment_type?: 'drop_ship' | 'in_house';
  expected_ship_date?: string | null;
  expected_arrival_date?: string | null;
}

export interface UpdatePurchaseOrderLineRequest {
  status?: string;
  ordered_qty?: number;
  delivered_qty?: number;
  due_date?: string | null;
  expected_ship_date?: string | null;
  expected_arrival_date?: string | null;
}

export interface UpdatePurchaseOrderLineStatusRequest {
  status: string;
}

/**
 * Fetch all purchase orders
 */
export const fetchPurchaseOrders = async (): Promise<PurchaseOrderApiResponse[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<PurchaseOrderApiResponse[]>>('/purchase-orders');
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Fetch a single purchase order by ID
 */
export const fetchPurchaseOrderById = async (poId: string | number): Promise<PurchaseOrderApiResponse> => {
  try {
    const response = await axiosClient.get<ApiResponse<PurchaseOrderApiResponse>>(`/purchase-orders/${poId}`);
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update an existing purchase order
 */
export const updatePurchaseOrder = async (
  poId: number,
  poData: UpdatePurchaseOrderRequest
): Promise<PurchaseOrderApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<PurchaseOrderApiResponse>>(
      `/purchase-orders/${poId}`,
      poData
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
 * Delete a purchase order (only if status is IN_PRODUCTION)
 */
export const deletePurchaseOrder = async (poId: number): Promise<void> => {
  try {
    await axiosClient.delete(`/purchase-orders/${poId}`);
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};

/**
 * Update a purchase order line item dates
 */
export const updatePurchaseOrderLine = async (
  poId: number,
  lineId: number,
  lineData: UpdatePurchaseOrderLineRequest
): Promise<PurchaseOrderLineApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<PurchaseOrderLineApiResponse>>(
      `/purchase-orders/${poId}/lines/${lineId}`,
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
 * Update a purchase order line item status
 */
export const updatePurchaseOrderLineStatus = async (
  poId: number,
  lineId: number,
  status: string
): Promise<PurchaseOrderLineApiResponse> => {
  try {
    const response = await axiosClient.patch<ApiResponse<PurchaseOrderLineApiResponse>>(
      `/purchase-orders/${poId}/lines/${lineId}`,
      { status }
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
