const AppError = require('../utils/AppError');

/**
 * Final Express error handler. Formats every error into the standard
 * shape from master-doc.md Section 22.10:
 *   { error: { code, message, correlationId } }
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        correlationId,
      },
    });
  }

  // Unexpected/unhandled error — log full detail server-side, but never
  // leak internals to the client.
  // eslint-disable-next-line no-console
  console.error(`[errorHandler] correlationId=${correlationId}`, err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      correlationId,
    },
  });
}

module.exports = errorHandler;
