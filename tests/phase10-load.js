// Phase 10 load test — sends 100 order requests and measures latency
// Tests against prod compose (port 80 via nginx)
// Run with: node tests/phase10-load.js

const BASE = 'http://localhost';
const CONCURRENT = 10;
const TOTAL = 100;

async function getToken() {
  // Register then login
  try {
    await fetch(`${BASE}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Load Test User',
        email: 'loadtest@phase10.com',
        password: 'loadtest123',
        role: 'customer',
      }),
    });
  } catch (_) {
    // ignore if already registered
  }

  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loadtest@phase10.com', password: 'loadtest123' }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Could not get token: ' + JSON.stringify(data));
  return { token: data.token, userId: data.user?.id };
}

async function placeOrder(token, userId) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 1 }],
        delivery_address: '123 Load Test Ave',
      }),
    });
    const ms = Date.now() - start;
    const data = await res.json();
    return { ok: res.ok, status: res.status, ms };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now() - start };
  }
}

async function runBatch(token, userId, batchSize) {
  return Promise.all(
    Array.from({ length: batchSize }, () => placeOrder(token, userId))
  );
}

async function main() {
  console.log(`Load test: ${TOTAL} requests, ${CONCURRENT} concurrent\n`);

  const { token, userId } = await getToken();
  console.log(`Got token for user ${userId}`);

  const results = [];
  const batches = Math.ceil(TOTAL / CONCURRENT);
  const startAll = Date.now();

  for (let b = 0; b < batches; b++) {
    const remaining = TOTAL - b * CONCURRENT;
    const size = Math.min(CONCURRENT, remaining);
    const batch = await runBatch(token, userId, size);
    results.push(...batch);
    process.stdout.write('.');
  }

  const totalMs = Date.now() - startAll;
  console.log('\n');

  const ok = results.filter(r => r.ok);
  const errors = results.filter(r => !r.ok);
  const times = ok.map(r => r.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const errorRate = ((errors.length / TOTAL) * 100).toFixed(1);

  console.log(`=== RESULTS ===`);
  console.log(`Total requests:  ${TOTAL}`);
  console.log(`Successful:      ${ok.length}`);
  console.log(`Errors:          ${errors.length} (${errorRate}%)`);
  console.log(`Total time:      ${totalMs}ms`);
  console.log(`Throughput:      ${(TOTAL / (totalMs / 1000)).toFixed(1)} req/s`);
  console.log(`Latency avg:     ${avg}ms`);
  console.log(`Latency p50:     ${p50}ms`);
  console.log(`Latency p95:     ${p95}ms`);
  console.log(`Latency p99:     ${p99}ms`);

  if (errors.length > 0) {
    console.log('\nError samples:', errors.slice(0, 3));
  }

  // Pass criteria: p95 < 800ms, error rate < 1%
  const p95Pass = p95 < 800;
  const errorPass = parseFloat(errorRate) < 1;
  console.log(`\nPass criteria:`);
  console.log(`  p95 < 800ms: ${p95}ms → ${p95Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  error rate < 1%: ${errorRate}% → ${errorPass ? 'PASS' : 'FAIL'}`);

  process.exit(p95Pass && errorPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
