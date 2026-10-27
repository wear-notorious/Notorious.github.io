# PayPal Sandbox integration review

Status: design and diagnostics only. Do not deploy, merge, enable checkout, approve, or capture a payment.

## Real Sandbox diagnostics — 26 October 2026

- OAuth token endpoint returned HTTP 200.
- Server-side creation of an unapproved Sandbox order returned HTTP 201, status CREATED. No payer approval or capture was requested.
- Repeating creation sequentially with the same PayPal-Request-Id returned HTTP 200 and the same order ID. GET returned HTTP 200 with CREATED, custom reference, amount and payee merchant ID present.
- A fabricated capture lookup returned HTTP 404. The in-memory validator rejected the unpaid order.
- Two simultaneous creation requests with the same PayPal-Request-Id both returned HTTP 201 but returned inconsistent order IDs, and a later retry returned HTTP 200. This test FAILED the single-order requirement. Do not rely on PayPal idempotency alone for simultaneous creates; serialize locally before calling PayPal.
- No Sandbox payment was approved or captured. No real funds were used.
- Existing in-memory validator tests do not establish real COMPLETED capture response compatibility, actual doPost transaction safety, or concurrent Google Sheets behavior.

## Proposed server-controlled protocol (not implemented)

A trusted server with a transactional durable store is required as the browser-facing API. Keep the existing Apps Script web app owner-only; a public browser cannot reliably call it under that access setting. The server must authenticate/authorize its connection to the private Sheets integration, and must not expose the PayPal secret.

1. The server accepts a bounded cart and delivery data, validates against an authoritative server-controlled product catalogue and computes integer minor units and the exchange quote. Generate an unpredictable order ID and store an immutable order snapshot, a request key and status PREPARING atomically. A unique constraint binds each key to one payload hash; a changed payload with the same key is a conflict.
2. Serialize creation per order in durable storage, record CREATE_IN_PROGRESS before calling PayPal, and use a stable PayPal-Request-Id. Persist the PayPal order ID and state AWAITING_APPROVAL before returning the ID to the browser. If the network response is uncertain, reconcile against PayPal before retrying; never blindly create another order. The simultaneous-create experiment above makes this particularly important.
3. The buyer approves in PayPal Sandbox. The browser requests capture by reference to the server-side order, not by presenting a client-calculated amount. Authenticate the order session and serialize capture. Record CAPTURE_IN_PROGRESS with a stable capture idempotency key before the API call.
4. On any uncertain capture response, report PENDING and reconcile; never ask the buyer to pay again. Verify the PayPal order and capture server-side, including status, order/capture relationship, merchant, reference, currency and amount against the immutable snapshot. An actual completed Sandbox capture response must be tested before accepting this implementation.
5. Atomically enforce unique order ID, PayPal order ID and capture ID in the durable store. Persist the verified payment before dispatching a retryable Sheets write. A background worker writes the order to the TEST Sheet under a script lock, checks all three identifiers, flushes, reads back the row and records the result. Repeat deliveries must return the same result only when the immutable payload matches; conflicts are errors. A timeout is unknown, not proof of failure.
6. The checkout polls an authenticated same-origin status endpoint. Show confirmed success only after verified payment and a confirmed matching Sheets write; otherwise show pending/support with a safe reference. Reconcile failed writes, webhook duplicates, refunds and delayed responses. Keep customer data out of JSONP and URL query strings.

## Required validation

- Independent security review of the design and implementation, credentials and access boundaries.
- Unit and integration tests for prices, malformed payloads, mismatch, pending, refund, errors, key conflicts, retry and recovery after a timeout.
- Simultaneous submissions against the actual backend and test Sheet, including interruption before/after external capture and Sheets write; prove exactly one logical order and one recorded capture.
- Sandbox payer approval and capture using test accounts only, if separately authorized and safely available. Validate real response fields, merchant identity and reconciliation.
- Reliable browser-to-server response and private Sheets access, plus deployment authorization. The current owner-only Apps Script deployment cannot serve as a public checkout API.

Current checkout preview remains deliberately disabled; production is untouched. Fixed exchange rate and customer-facing wording require review before any live use.
