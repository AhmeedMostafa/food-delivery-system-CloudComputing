// ====== Order Service Unit Tests ======
// Tests: total calculation, status transitions, validation.
// Mocks: pg.Pool, axios (inter-service calls), rabbitmq channel.

import { jest } from '@jest/globals';

// ---- Mock pg pool -- orders.js uses both pool.query and pool.connect ----
const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn(() =>
  Promise.resolve({
    query: mockClientQuery,
    release: mockClientRelease,
  })
);

jest.unstable_mockModule('../src/db.js', () => ({
  default: {
    query: mockQuery,
    connect: mockConnect,
    end: jest.fn(),
  },
}));

// ---- Mock axios for user-service and restaurant-service calls ----
const mockAxiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: jest.fn(),
  },
}));

// ---- Mock rabbitmq so the channel is null (order still gets created) ----
jest.unstable_mockModule('../src/rabbitmq.js', () => ({
  getChannel: jest.fn(() => null),
  connectRabbitMQ: jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');

// ====== Section 1: Total calculation logic ======
describe('Order total calculation', () => {
  // Test the arithmetic independently -- not through the route
  test('total = Σ(price × qty)', () => {
    const items = [
      { price: 9.99, qty: 2 },
      { price: 5.00, qty: 1 },
      { price: 3.50, qty: 3 },
    ];
    let total = 0;
    for (const item of items) {
      total += item.price * item.qty;
    }
    // Round to 2 decimal places the same way the route does
    total = Math.round(total * 100) / 100;
    // 9.99*2 + 5.00*1 + 3.50*3 = 19.98 + 5.00 + 10.50 = 35.48
    expect(total).toBe(35.48);
  });

  test('floating point total is rounded to 2 decimal places', () => {
    // 0.1 + 0.2 = 0.30000000000000004 without rounding
    const raw = 0.1 + 0.2;
    const rounded = Math.round(raw * 100) / 100;
    expect(rounded).toBe(0.30);
  });

  test('single item total is price × qty', () => {
    const price = 12.50;
    const qty = 4;
    const total = Math.round(price * qty * 100) / 100;
    expect(total).toBe(50.00);
  });
});

// ====== Section 2: Status transition logic ======
describe('Order status transition validation', () => {
  const VALID_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

  // Helper that mirrors the route logic exactly
  const canTransition = (from, to) => {
    const fromIdx = VALID_STATUSES.indexOf(from);
    const toIdx = VALID_STATUSES.indexOf(to);
    return toIdx > fromIdx;
  };

  test('PLACED → ACCEPTED is allowed', () => {
    expect(canTransition('PLACED', 'ACCEPTED')).toBe(true);
  });

  test('ACCEPTED → PREPARING is allowed', () => {
    expect(canTransition('ACCEPTED', 'PREPARING')).toBe(true);
  });

  test('PREPARING → OUT_FOR_DELIVERY is allowed', () => {
    expect(canTransition('PREPARING', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  test('OUT_FOR_DELIVERY → DELIVERED is allowed', () => {
    expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  test('PLACED → DELIVERED (skip) is technically allowed by the route', () => {
    // The route only enforces forward movement, not step-by-step
    expect(canTransition('PLACED', 'DELIVERED')).toBe(true);
  });

  test('DELIVERED → ACCEPTED (backward) is rejected', () => {
    expect(canTransition('DELIVERED', 'ACCEPTED')).toBe(false);
  });

  test('PREPARING → PLACED (backward) is rejected', () => {
    expect(canTransition('PREPARING', 'PLACED')).toBe(false);
  });

  test('PLACED → PLACED (same status) is rejected', () => {
    expect(canTransition('PLACED', 'PLACED')).toBe(false);
  });

  test('DELIVERED → DELIVERED (same status) is rejected', () => {
    expect(canTransition('DELIVERED', 'DELIVERED')).toBe(false);
  });
});

// ====== Section 3: PATCH /api/orders/:id/status via HTTP ======
describe('PATCH /api/orders/:id/status', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/orders/1/status')
      .send({ status: 'FLYING' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PLACED.*ACCEPTED.*PREPARING/);
  });

  test('returns 400 for non-numeric order id', async () => {
    const res = await request(app)
      .patch('/api/orders/xyz/status')
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/api/orders/9999/status')
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(404);
  });

  test('returns 400 when trying backward transition DELIVERED → ACCEPTED', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, status: 'DELIVERED' }] });

    const res = await request(app)
      .patch('/api/orders/1/status')
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot transition.*DELIVERED.*ACCEPTED/);
  });

  test('returns 400 when trying same-status update PLACED → PLACED', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, status: 'PLACED' }] });

    const res = await request(app)
      .patch('/api/orders/2/status')
      .send({ status: 'PLACED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot transition.*PLACED.*PLACED/);
  });

  test('successful forward transition returns 200', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'PLACED' }] }) // fetch current
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            user_id: 1,
            restaurant_id: 1,
            status: 'ACCEPTED',
            total_price: '25.00',
            delivery_address: '123 Main St',
            driver_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }); // update result

    const res = await request(app)
      .patch('/api/orders/3/status')
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('ACCEPTED');
  });
});

// ====== Section 4: POST /api/orders validation ======
describe('POST /api/orders input validation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 400 when user_id is missing', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ restaurant_id: 1, items: [{ menu_item_id: 1, qty: 1 }] });
    expect(res.status).toBe(400);
  });

  test('returns 400 when items is empty array', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ user_id: 1, restaurant_id: 1, items: [] });
    expect(res.status).toBe(400);
  });

  test('returns 400 when items is not an array', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ user_id: 1, restaurant_id: 1, items: 'burger' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when item qty < 1', async () => {
    // Mock: user-service call succeeds
    mockAxiosGet.mockResolvedValueOnce({ data: { user: { id: 1 } } });

    const res = await request(app)
      .post('/api/orders')
      .send({
        user_id: 1,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 0 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/qty.*>=.*1/);
  });

  test('returns 404 when user does not exist', async () => {
    // Simulate user-service returning 404
    const err = { response: { status: 404 } };
    mockAxiosGet.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/orders')
      .send({
        user_id: 9999,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 1 }],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User 9999 not found/);
  });

  test('creates order successfully with mocked services', async () => {
    // Mock: user exists
    mockAxiosGet.mockResolvedValueOnce({ data: { user: { id: 1 } } });
    // Mock: menu item fetch
    mockAxiosGet.mockResolvedValueOnce({
      data: { item: { id: 1, name: 'Burger', price: '9.99', is_available: true } },
    });

    // Mock: transaction BEGIN, INSERT order, INSERT item, COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 101,
            user_id: 1,
            restaurant_id: 1,
            status: 'PLACED',
            total_price: '9.99',
            delivery_address: null,
            driver_id: null,
            created_at: new Date().toISOString(),
          },
        ],
      }) // INSERT order
      .mockResolvedValueOnce({}) // INSERT order_item
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/orders')
      .send({
        user_id: 1,
        restaurant_id: 1,
        items: [{ menu_item_id: 1, qty: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PLACED');
    expect(res.body.order.id).toBe(101);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('order-service');
  });
});
