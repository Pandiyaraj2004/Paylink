const express = require('express');
const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// PATCH /api/notifications/:id/read (master-doc.md Section 14.7) — mounted
// at /api/notifications, not /api/merchants, since it addresses a
// notification directly under the authenticated caller's own
// users/{uid}/notifications subcollection, with no merchantId in the URL at
// all (see notification.service.js's markNotificationRead).
router.patch('/:id/read', authMiddleware, requireRole('entrepreneur'), notificationController.markNotificationRead);

module.exports = router;
