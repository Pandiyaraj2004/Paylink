const aiService = require('../services/ai.service');
const AiUnavailableError = require('../utils/AiUnavailableError');
const AppError = require('../utils/AppError');

/**
 * POST /api/ai/setup-concierge (master-doc.md Section 22.8, 10.1)
 */
async function setupConcierge(req, res, next) {
  try {
    const { message, conversationHistory } = req.body || {};
    if (!message || typeof message !== 'string') {
      return next(new AppError(400, 'VALIDATION_ERROR', 'message is required.'));
    }

    const draft = await aiService.runSetupConcierge({
      message,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
    });

    return res.status(200).json({
      reply: draft.clarifyingQuestion || 'Here is a draft of your store based on what you told me.',
      draftCatalog: draft.items || [],
      clarifyingQuestion: draft.clarifyingQuestion || null,
      businessName: draft.businessName || null,
      tagline: draft.tagline || null,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return next(new AppError(503, 'AI_UNAVAILABLE', err.message));
    }
    return next(err);
  }
}

/**
 * POST /api/ai/earnings-assistant (master-doc.md Section 22.8, 10.2). All
 * business logic (merchant/order lookups, deterministic date-range
 * classification, and the Claude call) lives in ai.service.js#getEarningsAnswer
 * — this handler only validates input shape and maps the one expected
 * failure mode to its HTTP status (Section 20.2 layering rules).
 */
async function earningsAssistant(req, res, next) {
  try {
    const { question } = req.body || {};
    if (!question || typeof question !== 'string') {
      return next(new AppError(400, 'VALIDATION_ERROR', 'question is required.'));
    }

    const result = await aiService.getEarningsAnswer({ uid: req.user.uid, question });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return next(new AppError(503, 'AI_UNAVAILABLE', err.message));
    }
    return next(err);
  }
}

module.exports = { setupConcierge, earningsAssistant };
