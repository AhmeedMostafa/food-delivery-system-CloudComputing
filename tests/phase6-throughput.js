// Phase 6 throughput test — places N orders rapidly and tracks timing
// Run with: node tests/phase6-throughput.js
// fetch is available globally in Node.js 18+

const BASE = 'http://localhost';

// First get a customer token
async function getToken() {
  const res = await fetch(`${BASE}:3001/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'phase6test@test.com', password: 'password123' }),
  });
  const data = await res.json();
  return data.token;
}

async function placeOrder(token) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}:3003/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: 8,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 1 }],
        delivery_address: '123 Test St, Test City',
      }),
    });
    const data = await res.json();
    const ms = Date.now() - start;
    return { success: res.ok, status: res.status, ms, orderId: data.order?.id || data.id };
  } catch (err) {
    return { success: false, error: err.message, ms: Date.now() - start };
  }
}

async function main() {
  const N = parseInt(process.argv[2] || '20');
  console.log(`Placing ${N} orders...`);

  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < N; i++) {
    const r = await placeOrder(token);
    results.push(r);
    if (i % 5 === 0) process.stdout.write('.');
  }
  console.log('\nDone.');

  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success);
  const times = results.filter(r => r.success).map(r => r.ms).sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  console.log(`\nResults: ${successes}/${N} success, ${failures.length} failures`);
  console.log(`Latency — avg: ${avg}ms, p95: ${p95}ms`);
  if (failures.length > 0) {
    console.log('Failures:', failures.slice(0, 3));
  }

  // Output order IDs placed
  const orderIds = results.filter(r => r.orderId).map(r => r.orderId);
  console.log(`Orders placed: ${orderIds.length}, IDs sample: ${orderIds.slice(0, 5).join(',')}`);
  process.exit(failures.length > 0 && successes === 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
