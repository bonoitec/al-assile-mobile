/**
 * server/index.js - Al Assile Mobile Sales API Server
 *
 * Stack:  Express + better-sqlite3
 * Port:   process.env.PORT (default 3000)
 * Auth:   JWT for mobile API routes, X-Sync-Key for desktop sync routes
 */

const express     = require('express');
const cors        = require('cors');
const compression = require('compression');
const path        = require('path');
const os          = require('os');

// Database
const db = require('./database/connection');
const { initDatabase } = require('./database/schema');

// Middleware
const { authenticate } = require('./middleware/auth');

// Route modules
const authRouter     = require('./routes/auth');
const productsRouter = require('./routes/products');
const clientsRouter  = require('./routes/clients');
const salesRouter    = require('./routes/sales');
const paymentsRouter = require('./routes/payments');
const syncRouter     = require('./routes/sync');
const settingsRouter = require('./routes/settings');
const reportsRouter  = require('./routes/reports');

// ---------------------------------------------------------------------------
// Initialise database schema on startup
// ---------------------------------------------------------------------------
try {
  initDatabase(db);
} catch (err) {
  console.error('[startup] Database initialisation failed:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Express app setup
// ---------------------------------------------------------------------------
const app = express();

// CORS - allow all origins so any phone on the local network can connect.
// In production restrict this to your known mobile app origin.
app.use(cors());

// gzip responses; especially important for the initial product catalogue
// which can be large when image_data is included in sync payloads.
app.use(compression());

// Parse JSON bodies.  50 MB limit accommodates sync pushes that contain
// base64 product images.
app.use(express.json({ limit: '50mb' }));

// ---------------------------------------------------------------------------
// Request logging (lightweight, no external dependency)
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Auth - no JWT required (this is where you get the token)
app.use('/api/auth', authRouter);

// Sync - secured by X-Sync-Key header (desktop-to-mobile channel)
app.use('/api/sync', syncRouter);

// Mobile API - all routes below require a valid JWT
app.use('/api/products', authenticate, productsRouter);
app.use('/api/clients',  authenticate, clientsRouter);
app.use('/api/sales',    authenticate, salesRouter);
app.use('/api/payments', authenticate, paymentsRouter);
app.use('/api/settings', authenticate, settingsRouter);
app.use('/api/reports', authenticate, reportsRouter);

// ---------------------------------------------------------------------------
// Health check (unauthenticated - useful for load balancers and monitoring)
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'al-assile-mobile-server',
    time:    new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Static file serving for the built mobile Vue/React app
// ---------------------------------------------------------------------------
const MOBILE_DIST = path.join(__dirname, '../mobile/dist');

app.use(express.static(MOBILE_DIST));

// SPA fallback: any non-API GET returns index.html so client-side routing works.
// This must come AFTER all /api/* routes.
app.get(/^(?!\/api).*/, (_req, res) => {
  const indexPath = path.join(MOBILE_DIST, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // Mobile dist not built yet - return a helpful message instead of crashing
      res.status(200).send(
        '<h2>Al Assile Mobile Server is running.</h2>' +
        '<p>Run <code>npm run build:mobile</code> to build the mobile UI.</p>'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// Catches anything that calls next(err) or throws inside async route handlers.
app.use((err, _req, res, _next) => {
  console.error('[error]', err.stack || err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  // Discover local network IP so mobile devices on the same WiFi can connect
  const localIp = getLocalIp();

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Al Assile Mobile Sales Server            ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}              ║`);
  console.log(`║  Network:  http://${localIp}:${PORT}        ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  API endpoints:                              ║');
  console.log('║    POST  /api/auth/login                     ║');
  console.log('║    GET   /api/products                       ║');
  console.log('║    GET   /api/clients                        ║');
  console.log('║    POST  /api/sales                          ║');
  console.log('║    GET   /api/sales                          ║');
  console.log('║    POST  /api/sync/push   (X-Sync-Key)       ║');
  console.log('║    GET   /api/sync/pull   (X-Sync-Key)       ║');
  console.log('║    GET   /api/sync/status (X-Sync-Key)       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('[startup] Environment:', process.env.NODE_ENV || 'development');
  console.log('[startup] Database ready');
});

/**
 * getLocalIp - returns the first non-loopback IPv4 address found on the host.
 * Used to print the network URL at startup so mobile devices can connect.
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal) {
  console.log(`\n[shutdown] Received ${signal}, closing database and exiting...`);
  try {
    db.close();
    console.log('[shutdown] Database closed cleanly');
  } catch (err) {
    console.error('[shutdown] Error closing database:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
