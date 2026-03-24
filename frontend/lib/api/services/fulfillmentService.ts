/**
 * Fulfillment API Service
 * Handles delivery/fulfillment events
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';

// API Response Types
export interface FulfillmentEvent {
  id: number;
  so_line_id: number;
  quantity: number;
  source: string;
  notes: string | null;
  created_by: number;
  creator_name: string;
  created_at: string;
}

export interface FulfillmentLineOverview {
  so_line_id: number;
  sku_code: string;
  sku_name: string;
  line_number: number;
  ordered_qty: number;
  delivered_qty: number;
  remaining_qty: number;
  is_fully_delivered: boolean;
  event_count: number;
  events: FulfillmentEvent[];
}

export interface FulfillmentOverviewResponse {
  sales_order_id: number;
  order_number: string;
  status: string;
  lines: FulfillmentLineOverview[];
}

// PO Line Fulfillment Types
export interface POFulfillmentEvent {
  id: number;
  po_line_id: number;
  quantity: number;
  source: string;
  notes: string | null;
  recorded_by: number;
  recorder_name: string;
  created_at: string;
  sku_code: string;
  sku_name: string;
  po_number: string;
  so_order_number: string;
}

export interface POFulfillmentLineOverview {
  po_line_id: number;
  sku_code: string;
  sku_name: string;
  quantity: number;
  delivered_qty: number;
  remaining_qty: number;
  is_fully_delivered: boolean;
  event_count: number;
  events: POFulfillmentEvent[];
}

export interface POFulfillmentOverviewResponse {
  purchase_order_id: number;
  po_number: string;
  status: string;
  lines: POFulfillmentLineOverview[];
}

// Request Types
export interface CreateFulfillmentEventRequest {
  so_line_id: number;
  quantity: number;
  source: string;
  notes?: string | null;
}

export interface CreatePOFulfillmentEventRequest {
  po_line_id: number;
  quantity: number;
  source: string;
  notes?: string | null;
}

/**
 * Record a fulfillment/delivery event
 */
export const createFulfillmentEvent = async (
  eventData: CreateFulfillmentEventRequest
): Promise<FulfillmentEvent> => {
  try {
    const response = await axiosClient.post<ApiResponse<FulfillmentEvent>>(
      '/fulfillment/events',
      eventData
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
 * Get fulfillment overview for a sales order
 */
export const getFulfillmentOverview = async (
  soId: number
): Promise<FulfillmentOverviewResponse> => {
  try {
    const response = await axiosClient.get<ApiResponse<FulfillmentOverviewResponse>>(
      `/fulfillment/sales-orders/${soId}/overview`
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
 * Record a fulfillment/delivery event for a PO line
 */
export const createPOFulfillmentEvent = async (
  eventData: CreatePOFulfillmentEventRequest
): Promise<POFulfillmentEvent> => {
  try {
    const response = await axiosClient.post<ApiResponse<POFulfillmentEvent>>(
      '/fulfillment/events',
      eventData
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
 * Get fulfillment overview for a purchase order
 */
export const getPOFulfillmentOverview = async (
  poId: number
): Promise<POFulfillmentOverviewResponse> => {
  try {
    const response = await axiosClient.get<ApiResponse<POFulfillmentOverviewResponse>>(
      `/fulfillment/purchase-orders/${poId}/overview`
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
 * Get fulfillment data for a specific purchase order line item
 * Returns an array of fulfillment events for the line
 */
export const getPOLineFulfillment = async (
  poLineId: number
): Promise<POFulfillmentEvent[]> => {
  try {
    const response = await axiosClient.get<ApiResponse<POFulfillmentEvent[]>>(
      `/fulfillment/po-lines/${poLineId}/events`
    );
    if (response.data.success && response.data.data) {
      return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
