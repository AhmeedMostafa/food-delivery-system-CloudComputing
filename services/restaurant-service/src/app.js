// ====== Restaurant Service Express App (exported for testing) ======
import express from 'express';
import cors from 'cors';
import restaurantRoutes from './routes/restaurants.js';
import menuRoutes from './routes/menu.js';

const app = express();

// ====== Middleware ======
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[restaurant-service] ${req.method} ${req.url}`);
  next();
});

// ====== Routes ======
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'restaurant-service' });
});

app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu-items', menuRoutes);

// ====== Global Error Handler ======
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

export default app;
