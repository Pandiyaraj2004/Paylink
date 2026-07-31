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

/**
 * Thin HTTP handler for POST /api/auth/admin-login (master-doc.md Section
 * 16.0/22.1/24.4) — public, no prior authentication required; this route
 * *is* the gate. Body validation and the actual credential check both live
 * in auth.service.js's handleAdminLogin.
 */
async function adminLogin(req, res, next) {
  try {
    const { accessCode, password } = req.body || {};
    const result = await authService.handleAdminLogin({ accessCode, password });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createSession, adminLogin };
