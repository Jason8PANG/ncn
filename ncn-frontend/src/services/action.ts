import api from '../utils/request';
import type { INCN_Action_Detail, IApiResponse } from '../types';

export interface IActionListResponse {
  success: boolean;
  data?: {
    currentActions: INCN_Action_Detail[];
    futureActions: INCN_Action_Detail[];
  };
  error?: string;
}

export const getActions = async (ncnId: number): Promise<IActionListResponse> => {
  const response = await api.get(`/action/${ncnId}`);
  const payload = response.data;

  if (payload?.success && payload?.data) {
    return {
      ...payload,
      data: {
        currentActions: payload.data.currentActions ?? payload.data.current ?? [],
        futureActions: payload.data.futureActions ?? payload.data.future ?? []
      }
    };
  }

  return payload;
};

export const createAction = async (data: Partial<INCN_Action_Detail>): Promise<IApiResponse> => {
  const response = await api.post('/action', data);
  return response.data;
};

export const updateAction = async (rowId: number, data: Partial<INCN_Action_Detail>): Promise<IApiResponse> => {
  const response = await api.put(`/action/${rowId}`, data);
  return response.data;
};

export const closeAction = async (rowId: number): Promise<IApiResponse> => {
  const response = await api.put(`/action/${rowId}/close`);
  return response.data;
};

export const deleteAction = async (rowId: number): Promise<IApiResponse> => {
  const response = await api.delete(`/action/${rowId}`);
  return response.data;
};
