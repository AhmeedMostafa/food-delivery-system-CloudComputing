// ====== API Client ======
// Single axios instance so we can set base URL and auth headers in one place.
import axios from 'axios';

const client = axios.create({
  // In production (nginx), calls are relative -- nginx proxies to the right service.
  // In dev mode, vite.config.js handles the proxying.
  baseURL: '/',
  timeout: 10000,
});

// ====== Request Interceptor ======
// Attach the JWT from localStorage to every outgoing request if present.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = 'Bearer ' + token;
  }
  return config;
});

export default client;
