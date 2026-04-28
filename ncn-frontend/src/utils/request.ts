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
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
