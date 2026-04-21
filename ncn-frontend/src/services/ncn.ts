import api from '../utils/request';
import type { INCN_Entry, INCNQueryParams, IApiResponse } from '../types';

export interface INCNListResponse {
  success: boolean;
  data?: {
    entries: INCN_Entry[];
    total: number;
  };
  error?: string;
}

export const queryNCNs = async (params: INCNQueryParams): Promise<INCNListResponse> => {
  const response = await api.get('/ncn', { params });
  return response.data;
};

export const getNCNDetail = async (id: number): Promise<IApiResponse<INCN_Entry>> => {
  const response = await api.get(`/ncn/${id}`);
  return response.data;
};

export const getDropdownOptions = async (): Promise<IApiResponse<any>> => {
  const response = await api.get('/ncn/options');
  return response.data;
};
