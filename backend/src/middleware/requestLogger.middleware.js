const { v4: uuidv4 } = require('uuid');

/**
 * Assigns a correlation ID to every request and logs a structured,
 * morgan-style line (method, path, status, duration, correlationId)
 * once the response finishes.
 */
function requestLogger(req, res, next) {
  req.correlationId = uuidv4();
  res.setHeader('X-Correlation-Id', req.correlationId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // eslint-disable-next-line no-console
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms correlationId=${req.correlationId}`
    );
  });

  next();
}

module.exports = requestLogger;
