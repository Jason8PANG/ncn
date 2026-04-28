import api from '../utils/request';
import type { INCN_Entry, IApiResponse } from '../types';

export interface ISerialNoResponse {
  success: boolean;
  serialNo?: string;
  error?: string;
}

export const getNCNEntry = async (id: number): Promise<IApiResponse<INCN_Entry>> => {
  // 使用 /entry/id/:rowid 路由，通过 ROWID 获取数据
  const response = await api.get(`/entry/id/${id}`);
  return response.data;
};

export const createNCNEntry = async (data: Partial<INCN_Entry>): Promise<IApiResponse> => {
  const response = await api.post('/entry', data);
  return response.data;
};

export const updateNCNEntry = async (id: number, data: Partial<INCN_Entry>): Promise<IApiResponse> => {
  const response = await api.put(`/entry/${id}`, data);
  return response.data;
};

export const generateSerialNo = async (): Promise<ISerialNoResponse> => {
  const response = await api.get('/entry/serialno/new');
  return response.data;
};

export const lookupWO = async (wo: string): Promise<IApiResponse<any>> => {
  const response = await api.get('/entry/wo-lookup', { params: { wo } });
  return response.data;
};

export const getSBUOptions = async (): Promise<IApiResponse<string[]>> => {
  const response = await api.get('/entry/sbu/options');
  return response.data;
};

export const getSBUDescriptionOptions = async (sbu: string): Promise<IApiResponse<string[]>> => {
  const response = await api.get('/entry/sbu/options', { params: { sbu } });
  return response.data;
};

export const lookupStaffByEmpId = async (empId: string): Promise<IApiResponse<any>> => {
  const response = await api.get(`/entry/staff/${empId}`);
  return response.data;
};

export const getOwnerOptions = async (dept?: string): Promise<IApiResponse<{ departments: string[]; owners: { lanId: string; name: string }[] }>> => {
  const response = await api.get('/entry/owner/options', { params: dept ? { dept } : {} });
  return response.data;
};

export const getMEEngineerOptions = async (): Promise<IApiResponse<string[]>> => {
  const response = await api.get('/entry/me-engineer/options');
  return response.data;
};

export const getQEEngineerOptions = async (): Promise<IApiResponse<string[]>> => {
  const response = await api.get('/entry/qe-engineer/options');
  return response.data;
};

export const getIssueTypeOptions = async (): Promise<IApiResponse<{ Code: string; Code_Description: string }[]>> => {
  const response = await api.get('/entry/issue-type/options');
  return response.data;
};

export const getDeepAnalysisOptions = async (issueType: string): Promise<IApiResponse<string[]>> => {
  const response = await api.get('/entry/deep-analysis/options', { params: { issueType } });
  return response.data;
};

// Close NCN Entry
export const closeNCNEntry = async (rowid: number): Promise<IApiResponse> => {
  const response = await api.put(`/entry/${rowid}/close`);
  return response.data;
};

// Reopen NCN Entry (only QE or Admin can do this)
export const reopenNCNEntry = async (rowid: number): Promise<IApiResponse> => {
  const response = await api.put(`/entry/${rowid}/reopen`);
  return response.data;
};

// Delete NCN Entry (Admin only)
export const deleteNCNEntry = async (rowid: number): Promise<IApiResponse> => {
  const response = await api.delete(`/entry/${rowid}`);
  return response.data;
};

export interface IStaffInfo {
  Emp_ID: string;
  Lan_ID: string;
  Staff_Name: string;
  Email_Addr: string;
  Department: string;
  Title?: string;
}

export const getLineLeaderOptions = async (): Promise<IApiResponse<IStaffInfo[]>> => {
  const response = await api.get('/staff', { params: { search: '' } });
  return response.data;
};
