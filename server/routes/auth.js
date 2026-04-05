const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database/connection');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Token lifetime: 24 hours.  Mobile salespeople typically re-open the app
// each morning, so a short expiry keeps stale tokens off the network.
const TOKEN_EXPIRY = '24h';

/**
 * POST /api/auth/login
 * Body: { username: string, password: string }
 *
 * Returns:
 *   200 { success: true, token, user: { id, username, name, role } }
 *   400 { success: false, error: 'Username and password are required' }
 *   401 { success: false, error: 'Invalid credentials' }
 *   403 { success: false, error: 'Account is disabled' }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required'
    });
  }

  let user;
  try {
    user = db.prepare(`
      SELECT id, username, password_hash, name, role, is_active
      FROM users
      WHERE username = ?
    `).get(username.trim());
  } catch (err) {
    console.error('[auth] DB error during login:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }

  if (!user) {
    // Return the same message for missing user and bad password to prevent
    // user enumeration via timing differences.
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (!user.is_active) {
    return res.status(403).json({ success: false, error: 'Account is disabled' });
  }

  const passwordValid = bcrypt.compareSync(password, user.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  // Issue JWT
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  // Safe user object - never expose the hash
  const safeUser = {
    id:       user.id,
    username: user.username,
    name:     user.name,
    role:     user.role
  };

  return res.json({ success: true, token, user: safeUser });
});

module.exports = router;
