// ====== User Service Entry Point ======
import express from 'express';
import cors from 'cors';
import config from './config.js';
import pool from './db.js';
import userRoutes from './routes/users.js';

const app = express();

// ====== Middleware ======
app.use(cors()); // allow all origins for demo; lock this down in real prod
app.use(express.json());

// ====== Routes ======
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

app.use('/api/users', userRoutes);

// ====== Global Error Handler ======
// Catches anything thrown in route handlers and returns a clean JSON error.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ====== Start Server ======
const server = app.listen(config.port, () => {
  console.log('User Service listening on :' + config.port + ' [env=' + config.nodeEnv + ']');
});

// ====== Graceful Shutdown ======
// Kubernetes sends SIGTERM when it wants to stop a pod.
process.on('SIGTERM', async () => {
  console.log('[user-service] SIGTERM received, shutting down...');
  server.close(async () => {
    await pool.end();
    console.log('[user-service] DB pool closed. Goodbye.');
    process.exit(0);
  });
});
