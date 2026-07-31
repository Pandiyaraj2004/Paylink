/**
 * Firestore Admin SDK Timestamp fields serialize over `res.json()` as
 * `{ _seconds, _nanoseconds }` (Timestamp's own toJSON), not the ISO string
 * every documented response type actually expects — a Date/`new Date(...)`
 * on the frontend against that shape silently produces "Invalid Date".
 * Converts a Timestamp (or a plain Date, or an already-ISO string) to ISO;
 * passes through null/undefined unchanged.
 */
function serializeTimestamp(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

module.exports = { serializeTimestamp };
