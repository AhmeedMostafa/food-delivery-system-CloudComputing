// ====== Order Service Entry Point ======
import config from './config.js';
import pool from './db.js';
import app from './app.js';
import { connectRabbitMQ } from './rabbitmq.js';

// Start RabbitMQ connection separately from the app -- keeps app.js testable
connectRabbitMQ();

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
