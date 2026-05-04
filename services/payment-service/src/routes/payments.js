// ====== Payment Routes ======
// This is a mock payment service -- all payments succeed immediately.
// In a real app you'd integrate Stripe, PayPal, etc. here.
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Supported payment methods -- could expand this later
const VALID_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'WALLET'];

// ====== POST /api/payments ======
// Records a payment transaction for an order.
// Called automatically by the order service after an order is created.
// Always returns COMPLETED (mock) -- no actual card processing.
router.post('/', async (req, res, next) => {
  try {
    const { order_id, user_id, amount, method } = req.body;

    if (!order_id || !user_id || !amount) {
      return res.status(400).json({ error: 'order_id, user_id, and amount are required' });
    }

    // Default to CREDIT_CARD if nothing was specified
    const paymentMethod = method && VALID_METHODS.includes(method) ? method : 'CREDIT_CARD';

    // Quick sanity check on amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    // Insert the transaction -- status is always COMPLETED for this mock
    const result = await pool.query(
      `INSERT INTO payment_svc.transactions (order_id, user_id, amount, method, status)
       VALUES ($1, $2, $3, $4, 'COMPLETED')
       RETURNING id, order_id, user_id, amount, method, status, created_at`,
      [order_id, user_id, parsedAmount, paymentMethod]
    );

    res.status(201).json({ transaction: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/payments/order/:orderId ======
// Get the payment for a specific order.
// Useful for showing "payment confirmed" in the UI.
router.get('/order/:orderId', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const result = await pool.query(
      `SELECT id, order_id, user_id, amount, method, status, created_at
       FROM payment_svc.transactions
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No payment found for this order' });
    }

    res.json({ transaction: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/payments/user/:userId ======
// List all payment transactions for a user -- handy for payment history.
router.get('/user/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const result = await pool.query(
      `SELECT id, order_id, user_id, amount, method, status, created_at
       FROM payment_svc.transactions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ transactions: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
