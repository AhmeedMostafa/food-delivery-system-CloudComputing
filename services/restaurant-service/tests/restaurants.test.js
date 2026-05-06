// ====== Restaurant Service Unit Tests ======
// Tests route behavior with mocked DB pool.
// No real database needed.

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

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');

// ====== Section 1: Menu item price validation ======
describe('Menu item price validation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST /api/restaurants/:id/menu rejects negative price', async () => {
    // No DB call needed -- validation fails before hitting the DB
    const res = await request(app)
      .post('/api/restaurants/1/menu')
      .send({ name: 'Burger', price: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('POST /api/restaurants/:id/menu rejects price=NaN (string)', async () => {
    const res = await request(app)
      .post('/api/restaurants/1/menu')
      .send({ name: 'Burger', price: 'free' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('POST /api/restaurants/:id/menu accepts price=0 (zero is allowed per >=0 check)', async () => {
    // price >= 0 is the actual rule in the route code
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 99,
          restaurant_id: 1,
          name: 'Free Item',
          description: null,
          price: '0.00',
          image_url: null,
          is_available: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const res = await request(app)
      .post('/api/restaurants/1/menu')
      .send({ name: 'Free Item', price: 0 });
    expect(res.status).toBe(201);
  });

  test('POST /api/restaurants/:id/menu accepts positive price', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          restaurant_id: 1,
          name: 'Burger',
          description: null,
          price: '9.99',
          image_url: null,
          is_available: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const res = await request(app)
      .post('/api/restaurants/1/menu')
      .send({ name: 'Burger', price: 9.99 });
    expect(res.status).toBe(201);
    expect(res.body.item.name).toBe('Burger');
  });

  test('POST /api/restaurants/:id/menu requires name', async () => {
    const res = await request(app)
      .post('/api/restaurants/1/menu')
      .send({ price: 9.99 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*price/i);
  });

  test('PUT /api/menu-items/:id rejects negative price update', async () => {
    // Mock: item exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(app)
      .put('/api/menu-items/5')
      .send({ price: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });
});

// ====== Section 2: Availability boolean default ======
describe('Menu item availability default', () => {
  beforeEach(() => jest.clearAllMocks());

  test('new menu item has is_available=true by default (DB schema)', async () => {
    // The DB INSERT does not specify is_available, so it defaults to TRUE per schema.
    // We verify the route returns whatever the DB says (which in production = true).
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          restaurant_id: 2,
          name: 'Pizza',
          description: null,
          price: '12.00',
          image_url: null,
          is_available: true, // DB default
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/restaurants/2/menu')
      .send({ name: 'Pizza', price: 12 });

    expect(res.status).toBe(201);
    expect(res.body.item.is_available).toBe(true);
  });
});

// ====== Section 3: Restaurant data structure ======
describe('Restaurant creation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST /api/restaurants returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/restaurants').send({ cuisine: 'Italian' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*required/i);
  });

  test('POST /api/restaurants creates restaurant successfully', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: 'Pizza Palace',
          cuisine: 'Italian',
          address: null,
          image_url: null,
          rating: '4.00',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app).post('/api/restaurants').send({
      name: 'Pizza Palace',
      cuisine: 'Italian',
    });

    expect(res.status).toBe(201);
    expect(res.body.restaurant.name).toBe('Pizza Palace');
  });

  test('GET /api/restaurants returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/restaurants/abc');
    expect(res.status).toBe(400);
  });

  test('GET /api/restaurants returns 404 for unknown restaurant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/restaurants/9999');
    expect(res.status).toBe(404);
  });
});

// ====== Section 4: Menu item routes ======
describe('GET /api/menu-items/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/menu-items/not-a-number');
    expect(res.status).toBe(400);
  });

  test('returns 404 when item does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/menu-items/999');
    expect(res.status).toBe(404);
  });

  test('returns item with price and availability', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 3,
          restaurant_id: 1,
          name: 'Fries',
          description: 'Crispy',
          price: '3.50',
          image_url: null,
          is_available: true,
        },
      ],
    });

    const res = await request(app).get('/api/menu-items/3');
    expect(res.status).toBe(200);
    expect(res.body.item.price).toBe('3.50');
    expect(res.body.item.is_available).toBe(true);
  });
});

describe('DELETE /api/menu-items/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when item does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/menu-items/999');
    expect(res.status).toBe(404);
  });

  test('deletes item and returns confirmation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const res = await request(app).delete('/api/menu-items/5');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('restaurant-service');
  });
});
