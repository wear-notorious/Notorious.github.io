# NOTORIOUS — Sandbox payment test checklist

Status: NOT READY TO ACCEPT PAYMENTS. Do not merge or deploy this branch.

## Verified on 26 October 2026

- The Apps Script project is bound to the NOTORIOUS TEST spreadsheet. The existing Sandbox deployment is configured for the owner only.
- A separate copy of the original script was created before changes.
- The script editor now rejects unverified PayPal payments before recording an order, validates identifiers and rejects duplicate order and payment references under a lock.
- PayPal validation checks the order and capture evidence, including status, merchant, custom reference, exact USD amounts, and the capture's order relationship.
- Twelve isolated in-memory checks passed for valid evidence, unpaid order, wrong reference, merchant, amount and currency, multiple captures, refunded capture, wrong relationship, and three duplicate lookup cases. These checks did not call PayPal or write orders or send email.

## Still required before any deployment or payment

- Review and test the revised Apps Script with actual Sandbox API response shapes and separate test data. The existing deployed version has not been updated.
- Test end-to-end acceptance of one Sandbox capture, duplicate submissions and failure/recovery after capture, including concurrent requests. Do not perform real payments.
- Replace client-side price trust and browser-side payment creation/capture with a trusted server-controlled flow.
- Design a reliable authenticated confirmation mechanism. A no-cors fetch cannot prove an order was recorded.
- Keep the checkout and PayPal controls disabled until an isolated test architecture works without changing the existing owner-only access.
- Review currency conversion and reconciliation; the fixed MAD-to-USD rate is not a live quote.
- Obtain the owner's explicit authorization before deployment or public payment access.

The checkout-sandbox.html preview remains intentionally disabled. No secrets belong in this repository.
