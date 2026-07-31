const notificationService = require('../services/notification.service');

/**
 * Thin HTTP handlers for the Notifications tab (master-doc.md Section
 * 14.7). Controllers never contain business logic — see
 * notification.service.js.
 */

/** GET /api/merchants/:id/notifications */
async function listNotifications(req, res, next) {
  try {
    const result = await notificationService.listNotifications(req.params.id, req.user.uid);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/notifications/:id/read — operates on the caller's own users/{uid}/notifications. */
async function markNotificationRead(req, res, next) {
  try {
    const result = await notificationService.markNotificationRead(req.user.uid, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listNotifications, markNotificationRead };
