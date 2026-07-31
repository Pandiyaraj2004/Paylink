const crypto = require('crypto');

/**
 * Derives the hashed cross-order customer identity described by
 * master-doc.md Section 19.5 ("`orders.customerRef` is a hashed value
 * derived from the phone/email used at checkout... used only so the
 * entrepreneur's Customers page can group orders by repeat customer").
 *
 * A simple SHA-256 hex digest of the normalized phone number — stored
 * ALONGSIDE the raw `customerName`/`customerPhone` fields (which the Pay
 * Securely modal deliberately collects and displays to the merchant for
 * fulfilment/contact purposes — a deliberate product evolution beyond this
 * section's original no-contact-management stance), not instead of them.
 * `customerRef` remains a stable, privacy-conscious key that would still let
 * repeat-customer analytics work even if the raw fields were ever dropped.
 *
 * Normalizes by stripping everything but digits so trivial formatting
 * differences ("+46 70 123 45 67" vs "0701234567") don't fragment the same
 * real customer into different hashes any more than the raw field already
 * would. Returns null for a blank/missing phone — customerRef is nullable.
 */
function hashCustomerRef(phone) {
  if (phone == null) return null;
  const normalized = String(phone).replace(/[^\d]/g, '');
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = { hashCustomerRef };
