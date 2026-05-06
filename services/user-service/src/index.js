// ====== User Service Entry Point ======
import config from './config.js';
import pool from './db.js';
import app from './app.js';

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
