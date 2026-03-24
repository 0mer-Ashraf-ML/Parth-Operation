/**
 * PDF Parsing API Service
 * Handles PDF upload and parsing
 */

import { axiosClient, parseApiError } from '../axiosClient';
import type { ApiResponse } from '../types';
import { getAccessToken } from '../auth';

export interface ParsedPdfLineItem {
  line_number: number;
  sku_code: string;
  sku_description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  due_date: string | null;
  notes: string | null;
  matched_sku_id: number | null;
  matched_sku_name: string | null;
  match_confidence: string;
}

export interface ParsedPdfAddress {
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
}

export interface ParsedPdfResponse {
  s3_key: string;
  s3_url: string;
  presigned_url: string;
  original_filename: string;
  order_number: string;
  order_date: string | null;
  due_date: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  ship_to_address: ParsedPdfAddress;
  bill_to_address: ParsedPdfAddress;
  subtotal: string;
  tax_amount: string | null;
  total_amount: string;
  currency: string;
  payment_terms: string | null;
  line_items: ParsedPdfLineItem[];
  matched_client_id: number | null;
  matched_client_name: string | null;
  raw_ai_response: string;
  parsing_notes: string | null;
  confidence_score: string;
}

/**
 * Parse a PDF file
 */
export const parsePdf = async (file: File): Promise<ParsedPdfResponse> => {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No access token available');
    }

    const formData = new FormData();
    // Append file with the same field name as the API expects ('file')
    formData.append('file', file, file.name);

    // Axios automatically sets Content-Type with boundary for FormData
    // The interceptor will remove the default Content-Type header for FormData
    const response = await axiosClient.post<ApiResponse<ParsedPdfResponse>>(
      '/pdf/parse',
      formData,
      {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    throw new Error(parseApiError(error));
  }
};
