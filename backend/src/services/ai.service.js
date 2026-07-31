const AiUnavailableError = require('../utils/AiUnavailableError');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const merchantRepository = require('../repositories/merchant.repository');
const { isMerchantOpen } = require('./merchant.service');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const paymentRepository = require('../repositories/payment.repository');
const { REVENUE_ORDER_STATUSES, netRevenue, loadRefundsByOrderId } = require('../utils/revenue');

/**
 * Wraps PayLink's AI provider(s) for its two AI modules (master-doc.md
 * Section 10, Section 26). Provider order: OpenRouter first, then Gemini
 * (gemini-2.0-flash) if OpenRouter is unconfigured or its call fails.
 * Anthropic/Claude was the original provider in an earlier session but was
 * never actually integrated with real credentials in this project — that
 * dead code path has been removed entirely, not left as an unreachable
 * fallback. If NEITHER OpenRouter nor Gemini is configured/working, throws
 * AiUnavailableError synchronously or on failure so callers can fall back
 * cleanly (Section 26.7) without ever crashing the server or blocking route
 * registration.
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
  ];
  let lastError = null;

  for (const provider of providers) {
    try {
      const text = await provider.fn(system, messages);
      if (text) {
        // eslint-disable-next-line no-console
        console.log(`[AI Service] Successful completion using ${provider.name}`);
        return text;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[AI Service] Provider ${provider.name} failed:`, err.message);
      lastError = err;
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
  } catch (_err) {
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

const MERCHANT_ASSISTANT_SYSTEM_PROMPT_TEMPLATE = (merchantName) => `You are PayLink's AI Assistant for ${merchantName || 'this merchant'} on the Analytics page.
You can answer TWO kinds of questions: (1) anything about the merchant's
own business profile — name, category, description, contact details,
address, business hours, social links, rating, how many products they
sell, whether the store is open — and (2) anything about their sales
performance — earnings today/this week/this month, best-selling product,
repeat customers.

You will always be given a JSON object ("context") containing BOTH the
current profile snapshot and the current earnings/analytics snapshot,
already retrieved deterministically — every fact and every number in it is
real and current, not something you need to look up or calculate.

Rules:
- Only use what's in the provided JSON context. Never estimate, calculate,
  or invent a figure, a business detail, or a fact — including counts,
  product names, addresses, or amounts not explicitly present in the data.
- Answer whatever the merchant actually asked, using whichever part of the
  context (profile or earnings) is relevant — don't force an earnings
  answer onto a profile question or vice versa.
- If a field is null, empty, or a count is 0, say so plainly (e.g. "you
  haven't added a phone number yet", "no orders yet this period") rather
  than guessing or ignoring the question.
- If the context genuinely doesn't contain enough to answer, say so plainly
  rather than inventing something reasonable-sounding.
- For a simple greeting with no real question, just greet back briefly and
  mention you can answer questions about their profile or their earnings —
  don't dump the entire context unprompted.
- Keep answers short, plain-language, and specific (cite the actual number
  or fact, not just a description of it).`;

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

async function runMerchantAssistant({ question, retrievedData, merchantName }) {
  const userContent = JSON.stringify({ question, context: retrievedData });

  const text = await callAiModel(MERCHANT_ASSISTANT_SYSTEM_PROMPT_TEMPLATE(merchantName), [
    { role: 'user', content: userContent },
  ]);

  return { answer: text.trim() };
}

/**
 * Deterministic profile snapshot — every field the AI is allowed to state as
 * fact about the merchant's business (master-doc.md Section 19.2). Never
 * includes payout/bank fields (Section 14.2/19.2's `payout/details` is a
 * separately-secured subcollection this function doesn't touch at all) —
 * the Analytics assistant has no business discussing settlement details.
 */
function buildProfileSnapshot(merchant, productCount) {
  return {
    businessName: merchant.businessName || null,
    ownerName: merchant.ownerName || null,
    category: merchant.category || null,
    tagline: merchant.tagline || null,
    description: merchant.description || null,
    whyChooseUs: merchant.whyChooseUs || null,
    email: merchant.email || null,
    phone: merchant.phone || null,
    whatsapp: merchant.whatsapp || null,
    address: merchant.address || null,
    businessHours: merchant.businessHours || null,
    socialLinks: merchant.socialLinks || null,
    isOpen: isMerchantOpen(merchant),
    ratingAverage: merchant.ratingAverage ?? 0,
    ratingCount: merchant.ratingCount ?? 0,
    productCount,
  };
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

function orderTimeMillis(order) {
  return order.createdAt?.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt || 0).getTime();
}

/** Net revenue + order count for one range — the same figures Dashboard.tsx's summary cards show, so the AI never states a number that disagrees with what the merchant sees elsewhere. */
function summarizeEarnings(orders, refundsByOrderId) {
  const total = orders.reduce((sum, o) => sum + netRevenue(o, refundsByOrderId), 0);
  return {
    total: Number(total.toFixed(2)),
    orderCount: orders.length,
    currency: orders.find((o) => REVENUE_ORDER_STATUSES.includes(o.status))?.currency || null,
  };
}

/**
 * Full business logic behind POST /api/ai/earnings-assistant (master-doc.md
 * Section 22.8, 10.2, 14.10, 20.2 — relocated here from ai.controller.js so
 * the controller stays a thin HTTP handler).
 *
 * Fixed a real bug here: the previous version routed a question into one of
 * a few rigid buckets via unbounded keyword substring-matching (e.g. "stat"
 * matched inside the word "state", misrouting a profile question like "what
 * is the current state of that profile" into an empty 30-day earnings
 * lookup, which then hit the canned "no orders" fallback instead of
 * answering the actual question) — and even when correctly routed to
 * "general chat," it never fetched any merchant PROFILE data at all, only
 * order data, so a profile question had nothing real to be answered from
 * regardless of routing.
 *
 * Fix: always deterministically gather BOTH a profile snapshot and a full
 * earnings snapshot (today/week/month/best-seller/repeat-customers, all
 * derived from a single 30-day order fetch) and hand the AI everything at
 * once — no fragile keyword routing needed, since the AI can only ever cite
 * facts/numbers actually present in this one real, complete context object,
 * whichever kind of question is actually asked.
 */
async function getEarningsAnswer({ uid, question }) {
  const merchant = await merchantRepository.findMerchantByUserId(uid);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Every sub-range (today/week) is a subset of "this month" once the
  // calendar-month start is at or before 30 days ago; falls back to a
  // rolling 30-day window otherwise so today/week are never fetched twice.
  const snapshotStart = monthStart < weekStart ? monthStart : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [monthOrders, products] = await Promise.all([
    orderRepository.getOrdersInRange(merchant.id, snapshotStart, now),
    productRepository.listProducts(merchant.id),
  ]);

  const todayOrders = monthOrders.filter((o) => orderTimeMillis(o) >= todayStart.getTime());
  const weekOrders = monthOrders.filter((o) => orderTimeMillis(o) >= weekStart.getTime());
  const refundsByOrderId = await loadRefundsByOrderId(paymentRepository, merchant.id, monthOrders);

  const earningsSnapshot = {
    today: summarizeEarnings(todayOrders, refundsByOrderId),
    thisWeek: summarizeEarnings(weekOrders, refundsByOrderId),
    thisMonth: summarizeEarnings(monthOrders, refundsByOrderId),
    ...computeBestSeller(monthOrders),
    ...computeRepeatCustomers(monthOrders),
  };

  const retrievedData = {
    profile: buildProfileSnapshot(merchant, products.length),
    earnings: earningsSnapshot,
  };

  try {
    const result = await runMerchantAssistant({
      question,
      retrievedData,
      merchantName: merchant.businessName,
    });
    return { answer: result.answer, available: true, retrievedData };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return {
        answer:
          "The AI assistant is temporarily unavailable right now — check the Dashboard, Analytics charts, or Profile page directly for the same information.",
        available: false,
        retrievedData,
      };
    }
    throw err;
  }
}

module.exports = { runSetupConcierge, getEarningsAnswer };
