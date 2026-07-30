const Anthropic = require('@anthropic-ai/sdk');
const AiUnavailableError = require('../utils/AiUnavailableError');
const AppError = require('../utils/AppError');
const merchantRepository = require('../repositories/merchant.repository');
const orderRepository = require('../repositories/order.repository');

/**
 * Wraps the Claude API for PayLink's two AI modules (master-doc.md Section
 * 10, Section 26). Both functions are additive-only: if ANTHROPIC_API_KEY
 * is missing, they throw AiUnavailableError synchronously (no network call)
 * so callers can fall back cleanly (Section 26.7) without ever crashing the
 * server or blocking route registration.
 */

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Anthropic({ apiKey });
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // Handle the common case where the model wraps JSON in a ```json fence.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (err) {
    return null;
  }
}

const SETUP_CONCIERGE_SYSTEM_PROMPT = `You are PayLink's AI Setup Concierge. Your job is to turn a merchant's
free-text description of their business into a structured store profile.

Rules:
- Only use information the merchant actually provided. Never invent prices,
  item names, or business details.
- If a price or currency is ambiguous, ask ONE clarifying question before
  proceeding — do not guess.
- Support both fixed-price catalog items and "custom amount" items
  (e.g., "custom wedding blouse — price varies").
- Output ONLY a single JSON object, with no surrounding prose, of this exact
  shape: { "businessName": string, "tagline": string, "items": [{ "name": string,
  "price": number|null, "currency": string|null, "isCustom": boolean }],
  "clarifyingQuestion": string|null }.
- Keep the tagline under 10 words, friendly, and specific to the business
  described — never generic.`;

const EARNINGS_ASSISTANT_SYSTEM_PROMPT_TEMPLATE = (merchantName) => `You are PayLink's AI Earnings Assistant for ${merchantName || 'this merchant'}.
You will be given: (1) the merchant's question, and (2) a JSON object
of relevant transaction data already retrieved for you.

Rules:
- Only use the numbers provided in the JSON context. Never estimate or
  fabricate a figure.
- If the provided data does not answer the question, say so plainly and
  suggest what date range or detail would help.
- Keep answers short, plain-language, and specific (cite the actual
  number, not just a description).`;

async function runSetupConcierge({ message, conversationHistory = [] }) {
  const client = getClient();
  if (!client) {
    throw new AiUnavailableError('AI Setup Concierge is not configured.');
  }

  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SETUP_CONCIERGE_SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    throw new AiUnavailableError('AI Setup Concierge is temporarily unavailable.');
  }

  const text = response?.content?.find((block) => block.type === 'text')?.text;
  const parsed = extractJson(text);

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
    throw new AiUnavailableError('AI Setup Concierge returned an unreadable response.');
  }

  return parsed;
}

async function runEarningsAssistant({ question, retrievedData, merchantName }) {
  const client = getClient();
  if (!client) {
    throw new AiUnavailableError('AI Earnings Assistant is not configured.');
  }

  const userContent = JSON.stringify({ question, data: retrievedData });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: EARNINGS_ASSISTANT_SYSTEM_PROMPT_TEMPLATE(merchantName),
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    throw new AiUnavailableError('AI Earnings Assistant is temporarily unavailable.');
  }

  const text = response?.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new AiUnavailableError('AI Earnings Assistant returned an unreadable response.');
  }

  return { answer: text.trim() };
}

/**
 * Deterministic keyword classification of an earnings question into a date
 * range / aggregation type — this is backend logic, never left to the AI
 * (master-doc.md Section 10.2, 26).
 */
function classifyQuestion(question) {
  const q = (question || '').toLowerCase();
  const now = new Date();
  let from;
  let rangeLabel;

  if (/\btoday\b/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeLabel = 'today';
  } else if (/\bweek\b/.test(q)) {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    rangeLabel = 'this week';
  } else if (/\bmonth\b/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'this month';
  } else if (/best[\s-]?sell/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'best-selling (this month)';
  } else if (/repeat customer/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'repeat customers (this month)';
  } else {
    // Default fallback range: last 30 days.
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    rangeLabel = 'last 30 days';
  }

  return { from, to: now, rangeLabel };
}

/**
 * Full business logic behind POST /api/ai/earnings-assistant (master-doc.md
 * Section 22.8, 10.2, 20.2 — relocated here from ai.controller.js so the
 * controller stays a thin HTTP handler). Looks up the merchant, classifies
 * the question into a date range, retrieves + sums the matching orders, and
 * — only once real data exists — asks Claude to phrase the answer.
 */
async function getEarningsAnswer({ uid, question }) {
  const merchant = await merchantRepository.findMerchantByUserId(uid);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }

  const { from, to, rangeLabel } = classifyQuestion(question);
  const orders = await orderRepository.getOrdersInRange(merchant.id, from, to);

  const totalEarnings = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const orderCount = orders.length;

  const retrievedData = {
    rangeLabel,
    from: from.toISOString(),
    to: to.toISOString(),
    orderCount,
    totalEarnings: Number(totalEarnings.toFixed(2)),
    currency: orders[0]?.currency || null,
  };

  // No data yet — return the graceful fallback per Section 26.7, distinct
  // from a genuine 503 AI_UNAVAILABLE.
  if (orderCount === 0) {
    return {
      answer: "I don't have enough data to answer that yet — there are no orders recorded for that period.",
      available: false,
      retrievedData,
    };
  }

  try {
    const result = await runEarningsAssistant({
      question,
      retrievedData,
      merchantName: merchant.businessName,
    });
    return { answer: result.answer, available: true, retrievedData };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return {
        answer:
          "I don't have enough data to answer that yet, and the AI assistant is temporarily unavailable. Check the Orders table for details.",
        available: false,
        retrievedData,
      };
    }
    throw err;
  }
}

module.exports = { runSetupConcierge, runEarningsAssistant, getEarningsAnswer };
