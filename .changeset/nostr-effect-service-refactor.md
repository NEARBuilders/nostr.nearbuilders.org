---
"@every-plugin/nostr": patch
---

Refactor services to Effect `Context.Tag` pattern (`BindingService`, `NostrCommentService`), align auth middleware with `createAuthMiddleware` factory, and clean up orphans left by [#8](https://github.com/NEARBuilders/nostr.nearbuilders.org/pull/8).

- `binding.ts`: rewrite as `BindingService` service with `Effect.tryPromise` for KV reads, `Effect.fail(ORPCError)` for verification failures, configurable via `NostrConfigTag`
- `nostr.ts`: rewrite as `NostrCommentService` service with `Effect.scoped` + `Effect.acquireRelease` for relay pool lifecycle and `Effect.forEach` for parallel relay publishing
- `nostr-config.ts`: consolidate KV binding, standard relays, Buzz relays, nsec decoding into a single resolved config layer (was spread across constructor args in services)
- nsec decoding now uses `nostr-tools/nip19.decode` (drops the inline bech32 parser)
- `verifyEvent` hoisted to a static top-level import (no longer dynamically imported per-request)
- `index.ts`: hand-rolled `requireAuth` middleware replaced with `createAuthMiddleware(builder).requireAuth`; binding flows now chain `requireAuth → requireNearAccount` so handlers read `context.nearAccountId` directly (typed). UNAUTHORIZED responses now include `data: { hint: "Sign in to continue" }`
- `bos.config.json`: drop empty `NOSTR_DATABASE_URL` secret for the nostr plugin (was orphaned by #8)
- `.env.example`: drop `NOSTR_DATABASE_URL=...` (orphaned by #8)
- `plugins/nostr/rspack.config.js`: drop `DrizzleORMMigrations` plugin load and `pg`/`pglite` webpack externals (dead code after #8)
- `plugins/nostr/src/global.d.ts`: replace the `virtual:drizzle-migrations.sql` ambient module declaration (orphan from #8) with an empty stub

Wire-level change: UNAUTHORIZED errors now include `data: { hint: "Sign in to continue" }`. Public handler shapes unchanged otherwise.

