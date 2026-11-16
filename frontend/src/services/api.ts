import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const raw = localStorage.getItem('orbitalops-auth');
  const token = raw ? JSON.parse(raw).state?.token : null;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401 && !location.pathname.startsWith('/login')) {
    localStorage.removeItem('orbitalops-auth');
    location.href = '/login';
  }
  return Promise.reject(e);
});

export const errMsg = (e: any): string => e?.response?.data?.error || e?.message || 'Something went wrong';
