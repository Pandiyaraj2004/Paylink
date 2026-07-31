const merchantRepository = require('../repositories/merchant.repository');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const paymentRepository = require('../repositories/payment.repository');
const payoutRepository = require('../repositories/payout.repository');
const galleryRepository = require('../repositories/gallery.repository');
const notificationService = require('./notification.service');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');
const { slugify } = require('../utils/slug');
const { serializeTimestamp } = require('../utils/serializeTimestamp');
const { REVENUE_ORDER_STATUSES, netRevenue, loadRefundsByOrderId } = require('../utils/revenue');

const MAX_BUSINESS_NAME_LEN = 80;
const MAX_TAGLINE_LEN = 140;
const MAX_OWNER_NAME_LEN = 80;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_CONTACT_FIELD_LEN = 100;
const MAX_ADDRESS_LINE_LEN = 120;
const MAX_MAPS_URL_LEN = 500;
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'];
const MAX_PHOTO_BYTES = 150 * 1024; // ~150KB backstop (Section 19.2)
const MAX_LOGO_BYTES = 100 * 1024; // ~100KB backstop (Section 19.2)
// Cover banner (Phase 12 / Section 14.7 expansion, not in the original
// Section 19.2 schema table): reuses the SAME ~150KB budget as the profile
// photo above rather than inventing a new one — it's a similarly-sized
// single hero image, compressed client-side the same way. Combined with the
// existing photo (150KB) + logo (100KB) budgets, the three images together
// still land comfortably under Firestore's 1MB document limit even after
// base64's ~33% overhead (400KB decoded -> ~532KB encoded).
const MAX_COVER_BANNER_BYTES = 150 * 1024;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_SOCIAL_LINK_LEN = 200;
const SOCIAL_LINK_FIELDS = ['website', 'instagram', 'facebook', 'whatsapp'];
const BUSINESS_HOURS_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Deliberately small and honest: there is no real i18n/translation
// infrastructure anywhere in this app (frontend strings are all hardcoded
// English) — this only ever backs a STORED PREFERENCE field, not an actual
// language switch. Kept as an allow-list so the field can't be garbage.
const SUPPORTED_LANGUAGES = ['en', 'sv', 'no', 'da'];
const MAX_BANK_FIELD_LEN = 100;
const MAX_IBAN_SWIFT_LEN = 34; // IBAN's own max length, generous enough for a SWIFT/BIC too
// Section 19.2's `merchants/{id}/payout/details` schema — the account type
// enum it documents (`savings | checking | current`, "e.g.").
const ACCOUNT_TYPES = ['savings', 'checking', 'current'];
const MAX_UPI_ID_LEN = 100;
const MAX_GALLERY_IMAGE_BYTES = 80 * 1024; // Section 19.2: "~50-80KB compressed base64" per gallery image
const MAX_GALLERY_IMAGES = 20; // a sane cap — the doc doesn't specify one, but an unbounded subcollection isn't a design

// Simple bad-word list — a basic backstop, not a full profanity service
// (master-doc.md Section 26.6 / 30.12).
const BAD_WORDS = ['damn', 'hell', 'shit', 'fuck', 'bitch', 'asshole'];

function assertTaglineClean(tagline) {
  if (tagline == null) return;
  if (typeof tagline !== 'string' || tagline.length > MAX_TAGLINE_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `tagline must be a string up to ${MAX_TAGLINE_LEN} characters.`);
  }
  const lower = tagline.toLowerCase();
  if (BAD_WORDS.some((word) => lower.includes(word))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'tagline contains disallowed language.');
  }
}

/**
 * "About Us" business description (Section 19.2/14.14, Profile page) — same
 * profanity/length-filter treatment as tagline above, just a longer cap.
 */
function assertDescriptionClean(description) {
  if (description == null) return;
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `description must be a string up to ${MAX_DESCRIPTION_LEN} characters.`);
  }
  const lower = description.toLowerCase();
  if (BAD_WORDS.some((word) => lower.includes(word))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'description contains disallowed language.');
  }
}

/**
 * Address (Section 19.2: `{ line1, line2, city, state, postalCode, country }`
 * map, nullable) — same "shape/size only, no format enforcement" scope as
 * assertBusinessHours/assertSocialLinks above.
 */
function assertAddress(value) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'address must be an object.');
  }
  for (const key of Object.keys(value)) {
    if (!ADDRESS_FIELDS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `address has an unrecognized field "${key}".`);
    }
    const field = value[key];
    if (field != null && (typeof field !== 'string' || field.length > MAX_ADDRESS_LINE_LEN)) {
      throw new AppError(400, 'VALIDATION_ERROR', `address.${key} must be a string up to ${MAX_ADDRESS_LINE_LEN} characters.`);
    }
  }
}

function base64DecodedSize(base64) {
  const clean = base64.replace(/^data:.*;base64,/, '');
  return Math.floor((clean.length * 3) / 4);
}

function assertImageBudget(field, base64, maxBytes) {
  if (base64 == null) return;
  if (typeof base64 !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a base64 string.`);
  }
  if (base64DecodedSize(base64) > maxBytes) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} exceeds the maximum allowed size.`);
  }
}

/** Loose hex-color check (`#RRGGBB`) for the theme color pickers — Phase 12 / 14.7 expansion. */
function assertHexColor(field, value) {
  if (value == null) return;
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a hex color like #RRGGBB.`);
  }
}

/**
 * Business hours (Phase 12 / 14.7 expansion) — master-doc.md doesn't specify
 * a structure, so this keeps it simple: an object keyed by the 7 lowercase
 * weekday abbreviations, each either `null` (not set) or
 * `{ open, close, closed }` where `open`/`close` are free-text strings (e.g.
 * "09:00") and `closed` is a boolean. Validation is deliberately shallow —
 * just shape/size, no real time-format enforcement — matching this field's
 * "keep it simple, don't over-engineer" scope.
 */
function assertBusinessHours(value) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'businessHours must be an object keyed by weekday.');
  }
  for (const key of Object.keys(value)) {
    if (!BUSINESS_HOURS_DAYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `businessHours has an unrecognized day "${key}".`);
    }
    const day = value[key];
    if (day == null) continue;
    if (typeof day !== 'object' || Array.isArray(day)) {
      throw new AppError(400, 'VALIDATION_ERROR', `businessHours.${key} must be an object.`);
    }
    if (day.open != null && typeof day.open !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', `businessHours.${key}.open must be a string.`);
    }
    if (day.close != null && typeof day.close !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', `businessHours.${key}.close must be a string.`);
    }
    if (day.closed != null && typeof day.closed !== 'boolean') {
      throw new AppError(400, 'VALIDATION_ERROR', `businessHours.${key}.closed must be a boolean.`);
    }
  }
}

/**
 * Social links (Phase 12 / 14.7 expansion) — plain strings, basic
 * sanity-checked (string-shaped, reasonable length) only. Deliberately no
 * real URL-format enforcement per this field's documented scope.
 */
function assertSocialLinks(value) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'socialLinks must be an object.');
  }
  for (const key of Object.keys(value)) {
    if (!SOCIAL_LINK_FIELDS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `socialLinks has an unrecognized field "${key}".`);
    }
    const link = value[key];
    if (link != null && (typeof link !== 'string' || link.length > MAX_SOCIAL_LINK_LEN)) {
      throw new AppError(400, 'VALIDATION_ERROR', `socialLinks.${key} must be a string up to ${MAX_SOCIAL_LINK_LEN} characters.`);
    }
  }
}

function assertOptionalString(field, value, maxLen) {
  if (value == null) return;
  if (typeof value !== 'string' || value.length > maxLen) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a string up to ${maxLen} characters.`);
  }
}

function assertRequiredString(field, value, maxLen) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLen) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a non-empty string up to ${maxLen} characters.`);
  }
}

/**
 * Reuses the exact same `status` field that PATCH /api/merchants/:id/status
 * (updateMerchantStatus, below) writes 'open'/'closed' into, and the same
 * derivation Dashboard.tsx already uses client-side: a store that hasn't
 * been explicitly toggled yet (`active`) counts as open. Extracted so
 * order.service.js (Section 22.4's "store must be open" checkout
 * validation) can reuse this exact derivation rather than inventing a
 * second one.
 */
function isMerchantOpen(merchant) {
  return merchant.status === 'open' || merchant.status === 'active';
}

async function getMerchant(merchantId, uid) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);
  return merchant;
}

async function updateMerchantProfile(merchantId, uid, patch) {
  const merchant = await getMerchant(merchantId, uid);

  const allowedFields = [
    'businessName',
    'tagline',
    'category',
    'photoBase64',
    'logoBase64',
    // Phase 12 / Section 14.7 expansion — cover banner, theme colors,
    // business hours, social links. Not part of the original Section 19.2
    // schema table; additive fields on the same merchant document.
    'coverBannerBase64',
    'themePrimaryColor',
    'themeSecondaryColor',
    'businessHours',
    'socialLinks',
    // Notifications tab's "channel preferences" (Section 14.7) — honestly
    // minimal: `in_app` is the only channel that actually delivers anything
    // in this app (email/SMS were removed from the project earlier), so
    // this is a single real toggle, not a set of fake per-channel switches.
    'notificationPreferences',
    // Section 19.2/14.14 — About + Contact & Location cards on the Profile
    // page. Documented in the schema table since the doc's first revision,
    // implemented here now. `whatsapp` lives ONLY here, not in socialLinks
    // (Profile.tsx no longer offers a duplicate socialLinks.whatsapp field).
    'ownerName',
    'description',
    'email',
    'phone',
    'whatsapp',
    'address',
    'googleMapsUrl',
  ];
  const update = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      update[field] = patch[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'businessName')) {
    if (typeof update.businessName !== 'string' || update.businessName.length === 0 || update.businessName.length > MAX_BUSINESS_NAME_LEN) {
      throw new AppError(400, 'VALIDATION_ERROR', `businessName must be 1-${MAX_BUSINESS_NAME_LEN} characters.`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'tagline')) {
    assertTaglineClean(update.tagline);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'photoBase64')) {
    assertImageBudget('photoBase64', update.photoBase64, MAX_PHOTO_BYTES);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'logoBase64')) {
    assertImageBudget('logoBase64', update.logoBase64, MAX_LOGO_BYTES);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'coverBannerBase64')) {
    assertImageBudget('coverBannerBase64', update.coverBannerBase64, MAX_COVER_BANNER_BYTES);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'themePrimaryColor')) {
    assertHexColor('themePrimaryColor', update.themePrimaryColor);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'themeSecondaryColor')) {
    assertHexColor('themeSecondaryColor', update.themeSecondaryColor);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'businessHours')) {
    assertBusinessHours(update.businessHours);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'socialLinks')) {
    assertSocialLinks(update.socialLinks);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'notificationPreferences')) {
    const prefs = update.notificationPreferences;
    if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs) || typeof prefs.inApp !== 'boolean') {
      throw new AppError(400, 'VALIDATION_ERROR', 'notificationPreferences must be an object like { inApp: boolean }.');
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'ownerName')) {
    assertOptionalString('ownerName', update.ownerName, MAX_OWNER_NAME_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'description')) {
    assertDescriptionClean(update.description);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'email')) {
    assertOptionalString('email', update.email, MAX_CONTACT_FIELD_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'phone')) {
    assertOptionalString('phone', update.phone, MAX_CONTACT_FIELD_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'whatsapp')) {
    assertOptionalString('whatsapp', update.whatsapp, MAX_CONTACT_FIELD_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'address')) {
    assertAddress(update.address);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'googleMapsUrl')) {
    assertOptionalString('googleMapsUrl', update.googleMapsUrl, MAX_MAPS_URL_LEN);
  }

  // Deviation 1 (no admin approval gate): the AI Setup Concierge confirm
  // flow ends with a products bulk write followed by this branding PATCH as
  // its last two calls — once branding lands on a still-`pending_setup`
  // store, setup is considered complete and the store goes ACTIVE
  // immediately (no approval queue). Suspend Merchant, not an approval
  // queue, is the compensating control against a bad-actor store.
  const goingLive = merchant.status === 'pending_setup';
  if (goingLive) {
    update.status = 'active';
  }

  // Section 19.2: every merchant "must have a matching pageSlugs/{slug}
  // document" — assigned the first time a business name is known, since
  // nothing else in the setup flow ever generates one otherwise.
  if (!merchant.pageSlug) {
    const nameForSlug = update.businessName || merchant.businessName;
    if (nameForSlug) {
      update.pageSlug = await merchantRepository.reservePageSlug(merchantId, slugify(nameForSlug));
    }
  }

  if (Object.keys(update).length === 0) {
    return merchant;
  }

  const updated = await merchantRepository.updateMerchant(merchantId, update);

  // Phase 13 (Section 27, Deviation 1): "Your store is live" — repurposes
  // the old pre-launch "Merchant approved" event, fired the moment
  // onboarding actually completes (this transition) instead of at a
  // now-nonexistent approval step. Best-effort: a notification failure must
  // never fail the profile update it's a side effect of, same principle
  // payment.service.js already applies around notificationService.notify.
  if (goingLive && updated.status === 'active') {
    try {
      await notificationService.notify({ merchantId, type: 'store_live' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[merchant.service] store_live notification failed', err);
    }
  }

  return updated;
}

async function updateMerchantStatus(merchantId, uid, status) {
  await getMerchant(merchantId, uid);

  if (status !== 'open' && status !== 'closed') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be "open" or "closed".');
  }

  return merchantRepository.updateMerchant(merchantId, { status });
}

/**
 * PATCH /api/merchants/:id/settings (master-doc.md Section 14.12) — the
 * Language tab's single field. Bank/settlement details used to live on this
 * same endpoint (and on the main merchant document) in an earlier revision;
 * that's been reverted per Section 30 rule 12 / Section 19.2's `payout/details`
 * subcollection — bank details now have their OWN endpoint
 * (updateMerchantPayout/getMerchantPayout below), writing to a separately-
 * secured subcollection instead of fields on the document the public,
 * unauthenticated storefront query reads (getPublicPage below).
 *
 * `language` is a stored PREFERENCE only — there is no i18n/translation
 * infrastructure in this app, so picking a language here changes nothing
 * about what's displayed anywhere yet.
 */
async function updateMerchantSettings(merchantId, uid, patch) {
  const merchant = await getMerchant(merchantId, uid);

  const allowedFields = ['language'];
  const update = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      update[field] = patch[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'language')) {
    if (!SUPPORTED_LANGUAGES.includes(update.language)) {
      throw new AppError(400, 'VALIDATION_ERROR', `language must be one of ${SUPPORTED_LANGUAGES.join(', ')}.`);
    }
  }

  if (Object.keys(update).length === 0) {
    return merchant;
  }

  return merchantRepository.updateMerchant(merchantId, update);
}

/**
 * Masks a bank account number down to its last 4 characters (e.g.
 * "1234567890" -> "••••••7890") — Section 19.2: accountNumber is "never
 * rendered back in full to the client after initial entry." Short values
 * (<=4 chars) are masked entirely rather than echoed back unmasked.
 */
function maskAccountNumber(accountNumber) {
  if (typeof accountNumber !== 'string' || accountNumber.length === 0) return null;
  if (accountNumber.length <= 4) return '•'.repeat(accountNumber.length);
  return '•'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

/**
 * GET /api/merchants/:id/payout — not itemized under Section 14.12's own API
 * Calls line (which only lists the PATCH), but the Bank Details tab needs
 * *some* way to render its documented empty-vs-filled-in states (14.12:
 * "a clear 'not yet set up' empty state distinct from a validation error"),
 * so this fills that gap the same way merchant.service.js's getPublicPage
 * comment describes filling an analogous gap elsewhere. Returns a
 * deliberately non-sensitive projection: every field the merchant typed
 * except accountNumber, which is masked (see maskAccountNumber) per Section
 * 19.2's explicit "never rendered back in full" requirement.
 */
async function getMerchantPayout(merchantId, uid) {
  await getMerchant(merchantId, uid);
  const details = await payoutRepository.getPayoutDetails(merchantId);

  if (!details) {
    return { completed: false, completedAt: null };
  }

  return {
    completed: !!details.completedAt,
    completedAt: serializeTimestamp(details.completedAt) || null,
    bankName: details.bankName ?? null,
    accountHolderName: details.accountHolderName ?? null,
    maskedAccountNumber: maskAccountNumber(details.accountNumber),
    ifscSwift: details.ifscSwift ?? null,
    branch: details.branch ?? null,
    accountType: details.accountType ?? null,
    upiId: details.upiId ?? null,
    settlementCurrency: details.settlementCurrency ?? null,
  };
}

/**
 * PATCH /api/merchants/:id/payout (master-doc.md Section 14.12/19.2) — Bank
 * Details tab, writing to the separately-secured `merchants/{id}/payout/details`
 * subcollection (payout.repository.js) instead of the main merchant document,
 * per Section 19.2's explicit requirement that bank/settlement details never
 * be reachable through the same read path as the public storefront query.
 * Deliberately excluded from onboarding (Section 14.2/30 rule 12) — this is
 * the ONLY place these fields are ever written, always after the store is
 * already `active`.
 *
 * The form is submitted as a whole (matching the existing Settings UI
 * pattern this replaces), so every required field must be present on every
 * save — this isn't a partial-field autosave. `completedAt` is set once,
 * the first time a save succeeds; a later edit updates the other fields but
 * never resets `completedAt` back to null (Section 19.2: "set the first time
 * the entrepreneur successfully saves Bank Details").
 */
async function updateMerchantPayout(merchantId, uid, patch) {
  await getMerchant(merchantId, uid);

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  }

  const update = {
    bankName: patch.bankName,
    accountHolderName: patch.accountHolderName,
    accountNumber: patch.accountNumber,
    ifscSwift: patch.ifscSwift,
    accountType: patch.accountType,
    settlementCurrency: patch.settlementCurrency,
    branch: Object.prototype.hasOwnProperty.call(patch, 'branch') ? patch.branch || null : null,
    upiId: Object.prototype.hasOwnProperty.call(patch, 'upiId') ? patch.upiId || null : null,
  };

  assertRequiredString('bankName', update.bankName, MAX_BANK_FIELD_LEN);
  assertRequiredString('accountHolderName', update.accountHolderName, MAX_BANK_FIELD_LEN);
  assertRequiredString('accountNumber', update.accountNumber, MAX_IBAN_SWIFT_LEN);
  assertRequiredString('ifscSwift', update.ifscSwift, MAX_IBAN_SWIFT_LEN);
  assertOptionalString('branch', update.branch, MAX_BANK_FIELD_LEN);
  assertOptionalString('upiId', update.upiId, MAX_UPI_ID_LEN);

  if (!ACCOUNT_TYPES.includes(update.accountType)) {
    throw new AppError(400, 'VALIDATION_ERROR', `accountType must be one of ${ACCOUNT_TYPES.join(', ')}.`);
  }
  if (!env.SURFBOARD_ACTIVE_CURRENCIES.includes(update.settlementCurrency)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `settlementCurrency must be one of ${env.SURFBOARD_ACTIVE_CURRENCIES.join(', ')}.`
    );
  }

  const existing = await payoutRepository.getPayoutDetails(merchantId);
  const markCompleted = !existing?.completedAt;

  const saved = await payoutRepository.savePayoutDetails(merchantId, update, markCompleted);

  return {
    completed: !!saved.completedAt,
    completedAt: serializeTimestamp(saved.completedAt) || null,
    bankName: saved.bankName ?? null,
    accountHolderName: saved.accountHolderName ?? null,
    maskedAccountNumber: maskAccountNumber(saved.accountNumber),
    ifscSwift: saved.ifscSwift ?? null,
    branch: saved.branch ?? null,
    accountType: saved.accountType ?? null,
    upiId: saved.upiId ?? null,
    settlementCurrency: saved.settlementCurrency ?? null,
  };
}

/**
 * GET /api/merchants/:id/gallery, POST /api/merchants/:id/gallery,
 * DELETE /api/merchants/:id/gallery/:imageId (master-doc.md Section 14.14) —
 * the Profile page's drag-to-reorder gallery grid, writing to the
 * `merchants/{id}/gallery/{imageId}` subcollection (Section 19.2) rather
 * than an array field on the merchant document, for the same "keep the main
 * document small, avoid the 1MB limit" reasoning Section 19.2 documents.
 */
async function listGallery(merchantId, uid) {
  await getMerchant(merchantId, uid);
  const images = await galleryRepository.listGalleryImages(merchantId);
  return images.map((img) => ({ ...img, createdAt: serializeTimestamp(img.createdAt) }));
}

async function addGalleryImage(merchantId, uid, { imageBase64, order }) {
  await getMerchant(merchantId, uid);

  assertImageBudget('imageBase64', imageBase64, MAX_GALLERY_IMAGE_BYTES);
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'imageBase64 is required.');
  }

  const existing = await galleryRepository.listGalleryImages(merchantId);
  if (existing.length >= MAX_GALLERY_IMAGES) {
    throw new AppError(400, 'VALIDATION_ERROR', `A gallery can hold at most ${MAX_GALLERY_IMAGES} images.`);
  }

  const resolvedOrder = typeof order === 'number' && Number.isFinite(order) ? order : existing.length;

  const created = await galleryRepository.addGalleryImage(merchantId, { imageBase64, order: resolvedOrder });
  return { ...created, createdAt: serializeTimestamp(created.createdAt) };
}

async function deleteGalleryImage(merchantId, uid, imageId) {
  await getMerchant(merchantId, uid);

  const existing = await galleryRepository.getGalleryImage(merchantId, imageId);
  if (!existing) {
    throw new AppError(404, 'GALLERY_IMAGE_NOT_FOUND', 'Gallery image not found.');
  }

  await galleryRepository.deleteGalleryImage(merchantId, imageId);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function orderTimeMillis(o) {
  return o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt || 0).getTime();
}

function summarizePeriod(orders, refundsByOrderId) {
  const total = orders.reduce((sum, o) => sum + netRevenue(o, refundsByOrderId), 0);
  return { total: Number(total.toFixed(2)), orderCount: orders.length };
}

async function getMerchantSummary(merchantId, uid) {
  await getMerchant(merchantId, uid);

  const now = new Date();
  const todayStart = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

  // Month is always a superset of week/today (same "now" end, further-back
  // start) — one query plus in-memory filtering, instead of three
  // overlapping Firestore range queries each re-fetching the same orders.
  const monthOrders = await orderRepository.getOrdersInRange(merchantId, monthStart, now);
  const todayOrders = monthOrders.filter((o) => orderTimeMillis(o) >= todayStart.getTime());
  const weekOrders = monthOrders.filter((o) => orderTimeMillis(o) >= weekStart.getTime());

  const refundsByOrderId = await loadRefundsByOrderId(paymentRepository, merchantId, monthOrders);

  const recentOrders = [...monthOrders]
    .sort((a, b) => orderTimeMillis(b) - orderTimeMillis(a))
    .slice(0, 10)
    .map((order) => ({
      ...order,
      createdAt: serializeTimestamp(order.createdAt),
      // Dashboard.tsx's SalesTrendChart aggregates this field (not
      // totalAmount) so the trend line can never show a different revenue
      // definition than the stat cards above it — 0 for a pending/failed/
      // cancelled order, net of refunds otherwise, same as summarizePeriod.
      netAmount: netRevenue(order, refundsByOrderId),
    }));

  return {
    today: summarizePeriod(todayOrders, refundsByOrderId),
    week: summarizePeriod(weekOrders, refundsByOrderId),
    month: summarizePeriod(monthOrders, refundsByOrderId),
    // Was never actually populated before — Dashboard.tsx silently fell
    // back to a hardcoded 'EUR' for every merchant regardless of their real
    // currency. Derived from the most recent order; falls back to null
    // (Dashboard's own default) when there's no order yet to derive it from.
    currency: recentOrders[0]?.currency || null,
    recentOrders,
  };
}

/**
 * Section 14.9 — "lightweight view of repeat customers (by phone/email
 * hash, not full discovery/CRM)... only customers who've transacted at
 * least twice are surfaced as repeat." Spans the merchant's FULL order
 * history (getAllOrders), not one month like getMerchantSummary — a repeat
 * customer can easily span months. Groups by the same `customerRef ||
 * customerPhone` fallback key ai.service.js's computeRepeatCustomers
 * already uses, so both features agree on what "the same customer" means.
 */
async function getMerchantCustomers(merchantId, uid) {
  await getMerchant(merchantId, uid);

  const orders = await orderRepository.getAllOrders(merchantId);
  const revenueOrders = orders.filter((o) => REVENUE_ORDER_STATUSES.includes(o.status));
  const refundsByOrderId = await loadRefundsByOrderId(paymentRepository, merchantId, revenueOrders);

  const byCustomer = new Map();
  for (const order of revenueOrders) {
    const key = order.customerRef || order.customerPhone;
    if (!key) continue;

    const millis = orderTimeMillis(order);
    const entry = byCustomer.get(key) || {
      customerRef: key,
      name: null,
      phone: null,
      orderCount: 0,
      totalSpent: 0,
      lastOrderMillis: 0,
    };
    entry.orderCount += 1;
    entry.totalSpent += netRevenue(order, refundsByOrderId);
    if (millis >= entry.lastOrderMillis) {
      // Most recent order's display name/phone wins, in case they changed.
      entry.lastOrderMillis = millis;
      entry.name = order.customerName || entry.name;
      entry.phone = order.customerPhone || entry.phone;
    }
    byCustomer.set(key, entry);
  }

  return Array.from(byCustomer.values())
    .filter((c) => c.orderCount >= 2)
    .map(({ lastOrderMillis, ...c }) => ({
      ...c,
      totalSpent: Number(c.totalSpent.toFixed(2)),
      lastOrderAt: new Date(lastOrderMillis).toISOString(),
    }))
    .sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());
}

/**
 * Section 14.11 — "let the entrepreneur see and track the star ratings and
 * written reviews customers have left." Read-only: ratings are written
 * directly onto their order document by order.service.js's submitRating and
 * are never editable/deletable by the merchant (Section 30 rule 5).
 * `ratingAverage`/`ratingCount` are the same cached fields submitRating
 * maintains incrementally on the merchant document — returned here as the
 * aggregate summary rather than recomputed from every order.
 */
async function getMerchantReviews(merchantId, uid) {
  const merchant = await getMerchant(merchantId, uid);

  const orders = await orderRepository.getAllOrders(merchantId);
  const reviews = orders
    .filter((o) => o.rating != null)
    .map((o) => ({
      orderId: o.id,
      stars: o.rating.stars,
      comment: o.rating.comment || null,
      createdAt: o.rating.createdAt,
      customerName: o.customerName || null,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    ratingAverage: merchant.ratingAverage || 0,
    ratingCount: merchant.ratingCount || 0,
    reviews,
  };
}

// Only these order statuses ever reached a real Surfboard payment attempt
// (`payment.surfboardOrderId` gets set the moment createPayment calls
// surfboard.service.js — see payment.service.js) — 'pending' orders that
// never even got that far, and never generated any Surfboard-side event,
// have nothing to show in a "raw financial ledger" (Section 14.4).
const TRANSACTION_ORDER_STATUSES = ['paid', 'partially_refunded', 'refunded', 'failed', 'cancelled'];

// Subset of the above that could additionally have refund events against
// them — same list order.service.js's listOrders/REFUNDABLE_STATUSES uses,
// so a failed/cancelled order (never captured) is never queried for refunds
// it could never have.
const REFUND_ELIGIBLE_STATUSES = ['paid', 'refunded', 'partially_refunded'];

/**
 * GET /api/merchants/:id/transactions (master-doc.md Section 14.4's
 * documented API line, 22.4's sibling endpoint). Authenticated (owner). The
 * Transactions tab's "raw financial ledger — every payment, refund, and
 * payout event with Surfboard reference IDs": derived from the existing
 * `orders` collection's `payment` map plus each order's `refunds`
 * subcollection, exactly as the Orders/Refunds tabs already do for their own
 * views of the same data (Section 19.4) — not a new Firestore collection.
 *
 * No payout events are emitted here: jobs/settlementPayout.job.js is a
 * documented stub (no payout schema, no Surfboard payout/transfer API
 * surfaced yet) — see that file's own header comment. A future phase that
 * implements payouts for real should extend this ledger with a third entry
 * `type` once that schema exists, rather than inventing one speculatively
 * here.
 */
async function getMerchantTransactions(merchantId, uid, { from, to } = {}) {
  await getMerchant(merchantId, uid); // ownership check only — throws if uid doesn't own merchantId

  let fromDate = new Date(0);
  let toDate = new Date();
  if (from != null) {
    fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'from must be a valid date.');
    }
  }
  if (to != null) {
    toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'to must be a valid date.');
    }
  }

  const orders = await orderRepository.getOrdersInRange(merchantId, fromDate, toDate);

  const entries = [];

  for (const order of orders) {
    if (TRANSACTION_ORDER_STATUSES.includes(order.status) && order.payment?.surfboardOrderId) {
      entries.push({
        id: `${order.id}:payment`,
        type: 'payment',
        orderId: order.id,
        surfboardReferenceId: order.payment.surfboardPaymentId || order.payment.surfboardOrderId,
        method: order.payment.method || null,
        status: order.payment.status,
        amount: order.totalAmount,
        currency: order.currency,
        createdAt: serializeTimestamp(order.createdAt),
      });
    }
  }

  const refundEligibleOrders = orders.filter((o) => REFUND_ELIGIBLE_STATUSES.includes(o.status));
  const refundLists = await Promise.all(
    refundEligibleOrders.map((o) => paymentRepository.listRefunds(merchantId, o.id))
  );
  refundEligibleOrders.forEach((order, index) => {
    for (const refund of refundLists[index]) {
      entries.push({
        id: `${order.id}:refund:${refund.id}`,
        type: 'refund',
        orderId: order.id,
        surfboardReferenceId: refund.surfboardRefundId || null,
        reason: refund.reason || null,
        status: refund.status,
        amount: refund.amount,
        currency: order.currency,
        createdAt: serializeTimestamp(refund.createdAt),
      });
    }
  });

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { items: entries, total: entries.length };
}

/**
 * GET /api/merchants/:slug/public-page (master-doc.md Section 22.2, 15.1).
 * Public — no ownership check. Resolves the slug via the pageSlugs lookup,
 * then shapes the exact documented response: no fields beyond
 * `{ businessName, tagline, photoBase64, items, customAmountAllowed, isOpen }`
 * (notably no `logoBase64`, matching 15.1's layout listing) — plus an
 * additive `merchantId`. Section 22.4's `POST /api/orders` requires
 * `merchantId` in its body, but this is the only call the customer-facing
 * frontend ever makes before checkout, and it only ever knows the `slug`
 * (Section 22.2 documents no `merchantId` field here) — so a customer could
 * never construct a spec-compliant order body at all without this. Purely
 * additive: every documented field stays exactly as-is, this only fills the
 * gap.
 */
async function getPublicPage(slug) {
  const merchant = await merchantRepository.getMerchantBySlug(slug);
  if (!merchant) {
    throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found.');
  }

  const products = await productRepository.listProducts(merchant.id);
  const items = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    isCustomAllowed: !!p.isCustomAllowed,
    ...(p.imageBase64 ? { imageBase64: p.imageBase64 } : {}),
  }));

  // The documented merchant schema (Section 19.2) has no merchant-level
  // custom-amount field, so this is derived: true if any product allows a
  // custom amount. (Section 15.1 also references entrepreneur-configured
  // min/max bounds for custom amounts, but no such field exists anywhere in
  // the documented schema either — deliberately not inventing one here.)
  const customAmountAllowed = items.some((item) => item.isCustomAllowed);

  const isOpen = isMerchantOpen(merchant);

  // Section 15.1's "Customer Reviews" storefront section + Section 14.11's
  // note that Reviews "also populate the storefront's Customer Reviews
  // section." This is the PUBLIC, unauthenticated page, unlike
  // getMerchantReviews above — deliberately never includes `customerName`
  // or any other customer identity (Section 19.5, Privacy), just the
  // rating content itself, and capped to a handful of recent ones rather
  // than the merchant's full review history.
  const orders = await orderRepository.getAllOrders(merchant.id);
  const reviews = orders
    .filter((o) => o.rating != null)
    .sort((a, b) => new Date(b.rating.createdAt).getTime() - new Date(a.rating.createdAt).getTime())
    .slice(0, 10)
    .map((o) => ({ stars: o.rating.stars, comment: o.rating.comment || null, createdAt: o.rating.createdAt }));

  // Load store gallery images
  const galleryImages = await galleryRepository.listGalleryImages(merchant.id);
  const gallery = (galleryImages || [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((img) => ({ id: img.id, imageBase64: img.imageBase64 }));

  return {
    merchantId: merchant.id,
    businessName: merchant.businessName,
    tagline: merchant.tagline,
    photoBase64: merchant.photoBase64,
    coverBannerBase64: merchant.coverBannerBase64 || null,
    logoBase64: merchant.logoBase64 || null,
    category: merchant.category || null,
    phone: merchant.phone || null,
    email: merchant.email || null,
    whatsapp: merchant.whatsapp || null,
    address: merchant.address || null,
    businessHours: merchant.businessHours || null,
    googleMapsUrl: merchant.googleMapsUrl || null,
    description: merchant.description || null,
    gallery,
    items,
    customAmountAllowed,
    isOpen,
    ratingAverage: merchant.ratingAverage || 0,
    ratingCount: merchant.ratingCount || 0,
    reviews,
  };
}

module.exports = {
  getMerchant,
  updateMerchantProfile,
  updateMerchantSettings,
  updateMerchantStatus,
  getMerchantSummary,
  getMerchantTransactions,
  getMerchantCustomers,
  getMerchantReviews,
  getPublicPage,
  isMerchantOpen,
  getMerchantPayout,
  updateMerchantPayout,
  listGallery,
  addGalleryImage,
  deleteGalleryImage,
};
