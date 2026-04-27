import api from '../utils/request';
import type { IUser } from '../state/auth';

export interface ILoginResponse {
  success: boolean;
  user?: IUser;
  error?: string;
}

export const login = async (username: string, password: string): Promise<ILoginResponse> => {
  const response = await api.post('/auth/login', { username, password });
  return response.data;
};

export const logout = async (): Promise<void> => {
  await api.post('/auth/logout');
};

export const getCurrentUser = async (): Promise<IUser | null> => {
  const response = await api.get('/auth/me');
  if (response.data.authenticated && response.data.user) {
    return response.data.user;
  }
  return null;
};

export interface IWindowsLoginResponse {
  success: boolean;
  user?: IUser;
  autoLogin?: boolean;
  error?: string;
}

export const windowsLogin = async (): Promise<IWindowsLoginResponse> => {
  const response = await api.post('/auth/windows-login');
  return response.data;
};
