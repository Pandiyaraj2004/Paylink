/**
 * Pure string formatting only — Firestore uniqueness reservation lives in
 * merchant.repository.js (Section 20.1: utils/ is formatting, repositories/
 * is data access).
 */
function slugify(businessName) {
  const base = String(businessName || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics after NFKD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'store';
}

module.exports = { slugify };
