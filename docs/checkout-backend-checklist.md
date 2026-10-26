# NOTORIOUS™ — Checkout and payment hardening (implementation handoff)

Status: **frontend review branch only — NOT production-ready for merge**.

## Confirmed findings in the existing storefront

- `checkout.html` posts orders to a deployed Google Apps Script web app using `fetch(..., { mode: "no-cors" })`. The browser receives an **opaque response**: success of the fetch does not prove the order was accepted, validated, or written to the Products/Orders spreadsheet.
- The checkout displays most prices from browser-controlled cart or query data. The backend **must** recalculate items from the authoritative Products sheet. The client-side `CATALOG` whitelist (currently only ASAP Tee) is not a security boundary.
- The PayPal SDK currently creates and captures orders in the browser, where the amount is calculated from browser data and a fixed MAD→USD multiplier. Client-side validation of the capture is helpful for error handling but **does not** establish a trustworthy paid order.
- The old `success.html` always claimed "ORDER CONFIRMED". The review branch now describes the status as **pending**, and preserves a non-PII reference to investigate payment or order-delivery ambiguity.

## Minimum safe backend contract before deploying payment-verification changes

**There is no Apps Script backend source in this repository.** Do not replace the deployed Google Apps Script without first reviewing its current code and the connected Google Sheet. Coordinate these changes with whoever owns that deployment.

1. **Authoritative products/prices.** Fetch product identifiers, active status, size availability, MAD unit prices, and delivery charges from the trusted Products sheet/server, never `price`, `claimedTotal`, or any browser-supplied fields.
2. **Create COD order.** Provide an HTTPS endpoint such as `POST /api/orders/cod` that validates buyer fields and items, records each order once, and returns readable JSON: `{ "ok": true, "orderId": "...", "status": "received" }`. Apply an idempotency constraint on the order ID and rate limits against spam; never silently accept out-of-stock/unavailable products.
3. **CORS/readable confirmation.** Serve the API behind an endpoint that permits the GitHub Pages site origin and handles preflight correctly, then change the frontend to `mode: "cors"` and *require* a positive application-level response. Apps Script `no-cors` does **not** provide that guarantee. A small same-origin/proxy backend (e.g. Cloud Run or Cloudflare Worker with properly secured upstream access) can be used; test it end-to-end before switching URLs.
4. **PayPal create/capture on server.** Use an authenticated backend with secret credentials in server-side environment variables/properties, never in public HTML/GitHub. Server creates a PayPal order from authoritative product prices and a documented fixed/quoted currency conversion, then captures the **approved** PayPal order server-side. Server verifies `COMPLETED` capture status, amount, currency, payee/merchant, purchase/order mapping, and uniquely-used PayPal transaction ID **before** marking an order paid. Use PayPal webhook verification for reconciliation and asynchronous updates. Return a human-readable error for capture uncertainty that never asks customers to pay twice.
5. **Idempotency / recovery.** Persist unique checkout order IDs and unique PayPal captures in the spreadsheet/database with locking/transactions appropriate to the backend; an HTTP retry, refresh, webhook retry, or duplicated request must not create a second order or second charge. Support looking up status by a **private unguessable token** (not only an order ID), or provide customer support lookup.
6. **Secure personal data.** Limit contact details in API logs, protect the spreadsheet and private credentials, restrict backend operations, and never transmit buyer PII via query parameters or JSONP. Don't store PII in browser localStorage.
7. **Accurate user copy.** Once `ok: true` is verified, show an explicit *order received* status for COD. Only show *payment confirmed* once PayPal verification succeeds. A successful HTTP request alone is insufficient.

## Test in a sandbox / test environment before merging

- A normal single-product COD request and a multi-item/cart COD request produce one correct spreadsheet order each.
- Changed price/total/size/quantity/browser query parameters cannot change the payable server amount or bypass available sizes.
- Repeating the same order request does not add a second order.
- A forced Apps Script/proxy failure shows *not verified/pending*, not *confirmed*, and retains an order reference.
- PayPal Sandbox: success, decline, cancellation, interrupted network **after capture**, wrong currency, tampered amount, duplicate capture, and delayed webhook are handled safely.
- Verify the selected PayPal seller account can accept payments in the billing currency and that the stated conversion accurately matches the charged amount.
- Verify the success and contact pages on mobile, including access to the PayPal transaction reference and no PII in query strings.
- Confirm end-to-end purchase flow on the deployed **test** URL before changing live checkout.

## What this review branch does — and does not — fix

It keeps the existing visual design and order integration, adds clearer pending copy, safer client-side PayPal result handling, and non-PII reference retention. It **does not** replace the deployed Apps Script, secure its spreadsheets, or verify captures against the PayPal API. These are required to genuinely secure payments. Do **not** describe the branch as a complete payment-security solution.
