// ====== Auth Middleware ======
// Verifies JWT tokens and provides role-based access helpers.
// Used by user-service routes (and the token payload is trusted by other services too).
import jwt from 'jsonwebtoken';
import config from '../config.js';

// ====== JWT Verification ======
// Decodes the token and attaches { id, email, role, restaurant_id } to req.user.
// Returns 401 if the header is missing or the token is invalid/expired.
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ====== Role Guard ======
// Returns middleware that checks req.user.role against the required role.
// Always call requireAuth first so req.user is populated.
//
// Example usage:
//   router.put('/me', requireAuth, requireRole('customer'), handler)
export function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access denied — requires role: ${role}` });
    }
    next();
  };
}
