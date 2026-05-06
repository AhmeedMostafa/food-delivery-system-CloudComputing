// ====== Restaurant Service Entry Point ======
import config from './config.js';
import pool from './db.js';
import app from './app.js';

// ====== Start Server ======
const server = app.listen(config.port, () => {
  console.log('Restaurant Service on :' + config.port + ' [env=' + config.nodeEnv + ']');
});

// ====== Graceful Shutdown ======
process.on('SIGTERM', async () => {
  console.log('[restaurant-service] SIGTERM received, shutting down...');
  server.close(async () => {
    await pool.end();
    console.log('[restaurant-service] DB pool closed. Goodbye.');
    process.exit(0);
  });
});
