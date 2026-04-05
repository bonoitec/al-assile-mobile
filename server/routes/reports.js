const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/reports/daily?date=YYYY-MM-DD
// ---------------------------------------------------------------------------

/**
 * Returns a daily summary for the given date (defaults to today).
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     date:            "YYYY-MM-DD",
 *     sales_count:     number,   // regular sales only
 *     returns_count:   number,   // return records only
 *     gross_sales:     number,   // sum of positive totals
 *     returns_total:   number,   // sum of return amounts (positive value)
 *     net_sales:       number,   // gross_sales - returns_total
 *     total_collected: number,   // sum of positive paid_amounts
 *     outstanding:     number,   // net_sales - total_collected
 *     items_sold:      number,   // total units sold (from sale_items on normal sales)
 *     top_products: [
 *       { name: string, quantity: number, revenue: number }
 *     ]
 *   }
 * }
 */
router.get('/daily', (req, res) => {
  let date = req.query.date;

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'date query param must be YYYY-MM-DD'
      });
    }
  } else {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    const d   = String(now.getDate()).padStart(2, '0');
    date = `${y}-${m}-${d}`;
  }

  try {
    // --- Aggregate sales and returns for the day ---
    const summary = db.prepare(`
      SELECT
        COUNT(CASE WHEN status != 'return' AND total >= 0 THEN 1 END) AS sales_count,
        COUNT(CASE WHEN status  = 'return' OR  total  < 0 THEN 1 END) AS returns_count,
        COALESCE(SUM(CASE WHEN status != 'return' AND total >= 0 THEN total       ELSE 0 END), 0) AS gross_sales,
        COALESCE(ABS(SUM(CASE WHEN status  = 'return' OR  total  < 0 THEN total  ELSE 0 END)), 0) AS returns_total,
        COALESCE(SUM(CASE WHEN status != 'return' AND paid_amount > 0 THEN paid_amount ELSE 0 END), 0) AS total_collected
      FROM sales
      WHERE date = ?
    `).get(date);

    const grossSales   = summary.gross_sales   || 0;
    const returnsTotal = summary.returns_total || 0;
    const netSales     = grossSales - returnsTotal;
    const outstanding  = Math.max(0, netSales - (summary.total_collected || 0));

    // --- Total units sold (only on non-return sales for the day) ---
    const itemsRow = db.prepare(`
      SELECT COALESCE(SUM(si.quantity), 0) AS items_sold
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.date = ?
        AND (s.status != 'return' AND s.total >= 0)
    `).get(date);

    const itemsSold = itemsRow ? (itemsRow.items_sold || 0) : 0;

    // --- Top products by revenue for the day ---
    const topProducts = db.prepare(`
      SELECT
        p.name                    AS name,
        SUM(si.quantity)          AS quantity,
        SUM(si.total)             AS revenue
      FROM sale_items si
      JOIN sales    s ON s.id  = si.sale_id
      JOIN products p ON p.id  = si.product_id
      WHERE s.date = ?
        AND (s.status != 'return' AND s.total >= 0)
      GROUP BY si.product_id, p.name
      ORDER BY revenue DESC
      LIMIT 10
    `).all(date);

    return res.json({
      success: true,
      data: {
        date,
        sales_count:     summary.sales_count   || 0,
        returns_count:   summary.returns_count || 0,
        gross_sales:     grossSales,
        returns_total:   returnsTotal,
        net_sales:       netSales,
        total_collected: summary.total_collected || 0,
        outstanding,
        items_sold:      itemsSold,
        top_products:    topProducts
      }
    });
  } catch (err) {
    console.error('[reports] GET /daily error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate daily report' });
  }
});

module.exports = router;
