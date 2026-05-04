// ====== Order Service Entry Point ======
import express from 'express';
import cors from 'cors';
import config from './config.js';
import pool from './db.js';
import orderRoutes from './routes/orders.js';

const app = express();

// ====== Middleware ======
app.use(cors());
app.use(express.json());

// ====== Routes ======
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.use('/api/orders', orderRoutes);

// ====== Global Error Handler ======
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ====== Start Server ======
const server = app.listen(config.port, () => {
  console.log('Order Service listening on :' + config.port + ' [env=' + config.nodeEnv + ']');
});

// ====== Graceful Shutdown ======
process.on('SIGTERM', async () => {
  console.log('[order-service] SIGTERM received, shutting down...');
  server.close(async () => {
    await pool.end();
    console.log('[order-service] DB pool closed. Goodbye.');
    process.exit(0);
  });
});
