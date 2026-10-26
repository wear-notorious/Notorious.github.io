# NOTORIOUS — Sandbox payment test checklist

Status: NOT READY TO ACCEPT PAYMENTS. Do not merge this branch yet.

## Test backend requirements

1. Use a separate Google Apps Script deployment and separate TEST spreadsheet.
2. Keep Sandbox API credentials only in Apps Script Script Properties. Never put a secret in GitHub or browser code.
3. Recompute all line prices using active Products rows; reject unknown products and untrusted price claims.
4. Verify PayPal order and capture using the Sandbox REST API from Apps Script, including COMPLETED status, capture belonging to order, matching custom_id, USD currency, exact expected amount, and Sandbox merchant account.
5. Check duplicate order IDs and capture IDs under a spreadsheet lock before writing.
6. Record a verified payment status only after verification; never trust the browser's paid flag.
7. Do not show a confirmed success screen solely because a no-cors fetch completed. Apps Script ContentService redirects and CORS behavior require a separately designed confirmation mechanism.
8. Keep the public production checkout unchanged until tests are passed.

## Required tests

- COD recorded exactly once in TEST spreadsheet.
- Unknown/inactive product rejected.
- Fake capture ID rejected.
- Valid completed Sandbox capture accepted once.
- Reused capture ID rejected.
- Mismatched amount, currency, merchant, or order ID rejected.
- PayPal completed but order-write failed: user receives a pending/support message, never a prompt to pay twice.

## Current limitations

The isolated checkout-sandbox.html has the public Sandbox client ID, but payment initiation and order submission are deliberately disabled. A verified isolated backend is not deployed yet. This document is a checklist, not evidence of successful end-to-end payment testing.
