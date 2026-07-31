const adminService = require('../services/admin.service');

/**
 * Thin HTTP handlers for /api/admin/* (master-doc.md Section 22.9, 16).
 * Controllers never contain business logic — see admin.service.js. Every
 * route behind these handlers is gated by adminAuth.middleware.js
 * (admin.routes.js) before it ever reaches here, so `req.admin` is always
 * present. Admin has no Firebase UID and no `users/{userId}` doc (Section
 * 24.4) — `req.admin.adminId` is the fixed string `'admin'` (Section 19.2's
 * `adminActions/{actionId}` note: "a simple identifier string... rather
 * than a Firebase UID reference"), used below as the `adminId` on every
 * audit-trail entry.
 */

async function getSummary(req, res, next) {
  try {
    const result = await adminService.getSummary();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function listMerchants(req, res, next) {
  try {
    const { status, page, pageSize } = req.query || {};
    const result = await adminService.listMerchants({ status, page, pageSize });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function suspendMerchant(req, res, next) {
  try {
    const { note } = req.body || {};
    const result = await adminService.suspendMerchant(req.params.id, req.admin.adminId, note);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function reactivateMerchant(req, res, next) {
  try {
    const result = await adminService.reactivateMerchant(req.params.id, req.admin.adminId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function approveMerchant(req, res, next) {
  try {
    const result = await adminService.approveMerchant(req.params.id, req.admin.adminId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function rejectMerchant(req, res, next) {
  try {
    const { reason } = req.body || {};
    const result = await adminService.rejectMerchant(req.params.id, req.admin.adminId, reason);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getReports(req, res, next) {
  try {
    const { from, to, category, region } = req.query || {};
    // `region` accepted (Section 22.9's documented query params) but
    // silently ignored — see admin.service.js's getReports doc comment.
    void region;
    const result = await adminService.getReports({ from, to, category });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAnalytics(req, res, next) {
  try {
    const { from, to } = req.query || {};
    const result = await adminService.getAnalytics({ from, to });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getRefunds(req, res, next) {
  try {
    const { from, to } = req.query || {};
    const result = await adminService.getRefunds({ from, to });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function listDisputes(req, res, next) {
  try {
    const { status, page, pageSize } = req.query || {};
    const result = await adminService.listDisputes({ status, page, pageSize });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function resolveDispute(req, res, next) {
  try {
    const { status, resolutionNotes } = req.body || {};
    const result = await adminService.resolveDispute(req.params.id, req.admin.adminId, { status, resolutionNotes });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function listLogs(req, res, next) {
  try {
    const { page, pageSize } = req.query || {};
    const result = await adminService.listLogs({ page, pageSize });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getMonitoring(req, res, next) {
  try {
    const result = await adminService.getMonitoring();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getPlatformSettings(req, res, next) {
  try {
    const result = await adminService.getPlatformSettings();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function updatePlatformSettings(req, res, next) {
  try {
    const result = await adminService.updatePlatformSettings(req.body || {}, req.admin.adminId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
  listMerchants,
  suspendMerchant,
  reactivateMerchant,
  approveMerchant,
  rejectMerchant,
  getReports,
  getAnalytics,
  getRefunds,
  listDisputes,
  resolveDispute,
  listLogs,
  getMonitoring,
  getPlatformSettings,
  updatePlatformSettings,
};
