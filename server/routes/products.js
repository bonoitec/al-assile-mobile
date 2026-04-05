const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

/**
 * GET /api/products
 * Returns all active products ordered by is_favorite DESC, then name.
 * image_data is excluded from the list to keep payloads small.
 * A boolean has_image flag indicates whether an image is available for
 * individual fetch via GET /api/products/:id/image.
 */
router.get('/', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT
        id,
        name,
        description,
        selling_price,
        purchase_price,
        unit,
        barcode,
        is_favorite,
        is_active,
        quantity,
        min_stock_alert,
        is_resale,
        created_at,
        updated_at,
        CASE WHEN image_data IS NOT NULL AND image_data != '' THEN 1 ELSE 0 END AS has_image
      FROM products
      WHERE is_active = 1
      ORDER BY is_favorite DESC, name ASC
    `).all();

    return res.json({ success: true, data: products });
  } catch (err) {
    console.error('[products] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/barcode/:barcode
 * Quick lookup used by the mobile barcode scanner.
 * Returns the full product row (still without image_data).
 */
router.get('/barcode/:barcode', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT
        id, name, description, selling_price, purchase_price,
        unit, barcode, is_favorite, is_active, quantity,
        min_stock_alert, is_resale, created_at, updated_at,
        CASE WHEN image_data IS NOT NULL AND image_data != '' THEN 1 ELSE 0 END AS has_image
      FROM products
      WHERE barcode = ? AND is_active = 1
    `).get(req.params.barcode);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    return res.json({ success: true, data: product });
  } catch (err) {
    console.error('[products] GET /barcode/:barcode error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

/**
 * GET /api/products/:id/image
 * Returns only the base64 image string for a single product.
 * Separated from the list endpoint to avoid sending megabytes of image
 * data when the mobile app fetches the product catalogue.
 */
router.get('/:id/image', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid product id' });
  }

  try {
    const row = db.prepare(`
      SELECT image_data FROM products WHERE id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (!row.image_data) {
      return res.status(404).json({ success: false, error: 'No image for this product' });
    }

    return res.json({ success: true, data: row.image_data });
  } catch (err) {
    console.error('[products] GET /:id/image error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch image' });
  }
});

module.exports = router;
