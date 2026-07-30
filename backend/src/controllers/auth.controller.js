const authService = require('../services/auth.service');

/**
 * Thin HTTP handler for POST /api/auth/session — parses req.user
 * (attached by auth.middleware) and delegates to auth.service.
 */
async function createSession(req, res, next) {
  try {
    const result = await authService.handleSession(req.user);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createSession };
