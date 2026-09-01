---
"@every-plugin/nostr": minor
---

Plugin hardening: scoped buzz adapter, auth on mutations, removal of the unsound derived-key path. Breaking changes documented below.

## Adapter lifecycle

`getAdapter("buzz")` previously constructed a fresh BuzzAdapter (own WebSocket connections) on every call and never closed it; the service finalizer created and closed a brand-new instance (a no-op). The adapter is now a single scoped resource: new `BuzzAdapterLive` layer (`nostr-core/adapters/buzz-service.ts`) builds one instance at plugin initialize and closes it on shutdown, exposed as `Option<BuzzAdapter>` so the plugin still initializes in standard-only mode when BUZZ_NSEC is unset.

## Error channels

`getAdapter` now returns an Effect and call sites `yield*` it. A synchronous `throw` inside `Effect.gen` is converted by the runtime into an untyped defect (Die), which bypasses `catchAll`/`flattenError` — "buzz not configured" surfaced as 500 instead of the intended 400; it is now a typed `ORPCError<"BAD_REQUEST">` (400), and the `listChannels` contract route declares `.errors({ BAD_REQUEST })` accordingly.

## Read-path fail-soft, observable

The `tryPromise` catch + `orElseSucceed` double-fallback on `listComments`, `listChannels`, `rawQuery`, `getProfile` and the profile-enrich loop collapses into a single `Effect.catchAll` that logs the swallowed error at WARNING before returning the empty fallback.

## Breaking: auth required on mutations

`createComment` now requires an authenticated session with a connected NEAR account (`requireAuth` + `requireNearAccount`); `publishEvent` requires an authenticated session. Unauthenticated calls receive 401. This closes the open-relay-proxy spam vector flagged when the parity routes landed (PR #6). Reads (`listComments`, `getBinding`, `queryEvents`, `listChannels`, `getProfile`, `listRelays`, `ping`) remain open. The first-party UI is unaffected (cookie-based session, publish already required a NEAR sign-in).

## Breaking: getPublicKey route removed

`GET /nostr/keys` and the underlying `key-derivation.ts` are removed. The derivation hashed a guessable seed — `sha256(accountId + userId)` — so anyone could reconstruct any account's derived Nostr secret key offline (impersonation). The route was unused by the first-party UI; the identity mechanism is the browser-generated key linked via the binding challenge flow (challenge → verify → on-chain FastNear KV write). Consumers of this route must generate keys client-side instead.

## Dead code removed

`nostr-core/core.ts` + `core-service.ts` (unwired since the StandardAdapterService consolidation) and `nostr-core/signers/` (server-side signer class; signing belongs to the client). The `NostrSubscription` type moved to `nostr-core/types.ts`.

## Test suite

40 tests: +4 (comment-service: scoped adapter stability, buzz-unconfigured 400, fail-soft empty on relay failure), −9 (key-derivation removed with its module).
