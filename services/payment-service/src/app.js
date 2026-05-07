// ====== Payment Service Express App (exported for testing) ======
// Note: connectRabbitMQ() is NOT called here — that lives in index.js.
import express from 'express';
import cors from 'cors';
import paymentRoutes from './routes/payments.js';
import client from 'prom-client';

// ====== Prometheus Metrics ======
client.collectDefaultMetrics();

const app = express();

// ====== Middleware ======
app.use(cors());
app.use(express.json());

// ====== Routes ======
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use('/api/payments', paymentRoutes);

// ====== Global Error Handler ======
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

export default app;
