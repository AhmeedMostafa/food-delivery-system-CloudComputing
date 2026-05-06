// ====== User Service Unit Tests ======
// Tests pure logic: bcrypt, JWT, validation, route behavior with mocked DB.
// No real database is needed -- pg.Pool is mocked below.

import { jest } from '@jest/globals';

// ---- Mock pg before importing app so pool never actually connects ----
const mockQuery = jest.fn();
jest.unstable_mockModule('../src/db.js', () => ({
  default: {
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

// ---- Mock axios so user-service doesn't try to call restaurant-service ----
const mockAxiosPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: jest.fn(),
  },
}));

// Lazy imports -- must happen after mocks are set up
const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');
const { default: bcrypt } = await import('bcryptjs');
const { default: jwt } = await import('jsonwebtoken');

// Reset mocks before every single test so queued values never bleed between tests
beforeEach(() => {
  mockQuery.mockReset();
  mockAxiosPost.mockReset();
});

// ====== Section 1: bcrypt round-trip ======
describe('Password hashing (bcryptjs)', () => {
  test('hashing a password and comparing it returns true', async () => {
    const password = 'MySecurePass123';
    const hash = await bcrypt.hash(password, 10);
    const result = await bcrypt.compare(password, hash);
    expect(result).toBe(true);
  });

  test('comparing with wrong password returns false', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    const result = await bcrypt.compare('wrong-battery', hash);
    expect(result).toBe(false);
  });

  test('bcrypt cost factor is at least 10', async () => {
    const hash = await bcrypt.hash('test', 10);
    // bcrypt hash starts with $2b$10$ when cost=10
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
  });
});

// ====== Section 2: JWT sign/verify ======
describe('JWT sign and verify', () => {
  const secret = 'test-jwt-secret';

  test('signed token decodes with correct payload', () => {
    const payload = { id: 1, email: 'test@test.com', role: 'customer' };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const decoded = jwt.verify(token, secret);
    expect(decoded.id).toBe(1);
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.role).toBe('customer');
  });

  test('token includes restaurant_id when provided', () => {
    const payload = { id: 5, email: 'owner@test.com', role: 'restaurant_owner', restaurant_id: 3 };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const decoded = jwt.verify(token, secret);
    expect(decoded.restaurant_id).toBe(3);
  });

  test('expired token throws TokenExpiredError', () => {
    const token = jwt.sign({ id: 1 }, secret, { expiresIn: '0s' });
    expect(() => jwt.verify(token, secret)).toThrow(jwt.TokenExpiredError);
  });

  test('tampered token throws JsonWebTokenError', () => {
    const token = jwt.sign({ id: 1 }, secret, { expiresIn: '1h' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => jwt.verify(tampered, secret)).toThrow(jwt.JsonWebTokenError);
  });

  test('token signed with wrong secret is rejected', () => {
    const token = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '1h' });
    expect(() => jwt.verify(token, secret)).toThrow(jwt.JsonWebTokenError);
  });
});

// ====== Section 3: Role enum validation ======
describe('Role validation logic', () => {
  const validRoles = ['customer', 'restaurant_owner', 'delivery_driver'];

  test('customer is a valid role', () => {
    expect(validRoles.includes('customer')).toBe(true);
  });

  test('restaurant_owner is a valid role', () => {
    expect(validRoles.includes('restaurant_owner')).toBe(true);
  });

  test('delivery_driver is a valid role', () => {
    expect(validRoles.includes('delivery_driver')).toBe(true);
  });

  test('admin is not a valid role', () => {
    expect(validRoles.includes('admin')).toBe(false);
  });

  test('empty string is not a valid role', () => {
    expect(validRoles.includes('')).toBe(false);
  });
});

// ====== Section 4: POST /api/users/register ======
describe('POST /api/users/register', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/users/register').send({
      email: 'test@test.com',
      password: 'pass123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*email.*password/i);
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/users/register').send({
      name: 'Alice',
      password: 'pass123',
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/users/register').send({
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(res.status).toBe(400);
  });

  test('returns 409 when email is already registered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app).post('/api/users/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'pass123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('returns 400 when role is restaurant_owner but restaurant_name missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // email not taken

    const res = await request(app).post('/api/users/register').send({
      name: 'Bob',
      email: 'bob@test.com',
      password: 'pass123',
      role: 'restaurant_owner',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/restaurant_name/i);
  });

  test('successful customer registration returns 201 with token', async () => {
    const fakeUser = {
      id: 42,
      name: 'Alice',
      email: 'alice@test.com',
      phone: null,
      address: null,
      role: 'customer',
      restaurant_id: null,
      created_at: new Date().toISOString(),
    };

    // email uniqueness check -- no existing user
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT -- returns new user
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser] });

    const res = await request(app).post('/api/users/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'securePass1',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(42);
    expect(res.body.token).toBeDefined();
    expect(res.body.token.split('.').length).toBe(3);
  });

  test('invalid role defaults to customer', async () => {
    const fakeUser = {
      id: 10,
      name: 'Charlie',
      email: 'charlie@test.com',
      phone: null,
      address: null,
      role: 'customer',
      restaurant_id: null,
      created_at: new Date().toISOString(),
    };

    mockQuery.mockResolvedValueOnce({ rows: [] }); // email check
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser] }); // INSERT

    const res = await request(app).post('/api/users/register').send({
      name: 'Charlie',
      email: 'charlie@test.com',
      password: 'pass123',
      role: 'superadmin', // not a valid role -- should default to customer
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });
});

// ====== Section 5: POST /api/users/login ======
describe('POST /api/users/login', () => {
  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/users/login').send({ password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/users/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  test('returns 401 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/users/login').send({
      email: 'nobody@test.com',
      password: 'pass',
    });
    expect(res.status).toBe(401);
  });

  test('returns 401 for wrong password', async () => {
    // Hash the correct password, then submit the wrong one
    const correctHash = await bcrypt.hash('correct-password', 10);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
        password: correctHash,
        role: 'customer',
        restaurant_id: null,
        phone: null,
        address: null,
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app).post('/api/users/login').send({
      email: 'alice@test.com',
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
  });

  test('returns 200 and JWT on correct credentials', async () => {
    const correctHash = await bcrypt.hash('correct-password', 10);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
        password: correctHash,
        role: 'customer',
        restaurant_id: null,
        phone: null,
        address: null,
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app).post('/api/users/login').send({
      email: 'alice@test.com',
      password: 'correct-password',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    // Response must not include the password hash
    expect(res.body.user.password).toBeUndefined();
  });
});

// ====== Section 6: GET /api/users/:id ======
describe('GET /api/users/:id', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/users/abc');
    expect(res.status).toBe(400);
  });

  test('returns 404 when user does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/users/9999');
    expect(res.status).toBe(404);
  });

  test('returns user with role info', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'Bob', email: 'bob@test.com', role: 'restaurant_owner', restaurant_id: 2 }],
    });
    const res = await request(app).get('/api/users/5');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('restaurant_owner');
    expect(res.body.user.restaurant_id).toBe(2);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('user-service');
  });
});
