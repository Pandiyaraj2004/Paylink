# Firestore composite indexes — three required, none deployed yet

Three composite indexes are checked into `backend/firestore.indexes.json` but **not yet deployed** to this Firebase project. Live-verified during this pass: hitting either of the two `orders` endpoints below against the real project returns a raw `500 INTERNAL_SERVER_ERROR` today (Firestore's `FAILED_PRECONDITION` isn't caught gracefully here, unlike the reconciliation job below) — deploying the indexes (Option A/B) is required before these two features work.

### 1. Payment reconciliation (collection-group)

`jobs/paymentReconciliation.job.js` polls for stuck payments with a collection-group query across every merchant's `orders` subcollection:

```js
db.collectionGroup('orders')
  .where('payment.status', '==', 'initiated')
  .where('createdAt', '<=', cutoff)
```

**Current behavior without this index:** the app runs fine either way — this one degrades gracefully. Each poll tick (default every 60s, `PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS`) catches the `FAILED_PRECONDITION` error, logs it, and retries on the next tick. No orders are lost; they just won't be auto-reconciled by polling until the index exists.

### 2. `GET /api/merchants/:id/orders?status=...` (collection-scoped)

`order.repository.js`'s `listOrders` — the Orders page's status filter:
```js
merchants/{id}/orders.where('status', '==', x).orderBy('createdAt', 'desc')
```

### 3. `GET /api/merchants/:id/orders?customer=...` (collection-scoped)

Same function — the Customers page's "→ Orders filtered by that customer" nav (master-doc.md Section 14.9):
```js
merchants/{id}/orders.where('customerRef', '==', x).orderBy('createdAt', 'desc')
```

**Current behavior without indexes 2/3:** unlike the reconciliation job, this returns a hard `500` (no try/catch around the `FAILED_PRECONDITION` here) — the frontend's existing error state ("Could not load your orders right now" + Try again) means it's not a crash, but the filter genuinely doesn't work until deployed. Filtering with **no** `status`/`customer` param (the default, unfiltered Orders/Refunds tabs) is unaffected — that query has no equality filter at all, just `orderBy`, which needs no composite index.

## Option A — deploy via Firebase CLI (recommended, one-time)

Run from the **repo root** (`firebase.json`/`.firebaserc` now live there, alongside the Hosting config — not inside `backend/` anymore):

```bash
npm install -g firebase-tools   # or use `npx firebase-tools` for every command below
firebase login
firebase deploy --only firestore:indexes
```

`--project paylink-b3f30` is no longer needed on each call — `.firebaserc` at the repo root already sets it as the default project. This reads `backend/firestore.indexes.json` (referenced by the root `firebase.json`) and creates all three indexes in one shot. Index builds take a few minutes on an empty/small collection.

## Option B — create manually in the Firebase Console

For index 1 (reconciliation): start the backend and let a poll tick fail once (or check existing logs) — the error Firestore returns includes a direct link that pre-fills the index creation form. Look for a line like:
```
FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...
```
For indexes 2/3: call `GET /api/merchants/:id/orders?status=paid` or `?customer=<any value>` once and check the 500's underlying error the same way.

Then, in each case, open that link (or go to Firebase Console → your project → Firestore Database → Indexes → Composite → Add Index manually) and confirm the fields match one of the three entries in `backend/firestore.indexes.json`:
| # | Collection group | Query scope | Fields |
|---|---|---|---|
| 1 | `orders` | Collection group | `payment.status` (Asc), `createdAt` (Asc) |
| 2 | `orders` | Collection | `status` (Asc), `createdAt` (Desc) |
| 3 | `orders` | Collection | `customerRef` (Asc), `createdAt` (Desc) |

Save and wait for each index's status to show "Enabled" (usually a few minutes).

## Verifying it worked

- Index 1: watch the backend logs — a successful poll tick with the index in place will no longer show the `FAILED_PRECONDITION` warning.
- Indexes 2/3: `GET /api/merchants/:id/orders?status=paid` and `?customer=<a real customerRef>` should both return `200` with a real (possibly empty) `items` array instead of `500`.
