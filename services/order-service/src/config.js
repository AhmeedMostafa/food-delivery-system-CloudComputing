// ====== Config ======
const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'food_delivery',
  },

  // URLs of the other microservices -- injected via env vars
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  restaurantServiceUrl: process.env.RESTAURANT_SERVICE_URL || 'http://localhost:3002',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004',
};

export default config;
