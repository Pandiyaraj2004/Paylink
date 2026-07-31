const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
require('./config/firebase'); // initialize Firebase Admin (or warn) on startup

const requestLogger = require('./middleware/requestLogger.middleware');
const errorHandler = require('./middleware/errorHandler.middleware');
const AppError = require('./utils/AppError');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const merchantRoutes = require('./routes/merchant.routes');
const productRoutes = require('./routes/product.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const aiRoutes = require('./routes/ai.routes');
const configRoutes = require('./routes/config.routes');
const disputeRoutes = require('./routes/dispute.routes');
const helpRoutes = require('./routes/help.routes');
const adminRoutes = require('./routes/admin.routes');
const notificationRoutes = require('./routes/notification.routes');
const userRoutes = require('./routes/user.routes');
const paymentController = require('./controllers/payment.controller');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(requestLogger);
app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use(
  express.json({
    // Express's own default (100kb) is too small for this app's base64
    // image fields: the profile photo budget alone is ~150KB decoded
    // (Section 19.2), which is already ~200KB once base64-encoded on the
    // wire — over the default before validation ever runs, producing an
    // opaque 500 instead of merchant.service.js's clean 400. 2mb gives
    // headroom above the combined photo+logo+cover-banner budget
    // (~400KB decoded / ~532KB encoded, Phase 12) while staying well under
    // Firestore's own 1MB document ceiling those budgets are sized against.
    limit: '2mb',
    // Stashes the exact raw request body on req.rawBody, needed by
    // POST /api/webhooks/surfboard's HMAC-SHA512 signature verification
    // (master-doc.md Section 22.5, 24; guides/online-payments/
    // integrations/webhooks.md) — a signature computed over the raw bytes
    // can't be correctly re-derived from the already-parsed JSON.
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/merchants', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/config', configRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);

// POST /api/webhooks/surfboard (master-doc.md Section 22.5) — registered
// directly here rather than via its own routes/webhook.routes.js (not in
// Section 20.1's documented folder tree) since it's a single route whose
// URL prefix (/api/webhooks) matches no existing router's mount point.
// Signature-verified inside the controller, not Firebase-JWT-gated
// (Section 24) — no authMiddleware/requireRole on this line.
app.post('/api/webhooks/surfboard', paymentController.handleSurfboardWebhook);

// Unmatched routes
app.use((req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
});

// Error handler must be last
app.use(errorHandler);

module.exports = app;
