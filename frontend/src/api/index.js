// ====== API Client ======
// Single axios instance so we can set a base URL and auth headers in one place.
import axios from 'axios';

const api = axios.create({
  // In production this hits the nginx proxy; in dev vite.config.js handles proxying
  baseURL: '/',
  timeout: 10000,
});

// ====== Request Interceptor ======
// Attach the JWT from localStorage to every outgoing request if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = 'Bearer ' + token;
  }
  return config;
});

export default api;
