// ====== Payment Service Entry Point ======
import express from 'express';
import cors from 'cors';
import config from './config.js';
import pool from './db.js';
import paymentRoutes from './routes/payments.js';

const app = express();

// ====== Middleware ======
app.use(cors()); // allow all origins -- same policy as other services
app.use(express.json());

// ====== Routes ======
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

app.use('/api/payments', paymentRoutes);

// ====== Global Error Handler ======
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ====== Start Server ======
const server = app.listen(config.port, () => {
  console.log('Payment Service listening on :' + config.port + ' [env=' + config.nodeEnv + ']');
});

// ====== Graceful Shutdown ======
// K8s sends SIGTERM to stop the pod -- close the DB pool cleanly
process.on('SIGTERM', async () => {
  console.log('[payment-service] SIGTERM received, shutting down...');
  server.close(async () => {
    await pool.end();
    console.log('[payment-service] DB pool closed. Goodbye.');
    process.exit(0);
  });
});
