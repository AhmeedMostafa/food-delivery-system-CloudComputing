import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api/users': { 
          target: env.VITE_API_BASE_USER || 'http://user-service:3001', 
          changeOrigin: true 
        },
        '/api/restaurants': { 
          target: env.VITE_API_BASE_RESTAURANT || 'http://restaurant-service:3002', 
          changeOrigin: true 
        },
        '/api/menu-items': { 
          target: env.VITE_API_BASE_RESTAURANT || 'http://restaurant-service:3002', 
          changeOrigin: true 
        },
        '/api/orders': {
          target: env.VITE_API_BASE_ORDER || 'http://order-service:3003',
          changeOrigin: true
        },
        '/api/payments': {
          target: env.VITE_API_BASE_PAYMENT || 'http://payment-service:3004',
          changeOrigin: true
        },
      },
    },
  };
});
