const express = require('express');
const { isFirebaseReady } = require('../config/firebase');

const router = express.Router();

// GET /api/health — always responds 200 even if Firebase failed to init;
// Firebase status is reported in the payload instead.
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebase: isFirebaseReady() ? 'ready' : 'unavailable',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
