const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

// GET /api/settings - Return business settings for the mobile app
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return res.json({ success: true, data: settings });
  } catch (err) {
    console.error('[settings] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

module.exports = router;
