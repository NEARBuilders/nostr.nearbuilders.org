# Nostr Feed — Growth Roadmap

Status: Draft for team review
Target: rolling (September 2026 →)

> The near-term (1–14 Sep) plan is frozen in [`scope-nostr-sep-2026.md`](./scope-nostr-sep-2026.md). This document stays the long-horizon growth view; execute the scope first.

This roadmap extends the shipped single-level threads work (`docs/prd-nostr-threads.md`) into a fuller feed. Each phase is independently shippable and sequenced by dependency, not by priority alone.

## Phase 0 — Single-level replies (done)

Replies via a loose `["e", <parent>, "", "reply"]` marker, `buildThreads` one-level grouping, reusable `NostrComments`/`CommentItem` components. Shipped, no backend changes.

## Phase 1 — Multi-level threads

Goal: real nested threads (reply-to-reply), collapsible branches, thread summaries.

**Data model**
- `NearNostrComment` gains `rootId?: string` (thread root) alongside `parentId?: string` (immediate parent) — in both the plugin contract (`plugins/nostr/src/contract.ts`) and client types (`ui/src/lib/nostr/types.ts`).

**Tag convention (NIP-10 proper)**
- Reply to a top-level comment: `["e", <parent>, "", "root"]` + `["e", <parent>, "", "reply"]`.
- Reply to a reply: `["e", <root>, "", "root"]` + `["e", <parent>, "", "reply"]`.
- Changes: client `publishComment` (`ui/src/lib/nostr/relay.ts`) and plugin adapter `#buildTags` (`plugins/nostr/src/nostr-core/adapters/standard.ts`) + read-back in `listComments`.

**Grouping & rendering**
- `buildThreads` returns a tree (recursive `childrenByParent`).
- Recursive `CommentItem` with a depth cap (e.g. 4, then "continue thread"), collapse/expand, and reply counts per node.

**Effort:** medium. First phase to touch both client and plugin.

## Phase 2 — Identity binding (NEAR ↔ Nostr)

Goal: comments are attributable to a real NEAR account, not a random browser key.

- Link flow: challenge → sign kind `27235` → verify → NEAR wallet tx → FastNear KV (`contextual.near`, key `nostr/<account>`).
- Backend `createBindingChallenge` / `verifyBindingEvent` / `buildBindingArgs` and the `bindings` service already exist (`plugins/nostr/src/near-nostr/core.ts`, `services/bindings.ts`); client `ui/src/lib/nostr/binding.ts` exists but is unwired.
- Replace the generated `localStorage` key (`ui/src/lib/nostr/keys.ts`) with the linked identity, or add NIP-07 `ExtensionSigner` support (reference SDK `signers/extension-signer.ts`).
- Add `requireBound` / `requireVerified` filtering to the feed (backend `listComments` already supports it).

**Effort:** large. Highest leverage — makes the rest meaningful.

## Phase 3 — Engagement & polish

- **Profile enrichment** — kind-0 name/avatar resolution (backend `enrichComments` exists; client path doesn't). Cheap, pair with Phase 2.
- **Reactions (kind 7)** — upvotes with `#e` filter; new across the board.
- **Realtime** — `subscribeComments` (backend `subscribe` exists) for live replies instead of manual refresh.

## Phase 4 — Distribution

- Wire `NostrComments` onto real builder/project/scope surfaces (target types already modeled).
- Buzz NIP-29 channels (`BuzzAdapter`, `nearbuilders.communities.buzz.xyz`).
- Agent-readable feed (structured tags, raw query surface via `nostr-core`).

## Cross-cutting gotchas

- **`p` tag `_near:` prefix** is rejected by strict relays (Damus/Primal) — already removed from the client; the reference SDK (`reference/near-nostr-sdk/src/nostr-core/adapters/standard.ts:168`) still has it and needs the same fix if adopted.
- **Relay compatibility** — standard tags (`e`, `p`, `t`, `r`) are relay-filterable; custom tags (`near_target`, `near_account`, `client`) are client-filtered. Keep standard tags valid.
