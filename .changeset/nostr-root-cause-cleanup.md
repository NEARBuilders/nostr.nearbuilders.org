---
"@every-plugin/nostr": patch
---

Root-cause cleanup of the nostr plugin (audit-driven; no behaviour changes in the public wire contract unless called out below).

## Type unification

`plugins/nostr/src/nostr-core/types.ts` now re-exports `Event` and `Filter` from `nostr-tools/core` and `nostr-tools/filter` as `NostrEvent` / `NostrFilter`. Since nostr-tools' `[verifiedSymbol]` brand is optional, the types are mutually assignable, which kills 20+ `as any` / `as unknown as NostrEvent` casts across `nostr-core/{standard,buzz,core}.ts` and `services/nostr.ts`. `pool.publish` accepts `Event` (not `VerifiedEvent`); the only place a real guard was needed is `publishSigned`, where a real `verifyEvent` check now runs before the publish — replacing an `as any` and incidentally closing a gap where `createComment` was publishing unverified signatures.

## Wire types via `z.infer`

New `plugins/nostr/src/lib/schemas.ts` defines `ProfileSchema`, `CommentProfileSchema`, `NostrCommentSchema`, `RelayStatusSchema`, `PublishResultSchema`, `ChannelInfoSchema`. Contract (`contract.ts`) and services (`binding.ts`, `nostr.ts`, `standard.ts`) both consume them, eliminating the hand-maintained parallel interface that could drift. Comment profile is intentionally a separate schema from the standalone profile (kind-1 notes don't carry their own pubkey; the `getProfile` endpoint shape does).

Adapter-level `PublishResult` (Map-shaped) renamed to `AdapterPublishResult` to stop colliding with the service-level (array-shaped) one.

## Shared FastNear KV client

New `plugins/nostr/src/lib/fastnear-kv.ts` owns the FastNear KV read path. `BindingService.readKv` and `NostrCommentService.verifyKvAccount` both use it. The hardcoded `kv.main.fastnear.com` + `contextual.near` in `verifyKvAccount` (silently ignoring `KV_API_URL` / `BINDING_CONTRACT`) and the GET-vs-POST split are gone.

## Configuration hygiene

- `BUZZ_NSEC` moved from `variables` to `secrets` (`bos.config.json` `plugins.nostr.secrets: ["BUZZ_NSEC"]`, `plugin.dev.ts`). Malformed non-empty `BUZZ_NSEC` now fails plugin initialize loudly instead of silently disabling buzz.
- Dead `nearRpc` field removed (was hardcoded, never read). `#11` SIWN prototype will add a real `NEAR_RPC` variable when it lands.
- Default relay list lives in one place (the Zod schema default). `StandardAdapter` constructor takes its relays as a required argument.
- `nostr-core/config.ts`'s `NostrVariablesSchema` is exported and consumed via `z.infer`.

## Error channels and handler simplification

`NostrCommentService` methods that fail with adapter-not-configured now fail `ORPCError<"BAD_REQUEST">` in the Effect error channel (matching `BindingService.verifyChallenge`). `hasAdapter` is removed from the service shape. The 6 copies of try/catch + `errors.BAD_REQUEST` fallback + `hasAdapter` pre-check in `index.ts` handlers all collapse — every handler is now a one-liner.

**Behaviour change:** unexpected (non-`ORPCError`) failures that previously became 400 become `INTERNAL_SERVER_ERROR` (500) via `runEffect`'s `flattenError` fallback. Genuinely-expected failures (bad sigs, bad challenges, missing adapters, bad inputs) still get 400 because the services fail with `ORPCError` and `runEffect` rethrows.

## Adapter lifecycle

- `StandardAdapterLive` is wired into `NostrCommentServiceLive` via `Layer.provide(StandardAdapterLive)`. One `SimplePool` per plugin scope instead of two (the dead `StandardAdapterService` build in `initialize` and the freshly-constructed `StandardAdapter` inside the comment service both went away).
- The `__close` `Object.assign(svc, { __close })` hack is replaced with `Effect.addFinalizer`. `BuzzAdapter` is constructed only when buzz is configured; finalizer closes it.
- `BuzzAdapter.publishSigned` now awaits the relay's `OK` response keyed by event id (was fire-and-forget after `#send`). `OK` handler in `#handle` checks the pending-publishes map first and resolves with `msg[2] === true`. Timeout defaults to `queryTimeoutMs`; `close()` clears pending timers.
- `BuzzAdapter.close()` state-key bug fixed: was `states.set("disconnected", "disconnected")` (literal key, ignored); now `states.set(relay, "disconnected")` per connection.

## Layer composition

`NostrCommentService` now reads `StandardAdapterService` from the layer graph instead of casting `getAdapter("standard") as StandardAdapter` ×3. Manual `for (i += BATCH)` + inner `Effect.forEach` loops in `requireVerified` and `enrich` collapse into single `Effect.forEach(items, fn, { concurrency: 5 })`.

`initialize` no longer builds the dead `NostrCoreService` (which was only read by the old `listRelays` handler). `listRelays` now reads the resolved `relays` from `resolveNostrConfig` directly. `NostrCoreService` / `NostrCoreLive` exports remain in `nostr-core` (vendored SDK parity) but are not wired by the plugin.

`verifyEvent` (sig check) moves from the `verifyBinding` handler into `BindingService.verifyChallenge`. The service accepts the no-kind event shape and injects `kind: 27235` for verification, keeping the implicit-kind contract out of the wire schema. The `verifyBinding` handler becomes a one-liner.

**Behaviour change:** invalid signatures on `verifyBinding` now fail at the service layer (consistent with the other challenge failures), not at the handler.

## Test cleanup

- New `tests/helpers.ts` exports `CFG`, `TestLayer`, `withBinding`, `expectBadRequest`, `makeBindingEvent`, `stubFetch`, `mockJsonResponse`. The two effect-using test files no longer duplicate these.
- `expectBadRequest` uses `toMatchObject({ code: "BAD_REQUEST" })` instead of `(squashed as ORPCError<string, unknown>).code`.
- `binding-read.test.ts` holds the `vi.fn()` reference directly instead of `(globalThis.fetch as ReturnType<typeof vi.fn>)` ×6.
- `event-verification.test.ts` types `cloneMinus` properly (no `(event as any).id` ×7) and uses it without `as unknown as Parameters<typeof verifyEvent>[0]` casts.
- The leftover scratch block + mid-file `import * as CauseNS` at the bottom of `binding-read.test.ts` is deleted.
- Test count: 38 (was 39; the scratch was a test-of-the-test, not a real assertion).

## Hygiene

- Stray `plugins/nostr/:memory:/` PGlite data directory removed (untracked).
- `plugins/nostr/README.md` rewritten from the unswapped "Template Plugin" scaffold into plugin-specific docs (routes, architecture, configuration, tests).
- `plugins/nostr/LLM.txt` removed (uncustomized every-plugin template guide leftover).
