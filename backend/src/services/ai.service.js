const AiUnavailableError = require('../utils/AiUnavailableError');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const merchantRepository = require('../repositories/merchant.repository');
const orderRepository = require('../repositories/order.repository');
const paymentRepository = require('../repositories/payment.repository');
const { REVENUE_ORDER_STATUSES, netRevenue, loadRefundsByOrderId } = require('../utils/revenue');

/**
 * Wraps PayLink's AI provider(s) for its two AI modules (master-doc.md
 * Section 10, Section 26). Provider order (Phase 9 switch): OpenRouter first,
 * then Gemini (gemini-2.0-flash) if OpenRouter is unconfigured or its call
 * fails, then a legacy Anthropic path as a last resort if that's the only
 * one configured. If NONE are configured/working, throws AiUnavailableError
 * synchronously or on failure so callers can fall back cleanly (Section
 * 26.7) without ever crashing the server or blocking route registration —
 * same graceful-degradation contract as before, just with more providers to
 * exhaust before giving up.
 */

const MAX_TOKENS = 1024;
// Live-verified against this account's actual OpenRouter key: several
// model slugs (Claude 3.5 Sonnet/Haiku, various Gemini slugs) 404'd with
// "No endpoints found" — likely account/routing-tier restrictions, not a
// code issue. `openai/gpt-4o-mini` is confirmed working.
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Calls OpenRouter's OpenAI-compatible chat completions endpoint. `messages`
 * is `[{role: 'user'|'assistant', content: string}, ...]` — the system
 * prompt is prepended separately since OpenRouter/OpenAI expect it as a
 * `system`-role message, not a top-level field.
 */
async function callOpenRouter(system, messages) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://paylink.app',
        'X-Title': 'PayLink',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI Service] OpenRouter error returned (status ${response.status}):`, errText);
      throw new Error(`OpenRouter returned status ${response.status}: ${errText}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('OpenRouter returned an empty response.');
    }
    return text;
  } catch (err) {
    console.error('[AI Service] OpenRouter fetch/parse failed:', err.message);
    throw err;
  }
}

/**
 * Calls Gemini's generateContent REST endpoint directly (no SDK dependency
 * added). Gemini has no 'system' role in `contents` — the system prompt goes
 * in the separate `systemInstruction` field — and uses 'model' rather than
 * 'assistant' for the AI's own turns.
 */
async function callGemini(system, messages) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI Service] Gemini error returned (status ${response.status}):`, errText);
      throw new Error(`Gemini returned status ${response.status}: ${errText}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  } catch (err) {
    console.error('[AI Service] Gemini fetch/parse failed:', err.message);
    throw err;
  }
}

/**
 * Legacy path — only reached if neither OpenRouter nor Gemini is configured.
 * Uses the same raw-fetch approach (no SDK import needed) against
 * Anthropic's Messages API.
 */
async function callAnthropicLegacy(system, messages) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: MAX_TOKENS, system, messages }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI Service] Anthropic error returned (status ${response.status}):`, errText);
      throw new Error(`Anthropic returned status ${response.status}: ${errText}`);
    }
    const data = await response.json();
    const text = data?.content?.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new Error('Anthropic returned an empty response.');
    }
    return text;
  } catch (err) {
    console.error('[AI Service] Anthropic fetch/parse failed:', err.message);
    throw err;
  }
}

/**
 * Tries each configured provider in order, falling through to the next on
 * either "not configured" (returns null, no network call made) or a thrown
 * error (network/auth/malformed-response failure). Throws AiUnavailableError
 * only once every configured provider has been tried and failed, or none are
 * configured at all — never a silent fake success.
 */
async function callAiModel(system, messages) {
  const providers = [
    { name: 'OpenRouter', fn: callOpenRouter },
    { name: 'Gemini', fn: callGemini },
    { name: 'Anthropic (Legacy)', fn: callAnthropicLegacy }
  ];
  let lastError = null;
  let triedAny = false;

  for (const provider of providers) {
    try {
      const text = await provider.fn(system, messages);
      if (text) {
        console.log(`[AI Service] Successful completion using ${provider.name}`);
        return text;
      }
    } catch (err) {
      console.warn(`[AI Service] Provider ${provider.name} failed:`, err.message);
      lastError = err;
      triedAny = true;
    }
  }

  throw new AiUnavailableError(
    lastError ? `AI provider call failed: ${lastError.message}` : 'No AI provider is configured.'
  );
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
- Only use information the merchant actually provided or that can be easily inferred. Never invent prices or item names.
- If a price or currency is ambiguous, ask ONE clarifying question before proceeding — do not guess.
- In addition to catalog items, extract or generate profile fields: description, category, phone, email, whatsapp, address, and googleMapsUrl if they are mentioned or can be logically inferred from context.
- Support both fixed-price catalog items and "custom amount" items (e.g., "custom wedding blouse — price varies").
- Output ONLY a single JSON object, with no surrounding prose, of this exact shape: {
  "businessName": string,
  "tagline": string,
  "description": string,
  "category": string,
  "phone": string|null,
  "email": string|null,
  "whatsapp": string|null,
  "address": { "line1": string, "city": string, "country": string }|null,
  "googleMapsUrl": string|null,
  "items": [{ "name": string, "price": number|null, "currency": string|null, "isCustom": boolean }],
  "clarifyingQuestion": string|null
}.
- Keep the tagline under 10 words, friendly, and specific to the business described — never generic.`;

const EARNINGS_ASSISTANT_SYSTEM_PROMPT_TEMPLATE = (merchantName) => `You are PayLink's AI Earnings Assistant for ${merchantName || 'this merchant'}.
You will be given: (1) the merchant's question, and (2) a JSON object
of relevant data already retrieved for you — its shape depends on the
question (earnings totals, a top-selling product, or a repeat-customer
count), and every number in it has already been computed deterministically.

Rules:
- Only use the numbers provided in the JSON context. Never estimate,
  calculate, or fabricate a figure — including counts, product names, or
  amounts not explicitly present in the data.
- If a field is null or a count is 0, say so plainly (e.g. "no orders yet
  this period", "no repeat customers yet") rather than guessing.
- If the provided data does not answer the question at all, say so plainly
  and suggest what date range or detail would help.
- Keep answers short, plain-language, and specific (cite the actual
  number, not just a description).`;

async function runSetupConcierge({ message, conversationHistory = [] }) {
  const history = [...conversationHistory];
  const lastHistoryMsg = history[history.length - 1];
  
  // If the last history message is already a user message matching the current message,
  // we do not need to append it again.
  const alreadyAppended = 
    lastHistoryMsg && 
    lastHistoryMsg.role === 'user' && 
    lastHistoryMsg.content === message;

  if (!alreadyAppended) {
    history.push({ role: 'user', content: message });
  }

  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  const text = await callAiModel(SETUP_CONCIERGE_SYSTEM_PROMPT, messages);
  const parsed = extractJson(text);

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
    throw new AiUnavailableError('AI Setup Concierge returned an unreadable response.');
  }

  return parsed;
}

async function runEarningsAssistant({ question, retrievedData, merchantName }) {
  const userContent = JSON.stringify({ question, data: retrievedData });

  const text = await callAiModel(EARNINGS_ASSISTANT_SYSTEM_PROMPT_TEMPLATE(merchantName), [
    { role: 'user', content: userContent },
  ]);

  return { answer: text.trim() };
}

/**
 * Deterministic keyword classification of a question into a date range +
 * aggregation type — this is backend logic, never left to the AI
 * (master-doc.md Section 10.2, 26). best_seller/repeat_customers are checked
 * before the plain time-range keywords so a free-typed question like "best
 * sellers this month" still classifies as best_seller, not generic earnings.
 */
function classifyQuestion(question) {
  const q = (question || '').toLowerCase().trim();
  const now = new Date();
  let from;
  let rangeLabel;
  let type = 'earnings';

  // Basic greeting or non-analytical conversational keywords check
  const GREETING_REGEX = /^(hi|hello|hey|hola|greetings|good\s+morning|good\s+afternoon|good\s+evening|yo|help|support)\b/i;
  const isGreeting = GREETING_REGEX.test(q);
  const hasAnalyticsKeywords = /earning|revenue|sale|order|best|sell|customer|payout|refund|chart|trend|performance|stat|report|analytic|make|perform|money|paid|transaction|income/i.test(q);

  if (isGreeting || !hasAnalyticsKeywords) {
    return { from: null, to: null, rangeLabel: 'general', type: 'general_chat' };
  }

  if (/best[\s-]?sell/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'this month';
    type = 'best_seller';
  } else if (/repeat customer/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'this month';
    type = 'repeat_customers';
  } else if (/\btoday\b/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeLabel = 'today';
  } else if (/\bweek\b/.test(q)) {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    rangeLabel = 'this week';
  } else if (/\bmonth\b/.test(q)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = 'this month';
  } else {
    // Default fallback range: last 30 days.
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    rangeLabel = 'last 30 days';
  }

  return { from, to: now, rangeLabel, type };
}

/**
 * Total quantity sold per product across every revenue-eligible order in
 * range (paid/partially_refunded/refunded — a partial refund still means
 * some of the sale happened; only custom-amount line items, which have no
 * productId, are excluded since there's no single "product" to rank).
 */
function computeBestSeller(orders) {
  const revenueOrders = orders.filter((o) => REVENUE_ORDER_STATUSES.includes(o.status));
  const soldByProduct = new Map();

  for (const order of revenueOrders) {
    for (const item of order.items || []) {
      if (!item.productId) continue;
      const existing = soldByProduct.get(item.productId) || { name: item.name, quantitySold: 0, orderCount: 0 };
      existing.quantitySold += item.quantity || 0;
      existing.orderCount += 1;
      soldByProduct.set(item.productId, existing);
    }
  }

  const ranked = Array.from(soldByProduct.values()).sort((a, b) => b.quantitySold - a.quantitySold);
  return { topProduct: ranked[0] || null, productsCompared: ranked.length };
}

/**
 * A "repeat customer" is one whose hashed identity (`customerRef` —
 * Section 19.5's hashed phone, now populated by order.service.js's
 * createOrder alongside the raw customerName/customerPhone display fields)
 * appears on 2+ revenue-eligible orders in range. Falls back to raw
 * `customerPhone` for any order created before `customerRef` existed, so
 * grouping doesn't silently drop older data.
 */
function computeRepeatCustomers(orders) {
  const revenueOrders = orders.filter((o) => REVENUE_ORDER_STATUSES.includes(o.status));
  const ordersByCustomer = new Map();

  for (const order of revenueOrders) {
    const key = order.customerRef || order.customerPhone;
    if (!key) continue;
    ordersByCustomer.set(key, (ordersByCustomer.get(key) || 0) + 1);
  }

  const uniqueCustomerCount = ordersByCustomer.size;
  const repeatCustomerCount = Array.from(ordersByCustomer.values()).filter((count) => count >= 2).length;
  return { repeatCustomerCount, uniqueCustomerCount, ordersConsidered: revenueOrders.length };
}

/**
 * Full business logic behind POST /api/ai/earnings-assistant (master-doc.md
 * Section 22.8, 10.2, 20.2 — relocated here from ai.controller.js so the
 * controller stays a thin HTTP handler). Looks up the merchant, classifies
 * the question into a date range + type, deterministically computes the
 * matching figures (net revenue, best seller, or repeat customers — never
 * left to the AI), and — only once real data exists — asks Claude to phrase
 * the answer.
 */
async function getEarningsAnswer({ uid, question }) {
  const merchant = await merchantRepository.findMerchantByUserId(uid);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }

  const { from, to, rangeLabel, type } = classifyQuestion(question);
  
  let orders = [];
  if (from && to) {
    orders = await orderRepository.getOrdersInRange(merchant.id, from, to);
  }
  const orderCount = orders.length;

  let retrievedData = {
    rangeLabel,
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    orderCount,
  };

  if (type === 'best_seller') {
    retrievedData = { ...retrievedData, ...computeBestSeller(orders) };
  } else if (type === 'repeat_customers') {
    retrievedData = { ...retrievedData, ...computeRepeatCustomers(orders) };
  } else if (type === 'earnings') {
    const refundsByOrderId = await loadRefundsByOrderId(paymentRepository, merchant.id, orders);
    const totalEarnings = orders.reduce((sum, o) => sum + netRevenue(o, refundsByOrderId), 0);
    const paidOrderCount = orders.filter((o) => REVENUE_ORDER_STATUSES.includes(o.status)).length;
    retrievedData = {
      ...retrievedData,
      paidOrderCount,
      totalEarnings: Number(totalEarnings.toFixed(2)),
      currency: orders.find((o) => REVENUE_ORDER_STATUSES.includes(o.status))?.currency || null,
    };
  }

  // No orders at all in range — return the graceful fallback per Section
  // 26.7, distinct from a genuine 503 AI_UNAVAILABLE. (Some orders but zero
  // paid/best-seller/repeat-customer data still flows through to the AI
  // below with real zeros/nulls — an accurate "nothing yet" is better than
  // a generic fallback when we do have real data to report.)
  if (type !== 'general_chat' && orderCount === 0) {
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

module.exports = { runSetupConcierge, getEarningsAnswer };
