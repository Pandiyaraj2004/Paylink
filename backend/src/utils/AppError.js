/**
 * Custom Error subclass carrying { statusCode, code, message } so the
 * errorHandler middleware can format every thrown error consistently
 * (Section 22.10 of master-doc.md).
 */
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, AppError);
  }
}

module.exports = AppError;
