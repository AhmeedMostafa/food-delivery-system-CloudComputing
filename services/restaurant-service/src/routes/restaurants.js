// ====== Restaurant Routes ======
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// ====== GET /api/restaurants ======
// Returns all restaurants -- used by the home page grid
router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, cuisine, address, image_url, rating, created_at FROM restaurant_svc.restaurants ORDER BY name'
    );
    res.json({ restaurants: result.rows });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/restaurants/:id ======
// Returns a restaurant plus all its menu items in one response
// Note: the /:id/menu route is below, Express matches in order, so it's fine
router.get('/:id', async (req, res, next) => {
  try {
    const restaurantId = parseInt(req.params.id, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: 'Invalid restaurant id' });
    }

    const restaurantResult = await pool.query(
      'SELECT id, name, cuisine, address, image_url, rating, created_at FROM restaurant_svc.restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const menuResult = await pool.query(
      `SELECT id, name, description, price, image_url, is_available
       FROM restaurant_svc.menu_items
       WHERE restaurant_id = $1 AND is_available = TRUE
       ORDER BY name`,
      [restaurantId]
    );

    res.json({
      restaurant: restaurantResult.rows[0],
      menu: menuResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/restaurants/:id/menu ======
// Returns ALL menu items for a restaurant (including unavailable) -- used by the dashboard
router.get('/:id/menu', async (req, res, next) => {
  try {
    const restaurantId = parseInt(req.params.id, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: 'Invalid restaurant id' });
    }

    const result = await pool.query(
      `SELECT id, name, description, price, image_url, is_available
       FROM restaurant_svc.menu_items
       WHERE restaurant_id = $1
       ORDER BY name`,
      [restaurantId]
    );

    res.json({ menu: result.rows });
  } catch (err) {
    next(err);
  }
});

// ====== POST /api/restaurants ======
// TODO: add admin/owner auth middleware here before going to production
// For now this is called internally by user-service during owner registration
router.post('/', async (req, res, next) => {
  try {
    const { name, cuisine, address, image_url, rating } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await pool.query(
      `INSERT INTO restaurant_svc.restaurants (name, cuisine, address, image_url, rating)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, cuisine, address, image_url, rating, created_at`,
      [name, cuisine || null, address || null, image_url || null, rating || 4.0]
    );

    res.status(201).json({ restaurant: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== PUT /api/restaurants/:id ======
// Update restaurant info -- called from owner dashboard
// TODO: add ownership check (req.user.restaurant_id === id) once we add auth to this service
router.put('/:id', async (req, res, next) => {
  try {
    const restaurantId = parseInt(req.params.id, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: 'Invalid restaurant id' });
    }

    const { name, cuisine, address, image_url, rating } = req.body;

    const existing = await pool.query(
      'SELECT id FROM restaurant_svc.restaurants WHERE id = $1',
      [restaurantId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const result = await pool.query(
      `UPDATE restaurant_svc.restaurants
       SET name       = COALESCE($1, name),
           cuisine    = COALESCE($2, cuisine),
           address    = COALESCE($3, address),
           image_url  = COALESCE($4, image_url),
           rating     = COALESCE($5, rating)
       WHERE id = $6
       RETURNING id, name, cuisine, address, image_url, rating, created_at`,
      [name || null, cuisine || null, address || null, image_url || null, rating || null, restaurantId]
    );

    res.json({ restaurant: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== POST /api/restaurants/:id/menu ======
// Add a new menu item to a restaurant
router.post('/:id/menu', async (req, res, next) => {
  try {
    const restaurantId = parseInt(req.params.id, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: 'Invalid restaurant id' });
    }

    const { name, description, price, image_url } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({ error: 'name and price are required' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'price must be a valid positive number' });
    }

    const result = await pool.query(
      `INSERT INTO restaurant_svc.menu_items (restaurant_id, name, description, price, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, restaurant_id, name, description, price, image_url, is_available, created_at`,
      [restaurantId, name, description || null, parsedPrice, image_url || null]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
