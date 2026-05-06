// ====== FoodieGo E2E Test Suite ======
// Tests all happy-path and negative cases against the live dev stack.
// Requires: Node.js 20+ (uses native fetch) or axios fallback.
// Usage: node run-e2e.js

import axios from 'axios';

// ====== Config ======
const SERVICES = {
  user: 'http://localhost:3001',
  restaurant: 'http://localhost:3002',
  order: 'http://localhost:3003',
  payment: 'http://localhost:3004',
};

// Unique timestamp suffix so reruns never conflict on email
const TS = Date.now();
const TEST_CUSTOMER = {
  name: 'E2E Customer',
  email: `e2e-customer-${TS}@test.com`,
  password: 'test123',
  role: 'customer',
  address: '123 Test Street, Testville',
};
const OWNER_CREDS = { email: 'burger@owner.com', password: 'owner123' };

// ====== Test Runner Bookkeeping ======
let passed = 0;
let failed = 0;
const failures = [];

// State shared between test steps
const state = {
  customerToken: null,
  customerId: null,
  ownerToken: null,
  ownerId: null,
  orderId: null,
  restaurantId: 1,
  menuItemId: null,
};

// ====== Helpers ======

function ok(label, value) {
  console.log(`  ✅ ${label}: ${JSON.stringify(value)}`);
  passed++;
}

function fail(label, reason) {
  console.log(`  ❌ ${label}: ${reason}`);
  failed++;
  failures.push({ label, reason });
}

// Make an HTTP call and return { status, data } without throwing
async function req(method, url, { data, token, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await axios({ method, url, data, headers, validateStatus: () => true });
    return { status: res.status, data: res.data };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

// Assert HTTP status code
function assertStatus(label, got, expected) {
  if (got === expected) {
    ok(`${label} status=${got}`, '');
    return true;
  }
  fail(`${label} status`, `expected ${expected}, got ${got}`);
  return false;
}

// Assert a field exists and optionally matches a value
function assertField(label, obj, path, expected) {
  const keys = path.split('.');
  let val = obj;
  for (const k of keys) {
    if (val == null || typeof val !== 'object') { fail(`${label}.${path}`, 'path not traversable'); return false; }
    val = val[k];
  }
  if (val == null || val === undefined) {
    fail(`${label}.${path}`, `field missing, got ${JSON.stringify(val)}`);
    return false;
  }
  if (expected !== undefined && val !== expected) {
    fail(`${label}.${path}`, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    return false;
  }
  ok(`${label}.${path}`, val);
  return true;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// ====== Happy-Path Tests ======

async function test_H1_register() {
  section('H1: POST /api/users/register — new customer');
  const { status, data } = await req('POST', `${SERVICES.user}/api/users/register`, {
    data: TEST_CUSTOMER,
  });
  if (!assertStatus('register', status, 201)) return;
  assertField('register', data, 'user.id');
  assertField('register', data, 'user.email', TEST_CUSTOMER.email);
  assertField('register', data, 'user.role', 'customer');
  assertField('register', data, 'token');
  // Save for later steps
  state.customerId = data.user?.id;
  state.customerToken = data.token;
}

async function test_H2_login_customer() {
  section('H2: POST /api/users/login — customer credentials');
  const { status, data } = await req('POST', `${SERVICES.user}/api/users/login`, {
    data: { email: TEST_CUSTOMER.email, password: TEST_CUSTOMER.password },
  });
  if (!assertStatus('login customer', status, 200)) return;
  assertField('login customer', data, 'token');
  assertField('login customer', data, 'user.role', 'customer');
  // Refresh token from login
  state.customerToken = data.token ?? state.customerToken;
}

async function test_H3_login_owner() {
  section('H3: POST /api/users/login — restaurant owner');
  const { status, data } = await req('POST', `${SERVICES.user}/api/users/login`, {
    data: OWNER_CREDS,
  });
  if (!assertStatus('login owner', status, 200)) return;
  assertField('login owner', data, 'token');
  assertField('login owner', data, 'user.role', 'restaurant_owner');
  state.ownerToken = data.token;
  state.ownerId = data.user?.id;
  // Capture the restaurant_id linked to this owner (if present in token/user)
  if (data.user?.restaurant_id) {
    state.restaurantId = data.user.restaurant_id;
  }
}

async function test_H4_list_restaurants() {
  section('H4: GET /api/restaurants — expect >= 4');
  const { status, data } = await req('GET', `${SERVICES.restaurant}/api/restaurants`);
  if (!assertStatus('list restaurants', status, 200)) return;
  const list = data.restaurants ?? data;
  if (Array.isArray(list) && list.length >= 4) {
    ok('restaurant count', list.length);
  } else {
    fail('restaurant count', `expected >= 4, got ${Array.isArray(list) ? list.length : 'non-array'}`);
  }
}

async function test_H5_menu_items() {
  section('H5: GET /api/restaurants/1/menu-items — expect >= 1 item');
  // The restaurant service exposes /restaurants/:id/menu for the full list
  const { status, data } = await req('GET', `${SERVICES.restaurant}/api/restaurants/${state.restaurantId}/menu`);
  if (status === 200) {
    const items = data.menu ?? data;
    if (Array.isArray(items) && items.length >= 1) {
      ok('menu item count', items.length);
      state.menuItemId = items[0].id;
      ok('selected menu_item_id', state.menuItemId);
    } else {
      fail('menu item count', `expected >= 1, got ${Array.isArray(items) ? items.length : 'non-array'}`);
    }
    return;
  }
  // Fallback: try the /restaurants/:id endpoint which may embed menu
  const { status: s2, data: d2 } = await req('GET', `${SERVICES.restaurant}/api/restaurants/${state.restaurantId}`);
  if (!assertStatus('get restaurant+menu', s2, 200)) return;
  const items = d2.menu ?? [];
  if (Array.isArray(items) && items.length >= 1) {
    ok('menu item count (via restaurant detail)', items.length);
    state.menuItemId = items[0].id;
    ok('selected menu_item_id', state.menuItemId);
  } else {
    fail('menu item count', `expected >= 1, got ${JSON.stringify(items)}`);
  }
}

async function test_H6_place_order() {
  section('H6: POST /api/orders — customer places order');
  if (!state.customerId || !state.customerToken || !state.menuItemId) {
    fail('place order', 'prerequisite state missing (customerId, customerToken, menuItemId)');
    return;
  }
  const { status, data } = await req('POST', `${SERVICES.order}/api/orders`, {
    token: state.customerToken,
    data: {
      user_id: state.customerId,
      restaurant_id: state.restaurantId,
      items: [{ menu_item_id: state.menuItemId, qty: 2 }],
      delivery_address: TEST_CUSTOMER.address,
    },
  });
  if (!assertStatus('place order', status, 201)) {
    console.log('  [debug] response:', JSON.stringify(data));
    return;
  }
  assertField('place order', data, 'order.id');
  assertField('place order', data, 'order.status', 'PLACED');
  assertField('place order', data, 'order.total_price');
  // Verify server computed total (not zero, not negative)
  const total = data.order?.total_price;
  if (total > 0) {
    ok('total_price computed server-side', total);
  } else {
    fail('total_price', `expected > 0, got ${total}`);
  }
  state.orderId = data.order?.id;
}

async function test_H7_wait_for_payment() {
  section('H7: Wait 3s for async RabbitMQ payment processing');
  console.log('  Waiting 3000ms...');
  await sleep(3000);
  ok('waited', '3000ms');
}

async function test_H8_payment_completed() {
  section('H8: GET /api/payments/order/:orderId — expect COMPLETED');
  if (!state.orderId) {
    fail('check payment', 'no orderId from H6');
    return;
  }
  const { status, data } = await req('GET', `${SERVICES.payment}/api/payments/order/${state.orderId}`);
  if (!assertStatus('get payment', status, 200)) {
    console.log('  [debug] response:', JSON.stringify(data));
    return;
  }
  assertField('payment', data, 'transaction.order_id', state.orderId);
  assertField('payment', data, 'transaction.status', 'COMPLETED');
}

async function test_H9_status_transitions() {
  section('H9: PATCH order status — full forward transition chain');
  if (!state.orderId) {
    fail('status transitions', 'no orderId from H6');
    return;
  }
  const transitions = ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  for (const status of transitions) {
    const { status: httpStatus, data } = await req('PATCH', `${SERVICES.order}/api/orders/${state.orderId}/status`, {
      token: state.customerToken,
      data: { status },
    });
    if (!assertStatus(`PATCH status -> ${status}`, httpStatus, 200)) {
      console.log('  [debug]', JSON.stringify(data));
      break; // Stop chain if one fails — later ones will fail too
    }
    assertField(`status ${status}`, data, 'order.status', status);
  }
}

// ====== Negative / Edge Case Tests ======

async function test_N1_duplicate_email() {
  section('N1: Register duplicate email → 409');
  const { status } = await req('POST', `${SERVICES.user}/api/users/register`, {
    data: TEST_CUSTOMER, // Same email as H1
  });
  assertStatus('duplicate email', status, 409);
}

async function test_N2_bad_password() {
  section('N2: Login with wrong password → 401');
  const { status } = await req('POST', `${SERVICES.user}/api/users/login`, {
    data: { email: TEST_CUSTOMER.email, password: 'WRONG_PASSWORD' },
  });
  assertStatus('bad password', status, 401);
}

async function test_N3_nonexistent_user_order() {
  section('N3: Place order for non-existent user_id=99999 → 404');
  if (!state.menuItemId) {
    fail('order non-existent user', 'menuItemId not set from H5');
    return;
  }
  const { status, data } = await req('POST', `${SERVICES.order}/api/orders`, {
    data: {
      user_id: 99999,
      restaurant_id: state.restaurantId,
      items: [{ menu_item_id: state.menuItemId, qty: 1 }],
    },
  });
  if (status === 404) {
    assertStatus('non-existent user order', status, 404);
  } else {
    // Some implementations return 400 with "user not found" — accept that too
    if (status === 400 || status === 404) {
      ok(`non-existent user order (got ${status})`, 'acceptable 4xx for invalid user');
    } else {
      fail('non-existent user order', `expected 404 (or 400), got ${status} — ${JSON.stringify(data)}`);
    }
  }
}

async function test_N4_qty_zero() {
  section('N4: Place order with qty=0 → 400');
  if (!state.customerId || !state.menuItemId) {
    fail('order qty=0', 'prerequisite state missing');
    return;
  }
  const { status } = await req('POST', `${SERVICES.order}/api/orders`, {
    data: {
      user_id: state.customerId,
      restaurant_id: state.restaurantId,
      items: [{ menu_item_id: state.menuItemId, qty: 0 }],
    },
  });
  assertStatus('qty=0 order', status, 400);
}

async function test_N5_missing_items() {
  section('N5: Place order with empty items array → 400');
  if (!state.customerId) {
    fail('order missing items', 'customerId not set');
    return;
  }
  const { status } = await req('POST', `${SERVICES.order}/api/orders`, {
    data: {
      user_id: state.customerId,
      restaurant_id: state.restaurantId,
      items: [],
    },
  });
  assertStatus('empty items', status, 400);
}

async function test_N6_backward_status() {
  section('N6: PATCH DELIVERED → ACCEPTED (backward) → 400');
  if (!state.orderId) {
    fail('backward status', 'no orderId from H6');
    return;
  }
  // Order should now be DELIVERED from H9
  const { status, data } = await req('PATCH', `${SERVICES.order}/api/orders/${state.orderId}/status`, {
    data: { status: 'ACCEPTED' },
  });
  if (status === 400) {
    assertStatus('backward DELIVERED→ACCEPTED', status, 400);
  } else {
    fail('backward DELIVERED→ACCEPTED', `expected 400, got ${status} — ${JSON.stringify(data)}`);
  }
}

async function test_N7_no_auth_me() {
  section('N7: GET /api/users/me without Authorization → 401');
  const { status } = await req('GET', `${SERVICES.user}/api/users/me`);
  assertStatus('GET /me no auth', status, 401);
}

async function test_N8_tampered_jwt() {
  section('N8: GET /api/users/me with tampered JWT → 401');
  const tampered = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJoYWNrZXJAdGVzdC5jb20iLCJyb2xlIjoiYWRtaW4ifQ.INVALIDSIGNATURE';
  const { status } = await req('GET', `${SERVICES.user}/api/users/me`, { token: tampered });
  assertStatus('tampered JWT', status, 401);
}

// ====== Main Orchestration ======

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         FoodieGo Phase 5 — E2E API Test Suite           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nTarget stack: user=${SERVICES.user} restaurant=${SERVICES.restaurant}`);
  console.log(`              order=${SERVICES.order} payment=${SERVICES.payment}`);
  console.log(`Test email: ${TEST_CUSTOMER.email}\n`);

  // Quick connectivity check before running tests
  section('Pre-flight: health check all services');
  for (const [name, base] of Object.entries(SERVICES)) {
    const { status, data } = await req('GET', `${base}/health`);
    if (status === 200) {
      ok(`${name}-service /health`, data?.status ?? 'ok');
    } else {
      fail(`${name}-service /health`, `got ${status} — service may be down`);
    }
  }

  // ====== Happy Path ======
  await test_H1_register();
  await test_H2_login_customer();
  await test_H3_login_owner();
  await test_H4_list_restaurants();
  await test_H5_menu_items();
  await test_H6_place_order();
  await test_H7_wait_for_payment();
  await test_H8_payment_completed();
  await test_H9_status_transitions();

  // ====== Negative Cases ======
  await test_N1_duplicate_email();
  await test_N2_bad_password();
  await test_N3_nonexistent_user_order();
  await test_N4_qty_zero();
  await test_N5_missing_items();
  await test_N6_backward_status();
  await test_N7_no_auth_me();
  await test_N8_tampered_jwt();

  // ====== Summary ======
  const total = passed + failed;
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                       ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Total:  ${String(total).padEnd(4)} assertions                                ║`);
  console.log(`║  Passed: ${String(passed).padEnd(4)} ✅                                       ║`);
  console.log(`║  Failed: ${String(failed).padEnd(4)} ❌                                       ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed assertions:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. [${f.label}] ${f.reason}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
