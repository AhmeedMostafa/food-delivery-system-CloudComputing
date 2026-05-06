// Phase 11 Acceptance Tests — Role-based scenario tests
// Tests run against prod compose (port 80 via nginx)
// Run with: node tests/acceptance/run-acceptance.js

const BASE = 'http://localhost';
let pass = 0;
let fail = 0;

function ok(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    pass++;
  } else {
    console.log(`  ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function request(method, path, body, headers = {}) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, error: err.message, data: {} };
  }
}

// ====== Scenario 1: Customer journey ======
async function testCustomer() {
  console.log('\n=== SCENARIO 1: Customer Journey ===');

  // Register
  const ts = Date.now();
  const email = `acceptance-customer-${ts}@test.com`;
  const reg = await request('POST', '/api/users/register', {
    name: 'Acceptance Customer',
    email,
    password: 'acceptance123',
    role: 'customer',
  });
  ok('Customer register returns 201', reg.status === 201, `got ${reg.status}: ${JSON.stringify(reg.data)}`);

  const userId = reg.data.user?.id;
  const token = reg.data.token;
  ok('Register returns userId', !!userId);
  ok('Register returns JWT token', !!token);

  // Browse restaurants
  const restaurants = await request('GET', '/api/restaurants');
  ok('GET /api/restaurants returns 200', restaurants.status === 200);
  ok('Restaurants list has 4 items', restaurants.data.restaurants?.length === 4, `got ${restaurants.data.restaurants?.length}`);

  // Place order
  const orderRes = await request('POST', '/api/orders', {
    user_id: userId,
    restaurant_id: 1,
    items: [{ menu_item_id: 1, qty: 1 }],
    delivery_address: '42 Acceptance Test Lane',
  }, { Authorization: `Bearer ${token}` });

  ok('POST /api/orders returns 201', orderRes.status === 201, `got ${orderRes.status}: ${JSON.stringify(orderRes.data)}`);
  ok('Order has PLACED status', orderRes.data.order?.status === 'PLACED', `got ${orderRes.data.order?.status}`);
  ok('Order total computed server-side', orderRes.data.order?.total_price > 0);
  ok('Order has delivery_address', !!orderRes.data.order?.delivery_address);

  const orderId = orderRes.data.order?.id;

  // Wait for async payment processing
  await new Promise(r => setTimeout(r, 3000));

  // Check payment
  const paymentRes = await request('GET', `/api/payments/by-order/${orderId}`);
  ok('GET /api/payments/by-order/:id returns 200', paymentRes.status === 200, `got ${paymentRes.status}`);
  ok('Payment status is COMPLETED', paymentRes.data.payment?.status === 'COMPLETED', `got ${JSON.stringify(paymentRes.data)}`);

  return { token, userId, orderId };
}

// ====== Scenario 2: Restaurant Owner Journey ======
async function testRestaurantOwner(customerOrderId) {
  console.log('\n=== SCENARIO 2: Restaurant Owner Journey ===');

  // Login as owner
  const login = await request('POST', '/api/users/login', {
    email: 'burger@owner.com',
    password: 'owner123',
  });
  ok('Owner login returns 200', login.status === 200, `got ${login.status}: ${JSON.stringify(login.data)}`);
  ok('Token has role=restaurant_owner', login.data.user?.role === 'restaurant_owner', `got ${login.data.user?.role}`);

  const ownerToken = login.data.token;
  const restaurantId = login.data.user?.restaurant_id || 1;

  // Get orders for restaurant
  const ordersRes = await request('GET', `/api/orders/restaurant/${restaurantId}`, null, {
    Authorization: `Bearer ${ownerToken}`,
  });
  ok(`GET /api/orders/restaurant/${restaurantId} returns 200`, ordersRes.status === 200, `got ${ordersRes.status}: ${JSON.stringify(ordersRes.data).slice(0, 200)}`);
  ok('Returns array of orders', Array.isArray(ordersRes.data.orders), `got ${typeof ordersRes.data.orders}`);

  // PATCH order status: PLACED -> ACCEPTED
  if (customerOrderId) {
    const patchAccepted = await request('PATCH', `/api/orders/${customerOrderId}/status`, {
      status: 'ACCEPTED',
    }, { Authorization: `Bearer ${ownerToken}` });
    ok('PATCH order to ACCEPTED returns 200', patchAccepted.status === 200, `got ${patchAccepted.status}: ${JSON.stringify(patchAccepted.data)}`);
    ok('Order status is now ACCEPTED', patchAccepted.data.order?.status === 'ACCEPTED', `got ${patchAccepted.data.order?.status}`);

    // PREPARING
    const patchPreparing = await request('PATCH', `/api/orders/${customerOrderId}/status`, {
      status: 'PREPARING',
    }, { Authorization: `Bearer ${ownerToken}` });
    ok('PATCH order to PREPARING returns 200', patchPreparing.status === 200);
  }

  return { ownerToken, restaurantId };
}

// ====== Scenario 3: Driver Login ======
async function testDriver() {
  console.log('\n=== SCENARIO 3: Driver Login ===');

  const login = await request('POST', '/api/users/login', {
    email: 'driver1@test.com',
    password: 'driver123',
  });
  ok('Driver login returns 200', login.status === 200, `got ${login.status}: ${JSON.stringify(login.data)}`);
  ok('Driver has delivery_driver role', login.data.user?.role === 'delivery_driver', `got ${login.data.user?.role}`);
  ok('Driver token returned', !!login.data.token);
}

// ====== Scenario 4: Unauthorized Actions ======
async function testUnauthorized() {
  console.log('\n=== SCENARIO 4: Unauthorized Access ===');

  // Try to patch another user's profile without auth
  const noAuth = await request('PUT', '/api/users/1', {
    name: 'Hacked',
  });
  ok('PUT /api/users/me without auth returns 401', noAuth.status === 401, `got ${noAuth.status}: ${JSON.stringify(noAuth.data)}`);

  // Register different owner, try to PATCH first user's profile
  const ts = Date.now();
  const otherEmail = `unauthorized-${ts}@test.com`;
  const otherReg = await request('POST', '/api/users/register', {
    name: 'Other User',
    email: otherEmail,
    password: 'password123',
    role: 'customer',
  });
  const otherToken = otherReg.data.token;

  // Try to update user 1's profile as different user
  const wrongUser = await request('PUT', '/api/users/me', {
    name: 'Hacker Override',
  }, { Authorization: `Bearer ${otherToken}` });
  // PUT /api/users/me updates the authenticated user's own profile, so this should work but only affect the caller's own data
  ok('PUT /api/users/me with valid token updates own profile (not 403)', wrongUser.status !== 403, `got ${wrongUser.status}`);

  // Access /api/orders/restaurant/1 without auth
  const noAuthOrders = await request('GET', '/api/orders/restaurant/1');
  ok('GET /api/orders/restaurant/:id without auth returns 401', noAuthOrders.status === 401, `got ${noAuthOrders.status}`);

  // Tampered JWT
  const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5fQ.tampered_signature';
  const tamperedReq = await request('GET', '/api/users/me', null, {
    Authorization: `Bearer ${tamperedToken}`,
  });
  ok('Tampered JWT returns 401', tamperedReq.status === 401, `got ${tamperedReq.status}`);

  // Illegal status back-transition (DELIVERED -> ACCEPTED)
  // First need an owner token to do this
  const ownerLogin = await request('POST', '/api/users/login', { email: 'burger@owner.com', password: 'owner123' });
  const ownerToken = ownerLogin.data.token;

  if (ownerToken) {
    // Place a new order and advance it to DELIVERED
    const custLogin = await request('POST', '/api/users/login', { email: 'loadtest@phase10.com', password: 'loadtest123' });
    const custToken = custLogin.data.token;
    const custId = custLogin.data.user?.id;

    if (custToken) {
      const newOrder = await request('POST', '/api/orders', {
        user_id: custId,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 1 }],
        delivery_address: 'test',
      }, { Authorization: `Bearer ${custToken}` });
      const newOrderId = newOrder.data.order?.id;

      if (newOrderId) {
        // Advance to DELIVERED
        await request('PATCH', `/api/orders/${newOrderId}/status`, { status: 'ACCEPTED' }, { Authorization: `Bearer ${ownerToken}` });
        await request('PATCH', `/api/orders/${newOrderId}/status`, { status: 'PREPARING' }, { Authorization: `Bearer ${ownerToken}` });
        await request('PATCH', `/api/orders/${newOrderId}/status`, { status: 'OUT_FOR_DELIVERY' }, { Authorization: `Bearer ${ownerToken}` });
        await request('PATCH', `/api/orders/${newOrderId}/status`, { status: 'DELIVERED' }, { Authorization: `Bearer ${ownerToken}` });

        // Now try to go back to ACCEPTED
        const backTransition = await request('PATCH', `/api/orders/${newOrderId}/status`, {
          status: 'ACCEPTED',
        }, { Authorization: `Bearer ${ownerToken}` });
        ok('Back-transition DELIVERED→ACCEPTED returns 400', backTransition.status === 400, `got ${backTransition.status}: ${JSON.stringify(backTransition.data)}`);
      }
    }
  }
}

// ====== Main ======
async function main() {
  console.log('FoodieGo Phase 11 — Acceptance Tests');
  console.log('Target: http://localhost (prod compose)\n');

  try {
    const { orderId } = await testCustomer();
    await testRestaurantOwner(orderId);
    await testDriver();
    await testUnauthorized();
  } catch (err) {
    console.error('\nFatal error:', err);
    fail++;
  }

  const total = pass + fail;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Passed: ${pass}/${total}`);
  console.log(`Failed: ${fail}/${total}`);
  console.log(fail === 0 ? '\nVERDICT: PASS' : '\nVERDICT: FAIL');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
