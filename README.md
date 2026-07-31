# PayLink

An AI-powered payment platform that lets a solo/micro-entrepreneur (home baker, tailor, tutor, mobile mechanic, etc.) get a live, brandable storefront and start accepting card payments in minutes — no company registration, no manual admin approval, no separate checkout page for their customers to navigate to.

This file is the practical getting-started guide: architecture, how to run it, every page in the app, a walkthrough of the real end-to-end flow, a manual test script with concrete inputs/outputs, and exactly which Surfboard Payments API calls are actually wired up. For the full product/architecture specification (business rules, data model, UI system, every page's detailed spec), see [`master-doc.md`](master-doc.md) — this README is the "how do I actually run and check this thing" companion to that document, not a replacement for it.

---

## 1. Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  frontend/       │ HTTPS  │  backend/         │        │  Firebase            │
│  React + Vite    │───────▶│  Express API      │───────▶│  • Authentication     │
│  TypeScript      │◀───────│  (Node.js)        │◀───────│  • Firestore          │
└─────────────────┘        └──────────────────┘        └─────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌───────────────┐ ┌─────────────┐ ┌──────────────────┐
            │ Surfboard      │ │ Claude /     │ │ Firebase Cloud    │
            │ Payments API   │ │ OpenRouter / │ │ Messaging (push   │
            │ (real, server- │ │ Gemini (AI)  │ │ notifications)    │
            │ to-server)     │ │              │ │                   │
            └───────────────┘ └─────────────┘ └──────────────────┘
```

- **Frontend** (`frontend/`) — React 18 + TypeScript + Vite, Tailwind CSS, React Query for server state, Firebase's client SDK for authentication (email/password + Google Sign-In). Three route groups: Entrepreneur (`/app/*`), Customer (`/pay/:slug*`), Admin (`/admin/*`).
- **Backend** (`backend/`) — Express (Node.js), talking to Firestore/Firebase Auth via the Firebase Admin SDK. Strict layering: routes → controllers (thin HTTP handlers) → services (business logic) → repositories (Firestore access). The backend is the *only* thing that ever talks to Surfboard or the AI provider directly — the browser never does.
- **Database** — Firestore only. There is **no Cloud Storage and no Cloud Functions** anywhere in this app, deliberately: since February 2026 both require Firebase's paid Blaze plan even at zero usage, so images (profile photo, logo, cover banner, product photos, gallery) are compressed client-side and stored as base64 strings directly on Firestore documents, and QR codes / payment-link posters / PDF receipts are all generated client-side on demand. This keeps the project on Firebase's free Spark plan.
- **Payments** — [Surfboard Payments](https://surfboardpayments.com/) is the real, live payment processor. See [Section 8](#8-surfboard-integration--what-actually-calls-what) for exactly which API calls are wired up.
- **AI** — the AI Setup Concierge and AI Earnings Assistant call a provider chain (OpenRouter → Google Gemini → a legacy direct Anthropic call as last resort) configured in `backend/src/services/ai.service.js`. Both features degrade gracefully: with no AI provider configured, onboarding falls back to the manual form and the Earnings Assistant returns a clear "temporarily unavailable" message — AI is additive, never a hard dependency for anything.
- **Admin auth** — deliberately *not* Firebase Authentication. A simple Access Code + Password pair checked against `ADMIN_ACCESS_CODE`/`ADMIN_PASSWORD`, with the backend issuing its own short-lived signed session token (`ADMIN_JWT_SECRET`). See the security warning in [Section 3](#3-environment-variables).

---

## 2. How to run it locally

**Prerequisites:** Node.js 18+, a Firebase project (Firestore + Authentication enabled, email/password and Google sign-in providers turned on), and Surfboard demo/sandbox credentials if you want real payment flows to work (everything else runs fine without them — see the degrade-gracefully notes above).

```bash
# from the repo root — installs backend/ and frontend/ via npm workspaces
npm install

# copy and fill in both env files (see Section 3 below)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then, in two terminals:

```bash
npm run dev:backend    # starts the API on http://localhost:4000
npm run dev:frontend   # starts Vite on http://localhost:5173
```

(equivalently: `cd backend && npm run dev` / `cd frontend && npm run dev`)

Open **http://localhost:5173** — that's the whole app. The backend has no separate admin UI or seed script; the very first merchant document is created automatically the first time someone signs up and the frontend calls `POST /api/auth/session`.

**Running the backend test suite:**
```bash
npm run test:backend   # or: cd backend && npm test
```
139 tests across 25 suites, using an in-memory Firestore stub (no real Firebase project needed to run tests).

---

## 3. Environment variables

Both `.env.example` files are heavily commented inline — read them, don't just copy blindly. The short version:

**`backend/.env`**
| Variable | Required for | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Everything | From your Firebase service account JSON. |
| `ANTHROPIC_API_KEY` | AI Setup Concierge, AI Earnings Assistant | Optional — both features degrade gracefully if blank. |
| `SURFBOARD_API_KEY` / `SURFBOARD_API_SECRET` / `SURFBOARD_API_BASE_URL` / `SURFBOARD_MERCHANT_ID` / `SURFBOARD_STORE_ID` / `SURFBOARD_TERMINAL_ID` | Real payments | Leave blank to get a clean `503 PROVIDER_UNAVAILABLE` on payment attempts instead of a crash. |
| `SURFBOARD_WEBHOOK_CERTIFICATE` | Webhook-confirmed payment completion | Generated once in the Surfboard Console (Console → Webhooks → Add new Webhook), shown only once. Without it, order creation and the hosted-page redirect still work, but a payment can only complete via the reconciliation poll (below), not instantly via webhook. |
| `SURFBOARD_ACTIVE_CURRENCIES` / `SURFBOARD_ACTIVE_PAYMENT_METHODS` | Catalog/checkout validation | Must match what's actually activated on your Surfboard merchant account — live-verified against the real demo account, only `SEK` + `CARD` are active there today. |
| `PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS` | Payment completion without a public webhook URL | Defaults to 60s — this is the **primary** way a pending payment resolves locally, since a live webhook needs a public HTTPS domain Surfboard can reach. |
| `ADMIN_ACCESS_CODE` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` | Admin login | ⚠️ There is no admin registration — set these yourself. Master-doc.md's documented development default is Access Code `pandisabi` / Password `pandisabi`, explicitly flagged there as **a placeholder that must never reach production** — replace with real hashed/stored credentials or a proper internal identity provider before any real deployment. |

**`frontend/.env`**
| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | Defaults to `http://localhost:4000/api` — matches the backend's default port. |
| `VITE_FIREBASE_*` | From Firebase Console → Project Settings → Your apps → Web app. |
| `VITE_FIREBASE_VAPID_KEY` | Optional — push notifications degrade to no-delivery if blank. |
| `VITE_SUPPORT_EMAIL` | Where the Help page's "Contact Support" button points. |

---

## 4. Every page in the app

### Public / Auth
| Route | Page |
|---|---|
| `/` | Landing — choose **Merchant** or **Admin** |
| `/login`, `/merchant/login` | Merchant login/register (Firebase email+password or Google) |
| `/register` | Merchant registration |
| `/forgot-password` | Password reset |
| `/admin/login` | Admin login — **Access Code + Password only, no registration** |

### Entrepreneur dashboard (`/app/*`, authenticated)
| Route | Page | What it does |
|---|---|---|
| `/app/setup` | Choose Setup Method | AI vs. Manual — two equal entry points |
| `/app/setup/ai` | AI Setup Concierge | Conversational onboarding — profile + catalog only, **no bank details** |
| `/app/setup/manual` | Manual Setup | Same fields, direct multi-step form |
| `/app/onboarding/preview` | Storefront Preview | Shown once automatically right after publishing, before Dashboard — the real live `/pay/:slug` page |
| `/app/dashboard` | Dashboard | Quick earnings snapshot, recent orders, a link into Analytics |
| `/app/products` | Products | Catalog management + a Preview & Share tab (copy link / QR / poster for the *whole store*) |
| `/app/orders` | Orders | Orders + Refunds tabs |
| `/app/payments` | Payments | Raw payment/refund ledger with Surfboard reference IDs, CSV export |
| `/app/payment-links` | Payment Links | Generate a link for one specific product or a custom amount, share via copy or WhatsApp |
| `/app/qr-payments` | QR Payments | Same as above, as a downloadable QR code |
| `/app/customers` | Customers | Repeat customers (2+ orders) only — not a full CRM |
| `/app/analytics` | Analytics | The full AI Earnings Assistant chat + revenue chart + top products |
| `/app/reviews` | Reviews | Star ratings + written reviews customers have left |
| `/app/profile` | Profile | Storefront identity: name, logo, cover image, description, address, contact, hours, theme, gallery |
| `/app/settings` | Settings | Bank Details, Language, Notifications tabs |
| `/app/help` | Help | Searchable FAQ + contact support |

### Customer-facing (`/pay/:slug*`, public)
| Route | Page |
|---|---|
| `/pay/:slug` | The merchant's live storefront — browsing + the "Pay Securely" checkout modal happen on this one page, never a separate checkout route |
| `/pay/:slug/receipt/:orderId` | Post-payment success/receipt page — downloadable/printable receipt, star rating prompt |
| `/pay/:slug/support` | Public customer support page |

### Admin (`/admin/*`, Access Code + Password auth)
| Route | Page |
|---|---|
| `/admin` | Admin Dashboard |
| `/admin/merchants` | Merchant Management |
| `/admin/reports` | Reports & Analytics |
| `/admin/refunds-disputes` | Refunds & Disputes |
| `/admin/system` | System (logs, monitoring) |
| `/admin/settings` | Platform Settings |

Admin **never approves merchants** — a store goes live automatically the moment onboarding completes; Suspend (from Merchant Management) is the compensating control for a bad actor, not a pre-launch gate.

---

## 5. End-to-end flow

```
Landing (/) → choose Merchant
  → Login/Register (Firebase)
    → first sign-in creates a merchant doc (status: pending_setup)
      → Choose Setup Method: AI or Manual
        → onboarding collects: shop name, category, tagline, catalog/pricing,
          logo, theme, currency, payment preference — NEVER bank details
        → Publish → merchant flips to status: active immediately (no approval queue)
          → Storefront Preview (/app/onboarding/preview) — the real live page
            → Continue to Dashboard
              → Products / Orders / Payments / Payment Links / QR Payments /
                Customers / Analytics / Reviews / Profile / Settings / Help

Meanwhile, a customer:
  Opens /pay/:slug (from a shared link, QR code, or Payment Link)
    → browses the storefront, opens "Pay Securely"
      → picks a product or custom amount, optionally taps a Payment Link/QR
        that pre-fills this exact modal
        → redirected to Surfboard's real Hosted Payment Page
          → completes (or fails) payment on Surfboard's own page
            → redirected back to /pay/:slug/receipt/:orderId
              → sees a success (or failure) card, can download/share the receipt
              → prompted for a 1–5 star rating + optional comment
                → rating appears on the merchant's Reviews page AND the
                  storefront's own Customer Reviews section immediately

Merchant later: Settings → Bank Details, whenever they're actually ready to
receive a payout — never required before the store can take payments.
```

---

## 6. Manual test script

Concrete input → expected output for each major flow. Run these against a real local setup (Section 2) with real Surfboard demo credentials for anything payment-related — the demo environment is safe to test against for real (real-card transactions auto-void after 30 minutes and never settle).

| # | Steps (input) | Expected result (output) |
|---|---|---|
| 1 | Register a new account at `/register` with a real email + password | Redirected into `/app/setup` (not `/app/dashboard`) — merchant is `pending_setup` |
| 2 | On `/app/setup`, choose **"Set up with AI"**, describe a business (e.g. "I sell handmade candles, prices around 15-30 SEK") | AI drafts a catalog + tagline; confirm → products created, merchant flips to `active` |
| 3 | After publishing (either path), wait for the "You're live!" animation | Redirected to `/app/onboarding/preview`, showing the *real* `/pay/:slug` storefront with your catalog |
| 4 | Click **Continue to Dashboard** | Lands on `/app/dashboard`; sidebar now shows all 14 nav items |
| 5 | Go to **Profile**, edit Description + Address (city/country) + Phone, click **Save changes** | Success toast; open `/pay/:slug` in a new tab → the same details are live immediately, no publish step |
| 6 | Go to **Settings → Bank Details**, fill in bank name/account holder/account number/IFSC/account type/currency, Save | Reload the tab → account number shows masked (e.g. `••••1234`), `completed: true` |
| 7 | Go to **Payment Links**, select one product, click **Copy Link** | Clipboard contains `http://localhost:5173/pay/<slug>?pay=<productId>` |
| 8 | Open that copied link in an incognito/new tab | Pay Securely modal auto-opens, pre-selected to that exact product |
| 9 | Go to **QR Payments**, select "Custom amount", enter `50`, click **Download QR** | A PNG downloads; scanning it (or opening its encoded URL) opens the modal in custom-amount mode with `50` pre-filled |
| 10 | On the storefront, complete checkout with a Surfboard demo card | Redirected to Surfboard's hosted page, then back to `/pay/:slug/receipt/:orderId` showing a success card with merchant name, amount, transaction ID, order ID, date |
| 11 | On the receipt page, submit a 4-star rating with a comment | Toast confirms; reload the merchant's **Reviews** page → the review appears with the correct star count, comment, and order link; reload the storefront → "Customer reviews" section shows it (without any customer name) |
| 12 | Repeat checkout as the *same* phone number a second time | Go to **Customers** → that phone number now appears with `orderCount: 2` and a real `totalSpent` |
| 13 | Click that customer row | Navigates to `/app/orders?customer=<ref>` with a "Showing orders for this customer only" banner — **requires the composite index in Section 9 below to be deployed first**, otherwise this (and the Orders page's status filter dropdown) will show a friendly "Could not load your orders" error instead of the filtered list |
| 14 | Go to **Orders → Refunds**, issue a partial refund on a paid order | Order status becomes `partially_refunded`; check **Payments** page → a matching `refund` ledger row appears with a Surfboard reference ID |
| 15 | Go to **Analytics**, click the **"Best seller"** quick-question chip | A real answer naming your actual top-selling product, computed server-side (never invented by the AI) |
| 16 | Go to **Help**, search for "bank" | FAQ list filters to the bank-details-related article only |
| 17 | Log out, go to `/admin/login`, enter the configured Access Code + Password | Lands on the Admin Dashboard; try `/app/dashboard` afterward → redirected away (admin session ≠ merchant session) |
| 18 | On Dashboard, toggle **Closed** | Storefront (`/pay/:slug`) immediately shows "This store isn't currently taking orders" and disables checkout |

---

## 7. Automated tests

```bash
cd backend && npm test
```
Runs the full Jest suite (139 tests / 25 suites) against an in-memory Firestore stub — covers auth, merchant CRUD, onboarding, orders/payments/refunds, webhook signature verification and idempotency, notifications, the AI Earnings Assistant's deterministic figures, admin role-gating, and disputes.

The frontend has no separate test runner configured yet — verify it via `cd frontend && npx tsc --noEmit` (type safety) plus the manual script above (actual behavior). `npm run build` in `frontend/` runs the same type-check as part of the production build.

---

## 8. Surfboard integration — what actually calls what

All of this lives in `backend/src/services/surfboard.service.js`, the *only* file allowed to talk to Surfboard directly. This is a real, live integration against Surfboard's documented Online Payments API (server-to-server — the browser never talks to Surfboard), not a mock.

- **Model:** a single shared Surfboard Merchant/Store/Terminal account backs *every* PayLink entrepreneur — not a separate Surfboard sub-merchant created per entrepreneur. Real per-merchant Surfboard onboarding would require domain verification and roughly a day of manual review, which is incompatible with PayLink's instant-live-after-onboarding model. Each PayLink order is tracked back to its owning merchant via `referenceId` (PayLink's own internal order ID).
- **Create Order** (`POST /orders`) — used for both a real purchase and, with `type: 'return'`, a refund. When online checkout control functions are set, the response includes `paymentPageLink` directly — no separate "initiate payment" call needed for a normal checkout.
- **Hosted Payment Page redirect** — the checkout flow is a redirect to Surfboard's own hosted page, not an inline form on PayLink's servers; card data never touches PayLink's backend at all. The customer returns via `redirectUrl` (success → the receipt page) or `failureRedirectUrl` (failure → back to checkout).
- **Initiate Payment** (`POST /payments`) — for a normal card purchase this does NOT return a payment URL (only used for refunds below); the Create Order call above is what checkout actually uses.
- **Void Payment** (`PUT /payments/:id/void`) — tried first for a same-day, full-amount refund with no prior partial refunds (no refund-processing fee, but only works before the payment settles).
- **CNP Return + Refund** (`POST /payments` with `paymentMethod: 'CARD_NP'` against a `type: 'return'` order) — the fallback refund path once a payment has settled or Void isn't available; models a refund as a new "return" order per Surfboard's documented online-refund flow.
- **Fetch Order Status** (`GET /orders/:id/status`) — used only by the background payment-reconciliation job to recover an order whose webhook confirmation never arrived (the primary completion path in any environment without a public HTTPS webhook URL).
- **Fetch Payment Methods** (`GET /merchants/:id/payment-methods`) — a safe, read-only startup health check confirming the configured credentials actually authenticate, logged as a warning (never blocks server boot) if it fails.
- **Webhook signature verification** — HMAC-**SHA512**, Base64-encoded, header `x-webhook-signature`, keyed by `SURFBOARD_WEBHOOK_CERTIFICATE`. If that certificate isn't configured, the webhook endpoint correctly returns `503` rather than silently skipping verification — a real security boundary, not a soft warning.
- **Graceful degradation** — every method above throws a clean `SurfboardUnavailableError` (mapped to `503 PROVIDER_UNAVAILABLE`) if Surfboard isn't configured at all, so the rest of the app runs and is fully testable without a Surfboard account.

---

## 9. Known gaps (honest status, not swept under the rug)

- **Two Firestore composite indexes are declared but not yet deployed** — discovered by live-testing against the real project during this pass. `GET /api/merchants/:id/orders?status=...` (the Orders page's status filter — pre-existing, not something this pass added) and `?customer=...` (the new Customers page's "filtered by customer" nav) both currently return a raw `500` against the real database until these are deployed, because the underlying Firestore query combines an equality filter with a sort on a different field. The index definitions are already checked into `backend/firestore.indexes.json`; see `backend/FIRESTORE_INDEX_SETUP.md` for the one-time `firebase deploy --only firestore:indexes` command (or the manual Console steps) to fix both. Everything else in this app — including the *unfiltered* Orders/Refunds tabs — is unaffected.
- **`SURFBOARD_WEBHOOK_CERTIFICATE`** is an intentionally-outstanding manual step (generated once in the Surfboard Console, shown only once) — until it's set, payment completion only resolves via the polling reconciliation job (default every 60s), not instantly via webhook.
- **`whyChooseUs`** (storefront "Why Choose Us" bullets) and **`timeZone`** (per-merchant timezone for Dashboard/Analytics figures) are documented in `master-doc.md`'s schema but have no write or read path built yet — every other documented merchant field is fully wired end-to-end.
- **Admin credentials** (`ADMIN_ACCESS_CODE`/`ADMIN_PASSWORD`) are a plain-value development placeholder, explicitly flagged in `master-doc.md` as unsafe for production as-is.
- Analytics' "Top products" chart only has visibility into the current month's most recent 10 orders (a limitation of the underlying summary endpoint, documented in the component's own code comment) — the AI Earnings Assistant's "Best seller" answer, computed over the full requested range server-side, remains the authoritative figure.
