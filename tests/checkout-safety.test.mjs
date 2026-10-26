// Run from the repository root: node --test tests/checkout-safety.test.mjs
// These are static regression checks, not live payment or backend tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const checkout = readFileSync(new URL("../checkout.html", import.meta.url), "utf8");
const success = readFileSync(new URL("../success.html", import.meta.url), "utf8");

function inlineScripts(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());
}

test("inline checkout and success JavaScript parses", () => {
  for (const html of [checkout, success]) {
    for (const script of inlineScripts(html)) {
      assert.doesNotThrow(() => new Script(script));
    }
  }
});

test("no opaque Apps Script response is presented as verified", () => {
  assert.match(checkout, /mode:\s*"no-cors"/);
  assert.match(checkout, /response\.type\s*!==\s*"opaque"/);
  assert.match(checkout, /status:\s*"pending"/);
  assert.doesNotMatch(success, /ORDER CONFIRMED|has been received successfully/i);
  assert.match(success, /ORDER PENDING/);
});

test("payment capture mismatch requires manual verification", () => {
  assert.match(checkout, /capture\.status\s*!==\s*"COMPLETED"/);
  assert.match(checkout, /currency_code\s*===\s*"USD"/);
  assert.match(checkout, /Math\.abs\(paidUsd\s*-\s*Number\(totalUsd\)\)/);
  assert.match(checkout, /Do NOT pay again/);
});

test("checkout stores only order reference data in its pending list", () => {
  const start = checkout.indexOf("function savePendingReference(");
  const end = checkout.indexOf("async function submitOrder(", start);
  assert.ok(start > 0 && end > start);
  const segment = checkout.slice(start, end);
  assert.match(segment, /notoriousPendingOrders/);
  assert.doesNotMatch(segment, /fullName|phone:|email:|address:|postalCode:/);
});

test("original checkout structure and styling remain in place", () => {
  for (const token of ['id="checkoutForm"', 'id="codBtn"', 'id="paypalButtonContainer"', ".checkout-grid", ".payment-option"]) {
    assert.ok(checkout.includes(token), token);
  }
});
