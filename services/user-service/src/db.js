// ====== Database Pool ======
// pg.Pool manages a connection pool so we're not opening a new
// connection on every request (that would be slow and wasteful).

import pg from 'pg';
import config from './config.js';

const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  // Keep a small pool -- this service doesn't need many concurrent connections
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export default pool;
