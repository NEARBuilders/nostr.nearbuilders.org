# Nostr — Findings & Next Steps

**Date:** 28 Aug 2026
**Context:** this repo (`nostr.nearbuilders.org`) — comments/identity/Activity work
**Related:** `docs/prd-nostr-threads.md`, `docs/roadmap-nostr-feed.md`, `docs/scope-nostr-sep-2026.md`

## 1. Where we are (shipped)

- **Phase 0** — single-level threaded comments as `<NostrComments>` (done).
- **Phase 1** — multi-level threads: recursive `CommentItem`, collapse/expand, reply counts, reply-to-reply (done).
- **N1** — NIP-10 `root`+`reply` tags fixed; `["p","_near:…"]` removed (client + plugin); `buildCommentTags` extracted + unit-tested. 9 tests green, typecheck + biome clean.

## 2. The problem found (why identity is next)

Authors are **not attributable**: the `near_account` tag is self-asserted. The Nostr signature authenticates the *pubkey*, not the NEAR account.

Proof: published an event signed by a throwaway key (no wallet, no session) labeled `jemartel.near` — Damus + Primal accepted it.

Language: **attributable** (goal) vs **impersonation** (attack). Binding makes attribution real; one npub per NEAR account.

## 3. New findings — Jemartel's existing work

Two PRs, one feature:

| PR | Repo | Contains |
|---|---|---|
| #162 | nearbuilders.org | Full feature: `NostrLink` (binding UI), `NostrFeed` + `PubkeyBadge` (verified vs claimed author = our N3), `nostr-bindings` + `nostr-comments` plugins, kind 1111, **wallet signing via near-connect** |
| #6 | this repo | Plugin half only: `BindingService` (challenge/verify/prepare + FastNear KV), `NostrCommentService` (adapters + `requireBound`/`requireVerified`), `/v1/*` routes, kind 1111, legacy routes deprecated. **No `ui/` changes** |

Relationship: #6 is the plugin-side port of #162. End state (Elliot + Jemartel): this repo owns the canonical plugins; nearbuilders.org remote-loads them.

## 4. Reframe

N2 and N3 are **mostly already built** by Jemartel, split across #6 (plugin) and #162 (UI). The work shifts from **"build binding"** to **"consolidate/port"**:

- N2 plugin half → done (merge #6).
- N2 client half → in #162 (`NostrLink` + challenge → sign → wallet tx). Not ported here yet.
- N3 → in #162 (`PubkeyBadge`). Not ported here yet.
- **Kind 1111** → already done in both PRs. Our earlier "stay kind 1" decision is obsolete.

## 5. Decisions made

- **Identity:** bind the held (random) key. One npub per NEAR account.
- **Binding store:** FastNear KV (`contextual.near`, key `nostr/<account>`).
- **Tags:** NIP-10 `root`+`reply`; `p` tags = hex pubkeys only (no `_near:`).

## 6. Open questions (blocking)

1. **Wallet signing** — `auth.near` (better-near-auth) for the `__fastdata_kv` tx, or add `@hot-labs/near-connect`? → @Elliot
2. **Kind 1111** — adopt as locked direction (already in both PRs, Elliot reviewed)? → team
3. **Merge strategy** — merge #6 as-is, then port #162 UI as our own PR? → team

## 7. Next steps (revised order)

1. Merge #6 (plugin parity).
2. Port #162 client UI — `NostrLink`, `PubkeyBadge`, kind-1111 composer — into `ui/`, following Elliot's review (infer types from `apiClient`, no hand-written types, no relay-proxy/mcp).
3. Swap near-connect → auth.near for the KV wallet tx.
4. N4 Activity contract (docs-only); N5 one production mount; N6 hygiene.

## 8. Revised tickets

| ID | Title | Status |
|---|---|---|
| N1 | NIP-10 root/reply tags + parent `p` tag | ✅ done |
| N2 | Binding — merge #6 (plugin) + port #162 `NostrLink` (client, auth.near swap) | plugin done in #6; client pending |
| N3 | Verified vs claimed author — port `PubkeyBadge` | pending (in #162) |
| N4 | Activity contract v0 | pending |
| N5 | One production mount | pending |
| N6 | Hygiene | pending |
