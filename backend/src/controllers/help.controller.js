/**
 * GET /api/help/articles (master-doc.md Section 14.13) — backs the
 * entrepreneur Help page's searchable FAQ accordion. Section 14.13's own
 * Validation & Business Logic line is explicit that this is "static/
 * informational content, occasionally augmented by the AI chat for common
 * questions" — so unlike almost everything else this app serves, there's no
 * Firestore collection, no service/repository layer, and nothing merchant-
 * scoped behind this endpoint. It's the same hardcoded list for every
 * entrepreneur, describing how the app's own features actually behave today
 * (Profile, Settings > Bank Details, Orders > Refunds, the Dashboard
 * Open/Closed toggle, Products > Preview & Share) rather than generic
 * placeholder copy. Section 15.3's public-facing Support page for customers
 * is a separate page entirely and does not reuse this list.
 */
const HELP_ARTICLES = [
  {
    id: 'getting-started',
    category: 'Getting Started',
    question: 'How do I set up my store for the first time?',
    answer:
      "When you first sign up you'll choose between the AI Setup Concierge — describe your business in your own words and it drafts your catalog and storefront for you — or Manual Setup, a straightforward Add Item form if you'd rather build your catalog yourself. Either way, there's no waiting period or approval step: your store goes live the moment you finish onboarding, and you'll see a preview of your generated storefront before continuing on to your Dashboard.",
  },
  {
    id: 'no-registered-business',
    category: 'Getting Started',
    question: 'Do I need a registered business or company to sign up?',
    answer:
      "No — that's the problem PayLink exists to solve. Home bakers, tailors, tutors, mobile mechanics, beauty professionals, and similar solo or micro businesses can accept card and digital payments through PayLink without registering as an independent merchant themselves. PayLink acts as the merchant of record on your behalf.",
  },
  {
    id: 'edit-storefront',
    category: 'Your Storefront',
    question: 'How do I edit my storefront — business name, photos, hours, description?',
    answer:
      "Everything about how your storefront presents itself lives on the Profile page: business name, tagline, category, About description, contact and location details, profile photo, logo, cover banner, theme colors, business hours, social links, and your photo gallery. Click Save changes and your public page updates immediately — there's no separate publish step.",
  },
  {
    id: 'bank-details-payout',
    category: 'Payments & Payouts',
    question: 'Where do I add my bank account so I can actually get paid?',
    answer:
      "Go to Settings > Bank Details. This is kept deliberately separate from onboarding, so you can finish setting up your store and start selling before you're ready to hand over banking details — add them whenever suits you. Once saved, payouts for your completed sales are sent to that account on your regular payout cycle.",
  },
  {
    id: 'payout-timing',
    category: 'Payments & Payouts',
    question: 'How long does it take for a sale to reach my bank account?',
    answer:
      "After a short settlement reserve period — standard for card and digital payment processing — funds are transferred to the bank account on file under your normal payout cycle. You can track any individual sale and its status from the Orders page's Transactions tab at any time.",
  },
  {
    id: 'refund-a-customer',
    category: 'Refunds',
    question: 'How do I refund a customer?',
    answer:
      "Open the Orders page and use the Refunds tab (or find the order under the main Orders tab) to issue a full or partial refund on that order. Refunds are subject to the payment processor's standard refund time window, so it's worth acting on these promptly rather than waiting.",
  },
  {
    id: 'open-closed-toggle',
    category: 'Managing Your Store',
    question: "How do I close my store temporarily, e.g. while I'm away?",
    answer:
      "Your Dashboard has an Open/Closed toggle near the top. Switching to Closed doesn't delete or hide anything — your storefront, catalog, and history all stay exactly as they are — it just signals you're not currently taking orders. Flip it back to Open the moment you're ready again; there's no waiting period either way.",
  },
  {
    id: 'share-store-link-qr',
    category: 'Sharing Your Store',
    question: 'How do I share my whole store, versus a link for one specific product or amount?',
    answer:
      "For your whole storefront: the Products page's Preview & Share tab has Copy Link, a scannable QR code, and Download poster for a printable flyer with your business name, tagline, and QR code — handy for a stall or counter display. For one specific product or a custom one-off amount instead, use the Payment Links or QR Payments pages: pick a product (or enter a custom amount), optionally add the customer's phone number, and you'll get a link you can copy, share straight to WhatsApp, or download as its own QR code — opening it takes the customer straight to paying for that exact item or amount, not your full catalog.",
  },
  {
    id: 'repeat-customers',
    category: 'Managing Your Store',
    question: 'Where can I see who my repeat customers are?',
    answer:
      "The Customers page lists anyone who's ordered from you more than once, along with their order count and total spent — it's deliberately not a full contact directory, just enough to spot your regulars. Tapping a customer takes you to their orders on the Orders page. A one-time customer won't show up here; this view is specifically about repeat buyers.",
  },
  {
    id: 'ai-earnings-assistant',
    category: 'Managing Your Store',
    question: 'What can the AI Earnings Assistant on the Analytics page actually tell me?',
    answer:
      "Ask it things like \"how much did I make this week\", \"what's my best seller\", or \"how many repeat customers do I have\" and it'll answer using your real order data — it never estimates or makes numbers up, every figure is computed from your actual sales first and the AI just phrases the answer. The Analytics page also has a quick revenue chart and a top-products view for anyone who'd rather glance at the numbers directly instead of asking.",
  },
  {
    id: 'customer-reviews',
    category: 'Reviews',
    question: 'How do customer reviews and star ratings work — do I need to do anything?',
    answer:
      "Nothing on your end. After checkout, customers see a quick prompt to leave a 1-5 star rating and, optionally, a short written comment. Whatever they submit is reflected automatically on your storefront and rolled into your overall average rating. It's read-only for you by design — ratings can't be edited or removed by the merchant — and it's not a searchable review system, so it only ever appears on your own page.",
  },
  {
    id: 'troubleshoot-changes-not-showing',
    category: 'Troubleshooting',
    question: "I saved changes on my Profile page but customers say they don't see them — what should I check?",
    answer:
      'First confirm the save actually succeeded — you should see a confirmation toast after clicking Save changes; if you saw an error instead, the change was never applied and you\'ll need to try again. Next, check your store isn\'t set to Closed on the Dashboard, since a closed store still shows your page but signals you\'re not taking new orders. If everything looks right on your end, ask the customer to do a hard refresh — browsers can briefly cache a storefront page.',
  },
  {
    id: 'troubleshoot-payment-issue',
    category: 'Troubleshooting',
    question: "A customer says their payment failed or your storefront won't load — what now?",
    answer:
      "A declined card is normal and expected sometimes — the customer sees a clear failure message on their end and can simply retry with a different card or payment method; it's not something you need to fix. If the page itself won't load at all, check your own internet connection and confirm your store isn't paused, then ask the customer to refresh or try a different browser — most page-load issues are a brief connectivity blip rather than anything wrong with your store setup. If a payment shows as failed in your Orders page but the customer insists they were charged, use Contact Support below rather than manually reissuing anything.",
  },
];

function listArticles(req, res) {
  res.json({ articles: HELP_ARTICLES });
}

module.exports = { listArticles };
