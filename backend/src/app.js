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
const aiRoutes = require('./routes/ai.routes');

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
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/merchants', productRoutes);
app.use('/api/ai', aiRoutes);

// Unmatched routes
app.use((req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
});

// Error handler must be last
app.use(errorHandler);

module.exports = app;
