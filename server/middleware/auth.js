const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'al-assile-mobile-secret-change-me';

/**
 * authenticate - Express middleware
 *
 * Expects:  Authorization: Bearer <token>
 * Attaches: req.user = { userId, username, role }
 * Rejects:  401 when the header is missing, the token is malformed, or expired.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header missing or malformed'
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId:   payload.userId,
      username: payload.username,
      role:     payload.role
    };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token has expired'
      : 'Invalid token';

    return res.status(401).json({ success: false, error: message });
  }
};

module.exports = { authenticate, JWT_SECRET };
