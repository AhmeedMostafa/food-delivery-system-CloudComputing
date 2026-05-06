// ====== User Routes ======
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import pool from '../db.js';
import config from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ====== POST /api/users/register ======
// Accepts role: 'customer' (default), 'restaurant_owner', or 'delivery_driver'.
// If restaurant_owner, also expects restaurant_name + cuisine.
// Calls restaurant service to create the restaurant, then links it to the user.
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, address, role, restaurant_name, cuisine } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const validRoles = ['customer', 'restaurant_owner', 'delivery_driver'];
    const userRole = role && validRoles.includes(role) ? role : 'customer';

    if (userRole === 'restaurant_owner' && !restaurant_name) {
      return res.status(400).json({ error: 'restaurant_name is required for restaurant owners' });
    }

    // Check if email is already taken
    const existing = await pool.query(
      'SELECT id FROM user_svc.users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash the password -- saltRounds=10 is a solid balance of security vs speed
    const hashedPassword = await bcrypt.hash(password, 10);

    let restaurantId = null;

    // ---- If owner: create the restaurant first, then link ----
    if (userRole === 'restaurant_owner') {
      try {
        const restResp = await axios.post(
          `${config.restaurantServiceUrl}/api/restaurants`,
          { name: restaurant_name, cuisine: cuisine || null },
          { timeout: 5000 }
        );
        restaurantId = restResp.data.restaurant.id;
      } catch (err) {
        // If restaurant service is down, fail fast -- don't create a broken account
        throw new Error(`Could not create restaurant: ${err.message}`, { cause: err });
      }
    }

    const result = await pool.query(
      `INSERT INTO user_svc.users (name, email, password, phone, address, role, restaurant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, phone, address, role, restaurant_id, created_at`,
      [name, email, hashedPassword, phone || null, address || null, userRole, restaurantId]
    );

    const newUser = result.rows[0];

    // Sign a JWT so the user is immediately logged in after registration
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, restaurant_id: newUser.restaurant_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.status(201).json({ user: newUser, token });
  } catch (err) {
    next(err);
  }
});

// ====== POST /api/users/login ======
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM user_svc.users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal whether the email exists -- same error for both cases
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // JWT includes role and restaurant_id so downstream services don't need to call back
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, restaurant_id: user.restaurant_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Strip the password hash before sending -- never expose it
    const { password: _pwd, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/users/me ======
// Protected route -- returns the currently authenticated user profile including role
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, address, role, restaurant_id, created_at FROM user_svc.users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== PUT /api/users/me ======
// Lets a logged-in user update their profile.
// Password change requires current_password confirmation -- don't want accidents here.
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, phone, address, password, current_password } = req.body;

    // Fetch the current user record
    const existing = await pool.query(
      'SELECT * FROM user_svc.users WHERE id = $1',
      [req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = existing.rows[0];

    // If they want to change email, check it isn't taken by someone else
    if (email && email !== currentUser.email) {
      const emailCheck = await pool.query(
        'SELECT id FROM user_svc.users WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use by another account' });
      }
    }

    let newHashedPassword = currentUser.password;

    // Only update password if they explicitly sent a new one
    if (password) {
      if (!current_password) {
        return res.status(400).json({ error: 'current_password is required to set a new password' });
      }
      const passwordMatches = await bcrypt.compare(current_password, currentUser.password);
      if (!passwordMatches) {
        return res.status(401).json({ error: 'current_password is incorrect' });
      }
      newHashedPassword = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      `UPDATE user_svc.users
       SET name = $1, email = $2, phone = $3, address = $4, password = $5
       WHERE id = $6
       RETURNING id, name, email, phone, address, role, restaurant_id, created_at`,
      [
        name || currentUser.name,
        email || currentUser.email,
        phone !== undefined ? phone : currentUser.phone,
        address !== undefined ? address : currentUser.address,
        newHashedPassword,
        req.user.id,
      ]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/users/drivers ======
// Internal endpoint -- used by the restaurant owner dashboard to populate
// the "assign driver" dropdown. No auth needed since it's service-to-service.
router.get('/drivers', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email
       FROM user_svc.users
       WHERE role = 'delivery_driver'
       ORDER BY name`
    );
    res.json({ drivers: result.rows });
  } catch (err) {
    next(err);
  }
});

// ====== GET /api/users/:id ======
// Internal endpoint -- called by Order Service to verify a user exists.
// Not intended to be hit directly by frontend users.
router.get('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, address, role, restaurant_id, created_at FROM user_svc.users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
