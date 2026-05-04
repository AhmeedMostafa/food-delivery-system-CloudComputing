// ====== Menu Item Routes ======
// Mounted at /api/menu-items
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// ====== GET /api/menu-items/:id ======
// Used by Order Service to fetch current price + availability
// before creating an order. Never trust prices from the client.
router.get('/:id', async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid menu item id' });
    }

    const result = await pool.query(
      `SELECT id, restaurant_id, name, description, price, image_url, is_available
       FROM restaurant_svc.menu_items WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ item: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== PUT /api/menu-items/:id ======
// Edit an existing menu item -- used in the restaurant owner dashboard
// TODO: add ownership verification before prod
router.put('/:id', async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid menu item id' });
    }

    const { name, description, price, image_url, is_available } = req.body;

    const existing = await pool.query(
      'SELECT id FROM restaurant_svc.menu_items WHERE id = $1',
      [itemId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Only update fields that were actually sent -- COALESCE keeps the old value otherwise
    const parsedPrice = price !== undefined ? parseFloat(price) : null;
    if (parsedPrice !== null && (isNaN(parsedPrice) || parsedPrice < 0)) {
      return res.status(400).json({ error: 'price must be a valid positive number' });
    }

    const result = await pool.query(
      `UPDATE restaurant_svc.menu_items
       SET name         = COALESCE($1, name),
           description  = COALESCE($2, description),
           price        = COALESCE($3, price),
           image_url    = COALESCE($4, image_url),
           is_available = COALESCE($5, is_available)
       WHERE id = $6
       RETURNING id, restaurant_id, name, description, price, image_url, is_available, created_at`,
      [
        name || null,
        description !== undefined ? description : null,
        parsedPrice,
        image_url !== undefined ? image_url : null,
        is_available !== undefined ? is_available : null,
        itemId,
      ]
    );

    res.json({ item: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== DELETE /api/menu-items/:id ======
// Hard delete for now -- could be changed to soft delete (is_available = false) later
// TODO: verify ownership before prod
router.delete('/:id', async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid menu item id' });
    }

    const result = await pool.query(
      'DELETE FROM restaurant_svc.menu_items WHERE id = $1 RETURNING id',
      [itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ message: 'Menu item deleted', id: itemId });
  } catch (err) {
    next(err);
  }
});

export default router;
