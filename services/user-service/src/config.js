// ====== Config ======
// Pull everything from environment variables so the same image
// can run in dev, test, or prod without rebuilding.

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'food_delivery',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-dev-secret',
    expiresIn: '7d',
  },

  // URL of restaurant service -- needed during owner registration to auto-create the restaurant
  restaurantServiceUrl: process.env.RESTAURANT_SERVICE_URL || 'http://localhost:3002',
};

export default config;
