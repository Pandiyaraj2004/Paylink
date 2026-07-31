const express = require('express');
const helpController = require('../controllers/help.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// GET /api/help/articles (master-doc.md Section 14.13) — the entrepreneur
// Help page's FAQ list. Authenticated entrepreneur only, per Section 14.13's
// own Permissions line ("a public-facing Support page also exists for
// customers — Section 15.3", which is a separate page and does not go
// through this router).
router.get('/articles', authMiddleware, requireRole('entrepreneur'), helpController.listArticles);

module.exports = router;
