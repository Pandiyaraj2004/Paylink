const userService = require('../services/user.service');

/**
 * Thin HTTP handler for POST /api/users/me/fcm-token (Phase 13, master-doc.md
 * Section 27 push). Controllers never contain business logic — see
 * user.service.js.
 */
async function registerFcmToken(req, res, next) {
  try {
    const result = await userService.registerFcmToken(req.user.uid, req.body?.token);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { registerFcmToken };
