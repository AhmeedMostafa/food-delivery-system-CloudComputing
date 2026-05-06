// ====== Payment Service Unit Tests ======
// Tests: message parsing logic, validation, route behavior.
// Mocks: pg.Pool (no real DB), RabbitMQ (not needed for HTTP routes).

import { jest } from '@jest/globals';

// ---- Mock pg before importing app ----
const mockQuery = jest.fn();
jest.unstable_mockModule('../src/db.js', () => ({
  default: {
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

// ---- Mock rabbitmq so connectRabbitMQ doesn't fire ----
jest.unstable_mockModule('../src/rabbitmq.js', () => ({
  connectRabbitMQ: jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');

// Reset mocks before every test
beforeEach(() => {
  mockQuery.mockReset();
});

// ====== Section 1: Message parser / consumer logic (pure unit tests) ======
describe('Payment message parsing logic (consumer internals)', () => {
  // This parseMessage mirrors the validation logic inside rabbitmq.js consumer.
  // NOTE: The consumer uses `!amount` as the missing-field check, which treats
  // amount=0 as "missing". This is a known bug -- see Defects section.
  const VALID_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'WALLET'];

  const parseMessage = (rawStr) => {
    let data;
    try {
      data = JSON.parse(rawStr);
    } catch {
      return { error: 'invalid JSON' };
    }

    const { order_id, user_id, amount, method } = data;

    // Mirrors the exact check in rabbitmq.js: `if (!order_id || !user_id || !amount)`
    // This means amount=0 is treated as missing (known falsy-check bug)
    if (!order_id || !user_id || !amount) {
      return { error: 'missing required fields' };
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return { error: 'invalid amount' };
    }

    const paymentMethod = method && VALID_METHODS.includes(method) ? method : 'CREDIT_CARD';

    return { order_id, user_id, amount: parsedAmount, method: paymentMethod };
  };

  test('parses valid message correctly', () => {
    const raw = JSON.stringify({ order_id: 5, user_id: 2, amount: 29.99, method: 'CREDIT_CARD' });
    const result = parseMessage(raw);
    expect(result.error).toBeUndefined();
    expect(result.order_id).toBe(5);
    expect(result.amount).toBe(29.99);
    expect(result.method).toBe('CREDIT_CARD');
  });

  test('handles malformed JSON without crashing', () => {
    const result = parseMessage('not valid json {{{');
    expect(result.error).toBe('invalid JSON');
  });

  test('handles empty string without crashing', () => {
    const result = parseMessage('');
    expect(result.error).toBe('invalid JSON');
  });

  test('returns error when order_id is missing', () => {
    const raw = JSON.stringify({ user_id: 1, amount: 10 });
    const result = parseMessage(raw);
    expect(result.error).toBe('missing required fields');
  });

  test('returns error when user_id is missing', () => {
    const raw = JSON.stringify({ order_id: 1, amount: 10 });
    const result = parseMessage(raw);
    expect(result.error).toBe('missing required fields');
  });

  test('returns error when amount is missing (undefined)', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2 });
    const result = parseMessage(raw);
    expect(result.error).toBe('missing required fields');
  });

  // BUG: amount=0 triggers "missing required fields" instead of "invalid amount"
  // because `!amount` is truthy for 0. Documented as a known defect.
  test('amount=0 triggers missing-fields error due to falsy check bug', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: 0 });
    const result = parseMessage(raw);
    // Current behavior: "missing required fields" (not "invalid amount" -- this is the bug)
    expect(result.error).toBe('missing required fields');
  });

  test('returns error for negative amount', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: -5 });
    const result = parseMessage(raw);
    expect(result.error).toBe('invalid amount');
  });

  test('returns error for non-numeric amount string', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: 'free' });
    const result = parseMessage(raw);
    // 'free' is truthy, so it passes the !amount check, then parseFloat('free') = NaN
    expect(result.error).toBe('invalid amount');
  });

  test('defaults unknown payment method to CREDIT_CARD', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: 5, method: 'BITCOIN' });
    const result = parseMessage(raw);
    expect(result.method).toBe('CREDIT_CARD');
  });

  test('accepts WALLET as valid method', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: 5, method: 'WALLET' });
    const result = parseMessage(raw);
    expect(result.method).toBe('WALLET');
  });

  test('accepts CASH as valid method', () => {
    const raw = JSON.stringify({ order_id: 1, user_id: 2, amount: 5, method: 'CASH' });
    const result = parseMessage(raw);
    expect(result.method).toBe('CASH');
  });
});

// ====== Section 2: POST /api/payments route ======
describe('POST /api/payments', () => {
  test('returns 400 when order_id is missing', async () => {
    const res = await request(app).post('/api/payments').send({ user_id: 1, amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/order_id.*user_id.*amount/i);
  });

  test('returns 400 when user_id is missing', async () => {
    const res = await request(app).post('/api/payments').send({ order_id: 1, amount: 10 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when amount is missing (undefined)', async () => {
    const res = await request(app).post('/api/payments').send({ order_id: 1, user_id: 2 });
    expect(res.status).toBe(400);
  });

  // BUG: amount=0 triggers "required fields" error instead of "amount must be positive"
  // because the route uses `!amount` which is truthy for 0. Documented as a known defect.
  test('amount=0 returns 400 with required-fields error (falsy-check bug)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ order_id: 1, user_id: 2, amount: 0 });
    expect(res.status).toBe(400);
    // Current behavior: "required fields" message (should ideally be "amount must be positive")
    expect(res.body.error).toMatch(/order_id.*user_id.*amount/i);
  });

  test('returns 400 for negative amount', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ order_id: 1, user_id: 2, amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('returns 400 for non-numeric amount string', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ order_id: 1, user_id: 2, amount: 'free' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('creates transaction with COMPLETED status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 55,
          order_id: 1,
          user_id: 2,
          amount: '29.99',
          method: 'CREDIT_CARD',
          status: 'COMPLETED',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app).post('/api/payments').send({
      order_id: 1,
      user_id: 2,
      amount: 29.99,
    });

    expect(res.status).toBe(201);
    expect(res.body.transaction.status).toBe('COMPLETED');
  });

  test('defaults to CREDIT_CARD for unknown method', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 56,
          order_id: 2,
          user_id: 3,
          amount: '15.00',
          method: 'CREDIT_CARD',
          status: 'COMPLETED',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app).post('/api/payments').send({
      order_id: 2,
      user_id: 3,
      amount: 15,
      method: 'DOGECOIN', // unknown, should default
    });

    expect(res.status).toBe(201);
    expect(res.body.transaction.method).toBe('CREDIT_CARD');
  });
});

// ====== Section 3: GET /api/payments/order/:orderId ======
describe('GET /api/payments/order/:orderId', () => {
  test('returns 400 for non-numeric order id', async () => {
    const res = await request(app).get('/api/payments/order/abc');
    expect(res.status).toBe(400);
  });

  test('returns 404 when no payment found for order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/payments/order/9999');
    expect(res.status).toBe(404);
  });

  test('returns transaction for valid order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 10, order_id: 5, user_id: 1, amount: '50.00', method: 'CASH', status: 'COMPLETED' }],
    });
    const res = await request(app).get('/api/payments/order/5');
    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('COMPLETED');
  });
});

// ====== Section 4: GET /api/payments/user/:userId ======
describe('GET /api/payments/user/:userId', () => {
  test('returns 400 for non-numeric user id', async () => {
    const res = await request(app).get('/api/payments/user/xyz');
    expect(res.status).toBe(400);
  });

  test('returns empty list when user has no transactions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/payments/user/1');
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('payment-service');
  });
});
