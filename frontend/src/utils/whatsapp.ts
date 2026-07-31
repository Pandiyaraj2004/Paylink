/**
 * Builds a `wa.me` click-to-chat link (master-doc.md Section 14.6's one-tap
 * "Share via WhatsApp" button on Payment Links) — WhatsApp's own deep-link
 * format, so there's no API key, no WhatsApp Business account, and no send
 * happening here: the merchant's device just opens WhatsApp with the
 * message pre-filled, and the merchant decides whether to actually hit send.
 * First `wa.me` builder in this codebase, kept small and dependency-free.
 *
 * `phone`, if given, is reduced to bare digits — wa.me expects an
 * international number with no `+`, spaces, or dashes. With no phone (or an
 * empty one), the numberless `https://wa.me/?text=` form is used instead,
 * which opens WhatsApp's own contact picker so the merchant can choose who
 * to send it to.
 */
export function buildWhatsAppShareUrl(phone: string | null | undefined, text: string): string {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  const encodedText = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}
