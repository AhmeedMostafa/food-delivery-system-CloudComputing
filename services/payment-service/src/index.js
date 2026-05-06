// ====== Payment Service Entry Point ======
import config from './config.js';
import pool from './db.js';
import app from './app.js';
import { connectRabbitMQ } from './rabbitmq.js';

// Start RabbitMQ consumer separately from the app -- keeps app.js testable
connectRabbitMQ();

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
