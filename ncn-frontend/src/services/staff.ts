import api from '../utils/request';
import type { IApiResponse } from '../types';

export interface IStaff {
  Emp_ID: string;
  Lan_ID: string;
  Staff_Name: string;
  Email_Addr: string;
  Department: string;
  Title?: string;
}

export interface IStaffResponse {
  success: boolean;
  data?: IStaff[];
  error?: string;
}

export const searchStaff = async (search?: string, dept?: string): Promise<IStaffResponse> => {
  const response = await api.get('/staff', { params: { search, dept } });
  return response.data;
};

export const getStaffByDepartment = async (dept: string): Promise<IStaffResponse> => {
  const response = await api.get(`/staff/by-department/${dept}`);
  return response.data;
};

export const getStaffById = async (empId: string): Promise<IStaffResponse> => {
  const response = await api.get(`/staff/${empId}`);
  return response.data;
};
