// ====== Order Routes ======
import express from 'express';
import axios from 'axios';
import pool from '../db.js';
import config from '../config.js';

const router = express.Router();

// Valid status transitions -- orders can only move forward, not backward
const VALID_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

// ====== POST /api/orders ======
// Creates a new order. Validates user + prices via other services.
// After creating the order, automatically calls Payment Service to record the transaction.
router.post('/', async (req, res, next) => {
  try {
    const { user_id, restaurant_id, items, delivery_address, payment_method } = req.body;

    if (!user_id || !restaurant_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'user_id, restaurant_id, and items[] are required' });
    }

    // ---- Step 1: verify the user exists ----
    // Quick sanity check before we do anything else
    try {
      await axios.get(`${config.userServiceUrl}/api/users/${user_id}`);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return res.status(404).json({ error: `User ${user_id} not found` });
      }
      throw new Error(`User service unavailable: ${err.message}`);
    }

    // ---- Step 2: fetch current price for each menu item ----
    // We never trust prices from the client -- always calculate server-side
    let calculatedTotal = 0;
    const enrichedItems = [];

    for (const orderItem of items) {
      const { menu_item_id, qty } = orderItem;

      if (!menu_item_id || !qty || qty < 1) {
        return res.status(400).json({ error: 'Each item needs menu_item_id and qty >= 1' });
      }

      let menuItem;
      try {
        const menuResponse = await axios.get(
          `${config.restaurantServiceUrl}/api/menu-items/${menu_item_id}`
        );
        menuItem = menuResponse.data.item;
      } catch (err) {
        if (err.response && err.response.status === 404) {
          return res.status(404).json({ error: `Menu item ${menu_item_id} not found` });
        }
        throw new Error(`Restaurant service unavailable: ${err.message}`);
      }

      if (!menuItem.is_available) {
        return res.status(400).json({ error: `Menu item "${menuItem.name}" is currently unavailable` });
      }

      const lineTotal = parseFloat(menuItem.price) * qty;
      calculatedTotal += lineTotal;

      enrichedItems.push({
        menu_item_id,
        name: menuItem.name,
        price: parseFloat(menuItem.price),
        qty,
      });
    }

    // Round to 2 decimal places to avoid floating point drift
    calculatedTotal = Math.round(calculatedTotal * 100) / 100;

    // ---- Step 3: insert order + items in a single transaction ----
    const client = await pool.connect();
    let newOrder;
    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `INSERT INTO order_svc.orders (user_id, restaurant_id, total_price, status, delivery_address)
         VALUES ($1, $2, $3, 'PLACED', $4)
         RETURNING id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at`,
        [user_id, restaurant_id, calculatedTotal, delivery_address || null]
      );

      newOrder = orderResult.rows[0];

      // Insert each line item, capturing the name+price snapshot
      for (const item of enrichedItems) {
        await client.query(
          `INSERT INTO order_svc.order_items (order_id, menu_item_id, name, price, qty)
           VALUES ($1, $2, $3, $4, $5)`,
          [newOrder.id, item.menu_item_id, item.name, item.price, item.qty]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // ---- Step 4: record the payment (fire-and-forget style, don't fail the order) ----
    // We try to create a payment record but don't block the order response if it fails.
    // TODO: in a real system you'd want stronger guarantees here (e.g. a saga pattern)
    try {
      await axios.post(`${config.paymentServiceUrl}/api/payments`, {
        order_id: newOrder.id,
        user_id,
        amount: calculatedTotal,
        method: payment_method || 'CREDIT_CARD',
      });
    } catch (paymentErr) {
      // Log the failure but don't crash the order -- the payment can be retried separately
      console.warn('[order-service] Payment recording failed for order', newOrder.id, ':', paymentErr.message);
    }

    res.status(201).json({ order: { ...newOrder, items: enrichedItems } });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/orders/restaurant/:restaurantId ======
// Returns all orders for a given restaurant -- used by the owner dashboard.
// Must be before /:id so Express doesn't interpret "restaurant" as an id.
router.get('/restaurant/:restaurantId', async (req, res, next) => {
  try {
    const restaurantId = parseInt(req.params.restaurantId, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: 'Invalid restaurant id' });
    }

    const ordersResult = await pool.query(
      `SELECT id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at
       FROM order_svc.orders
       WHERE restaurant_id = $1
       ORDER BY created_at DESC`,
      [restaurantId]
    );

    const orders = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await pool.query(
          'SELECT menu_item_id, name, price, qty FROM order_svc.order_items WHERE order_id = $1',
          [order.id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/orders/user/:userId ======
// Must be defined BEFORE /:id so Express doesn't treat "user" as an id
router.get('/user/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const ordersResult = await pool.query(
      `SELECT id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at
       FROM order_svc.orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    // Fetch items for each order
    const orders = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await pool.query(
          'SELECT menu_item_id, name, price, qty FROM order_svc.order_items WHERE order_id = $1',
          [order.id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/orders/driver/:driverId ======
// Returns all orders assigned to a specific delivery driver.
// Must be before /:id to avoid Express routing conflicts.
router.get('/driver/:driverId', async (req, res, next) => {
  try {
    const driverId = parseInt(req.params.driverId, 10);
    if (isNaN(driverId)) {
      return res.status(400).json({ error: 'Invalid driver id' });
    }

    const ordersResult = await pool.query(
      `SELECT id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at
       FROM order_svc.orders
       WHERE driver_id = $1
       ORDER BY created_at DESC`,
      [driverId]
    );

    const orders = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await pool.query(
          'SELECT menu_item_id, name, price, qty FROM order_svc.order_items WHERE order_id = $1',
          [order.id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/orders/:id ======
router.get('/:id', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const orderResult = await pool.query(
      `SELECT id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at
       FROM order_svc.orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsResult = await pool.query(
      'SELECT menu_item_id, name, price, qty FROM order_svc.order_items WHERE order_id = $1',
      [orderId]
    );

    res.json({ order: { ...orderResult.rows[0], items: itemsResult.rows } });
  } catch (err) {
    next(err);
  }
});

// ====== PATCH /api/orders/:id/status ======
// Update order status -- only allows values from the VALID_STATUSES list.
// Drivers can update to OUT_FOR_DELIVERY or DELIVERED; owners handle earlier states.
// TODO: add auth check -- verify the caller is allowed to update this specific order
router.patch('/:id/status', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const result = await pool.query(
      `UPDATE order_svc.orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at`,
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== PATCH /api/orders/:id/assign ======
// Assigns a delivery driver to an order.
// The driver_id in the body should be a valid delivery_driver user id.
router.patch('/:id/assign', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const { driver_id } = req.body;
    if (!driver_id) {
      return res.status(400).json({ error: 'driver_id is required' });
    }

    const parsedDriverId = parseInt(driver_id, 10);
    if (isNaN(parsedDriverId)) {
      return res.status(400).json({ error: 'driver_id must be a number' });
    }

    const result = await pool.query(
      `UPDATE order_svc.orders
       SET driver_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, user_id, restaurant_id, status, total_price, delivery_address, driver_id, created_at, updated_at`,
      [parsedDriverId, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
