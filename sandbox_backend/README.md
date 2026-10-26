# NOTORIOUS Sandbox backend — review candidate

NOT READY FOR DEPLOYMENT OR REAL PAYMENTS. The checkout remains disabled. This is test-only code and binds to loopback; it does not deploy itself. Never put secrets in the repository.

Implemented: server-calculated test catalog prices; SQLite persistence and atomic state transitions; serialized creation/capture by idempotency key/order; sandbox-only PayPal API adapter; capture/order evidence checks; authenticated status API; deterministic Sheets test-tab write and readback; mocked concurrency and failure tests. Capture route is disabled unless explicitly enabled. Tests use fakes and perform no network calls or payments.

Run offline tests: `cd sandbox_backend && python -m unittest -v`.

Important limitations to resolve before any deployment or Sandbox capture:
- No automatic reconciliation for CREATE_UNKNOWN, CAPTURE_UNKNOWN, or process crash in an IN_PROGRESS state. These states deliberately block retries to avoid duplicate external operations. A safe operator recovery procedure must be implemented and tested against actual PayPal results.
- The real Google Sheets adapter is not connected or tested. It requires a dedicated empty `SandboxBackendOrders` tab exclusively owned by this database; never point it at the existing Orders sheet. The SQLite database and tab must be backed up and restored together. The provided environment-token provider does not refresh tokens and is not a production credential mechanism.
- Catalog and exchange rate are explicit test configuration, not synchronized with the user's product sheet. Review conversion and authoritative prices before test checkout.
- PayPal capture response compatibility, payer approval, Sheets concurrency, multi-process crash recovery and end-to-end flows have not been verified. Status CONFIRMED means a write and readback of the test tab; it is not guaranteed against subsequent external edits.
- SQLite and its file locking require one reliable shared persistent local filesystem. Multiple hosts with separate databases are unsafe. Secure HTTPS ingress, rate limiting, authentication lifecycle, CSRF/origin strategy, token entropy/expiry and independent security review are not provided. The loopback API is not ready to expose to a browser or the internet.
- Idempotency and customer tokens must be high-entropy and securely retained by the client. A lost token cannot be recovered here.
- Personal data is stored unencrypted in SQLite and in the TEST sheet. Retention, encryption, access control, operational monitoring and backups must be designed before use.

Required environment variables to instantiate the local API: NOTORIOUS_ENV=TEST, TEST_DB_PATH, TEST_CATALOG_JSON, TEST_MAD_TO_USD_RATE, TEST_PAYPAL_MERCHANT_ID, TEST_PAYPAL_CLIENT_ID, TEST_PAYPAL_SECRET, TEST_SPREADSHEET_ID, TEST_GOOGLE_ACCESS_TOKEN. Do not enable TEST_CAPTURE_ENABLED without explicit authorization. No service is started by tests.
