---
"@every-plugin/nostr": patch
---

Add Vitest coverage to close out #3 (the kind-27235 binding primitives shipped via #6 + #8 + #9).

- New `plugins/nostr/vitest.config.ts` (Node env, scoped to `tests/**/*.test.ts`).
- Four new test files under `plugins/nostr/tests/`:
  - `key-derivation.test.ts` — `deriveNostrPubkey` determinism, account isolation, parity with `nostr-tools/getPublicKey`; `deriveNostrSecretKey` shape; hex-input parity.
  - `event-verification.test.ts` — kind-27235 signing & `verifyEvent` regressions. Uses a `cloneMinus` helper that strips the `verifiedSymbol` cache so tamper tests actually exercise the recomputation path.
  - `challenge.test.ts` — `BindingService.createChallenge` shape and TTL; `verifyChallenge` happy path + five rejection paths (no `bind:` prefix, wrong account, expired, NaN expiry, fewer than 4 segments); `prepareBindingWrite` tx-arg shape.
  - `binding-read.test.ts` — `BindingService.getBinding` & `getBindingOutput` against a mocked `fetch`: stringified/object values, empty entries, missing value, 404, 500, malformed JSON, network error, abort, URL shape, plus the camelCase mapping done by `getBindingOutput`.

Tests run via the plugin's existing `vitest run --passWithNoTests` script (39/39 pass locally, no network required).
