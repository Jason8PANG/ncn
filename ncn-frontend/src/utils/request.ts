import axios from 'axios';

// Use relative path for Docker, or env var for local dev
const getApiBaseUrl = () => {
  // Docker: use relative path (nginx will proxy /api)
  if (import.meta.env.VITE_API_BASE_URL === undefined) {
    return '/api';
  }
  // Local dev: use explicit URL
  return import.meta.env.VITE_API_BASE_URL;
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    // 登录接口自身的 401（如密码错误）不跳转，交由页面显示错误提示
    const isLoginRequest = url.includes('/auth/login') || url.includes('/auth/windows-login');
    if (error.response?.status === 401 && !isLoginRequest) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
