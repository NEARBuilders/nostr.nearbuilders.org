        # PRD — Nostr threaded comments (single-level replies)

**Status:** Draft for review
**Target:** this cycle (September 2026)
**Scope doc:** [../NOSTR-FEED.md](../NOSTR-FEED.md)

## Objective

Add optional single-level threaded replies to the Nostr comment feed, delivered as a reusable `NostrComments` component, with no backend changes.

## Background / current state

The backend already models replies via NIP-10 single-marker `e` tags:

| Layer | File | Status |
|---|---|---|
| Contract | `plugins/nostr/src/contract.ts:149` | `publishComment` accepts `parentEventId`; `listComments` returns `parentId` |
| Adapter | `plugins/nostr/src/nostr-core/adapters/standard.ts:161` | emits `["e", parentId, "", "reply"]` |
| Read | `plugins/nostr/src/near-nostr/core.ts:176` | parses `parentId` from `e` + `reply` |
| Client types | `ui/src/lib/nostr/types.ts:43` | `NearNostrComment.parentId` exists |
| Client publish | `ui/src/lib/nostr/relay.ts` | **no `parentEventId` support** (the gap) |
| Client list | `ui/src/lib/nostr/relay.ts:95` | already parses `parentId` |

Reference implementations to align with: `reference/near-nostr-sdk/src/near-nostr/core.ts` (reply via `parentEventId`), `reference/nostr-testbench/src/` (publish/list panels).

## In scope

- Reply publishing from the UI (kind-1 with `e` + `reply` tag).
- Single-level grouping: replies indented under parent.
- Reusable `NostrComments` + `CommentItem` components.
- Configurable orphan-reply policy (`promote` default / `hide`).
- Unit tests for grouping and tag-building.

## Out of scope

- Multi-level nesting (NIP-10 root/reply markers, `rootId` field).
- Identity binding flow (challenge → KV).
- Profile enrichment (`enrichComments`).
- Realtime (`subscribeComments`).
- Reactions (kind 7), DMs, Buzz adapter, NIP-07 extension signer.

## Requirements

### R1 — Reply publishing

As a signed-in user, I can reply to an existing comment so the reply appears under that comment.

**Acceptance:**
- `publishComment` accepts an optional `parentEventId`.
- When set, the signed event includes `["e", <parentId>, "", "reply"]` in its tags.
- Tags align with the reference `#buildTags`: `["t", type]`, `["t", clientName]`, `["p", pubkey]`, `["e", parentId, "", "reply"]`, `["client", clientName]`, `["near_target", "<type>:<id>"]`, `["near_account", account]`.
  - **Note:** the reference's `["p", "_near:<account>"]` namespaced tag is intentionally omitted — strict relays (Damus, Primal) reject it as `unexpected size for fixed-size tag: p`.

### R2 — Thread grouping

As a reader, replies are shown indented under their parent, top-level newest-first, replies oldest-first.

**Acceptance:**
- `buildThreads(comments, { orphans })` returns `{ topLevel, childrenByParent }`.
- `topLevel` = comments with no `parentId`, plus orphaned replies when `orphans === "promote"`.
- `childrenByParent` maps a parent `eventId` to its direct replies.
- `"hide"` filters orphaned replies before rendering.
- `CommentItem` shows the reply count for each comment.

### R3 — Reusable component

As a developer, I can render a threaded feed on any page by passing a `target`.

**Acceptance:**
- `NostrComments` props: `target` (required), `relays?`, `clientName?`, `limit?`, `orphans?` (default `"promote"`).
- `CommentItem` renders a comment with a Reply action, an inline reply form, and indented children.
- The `/nostr` page uses `<NostrComments target={TARGET} />` with no inline comment logic.

## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Nesting depth | Single-level | Existing data model; no schema change |
| Display | Indented inline | Least friction, keeps context visible |
| Orphan policy | `orphans: "promote" \| "hide"`, default `"promote"` | Explicit union, future-proof (`"collapse"`); don't silently drop content |
| Sort | Top-level desc, replies asc | Standard comment UX |
| Reply count | Show reply count on each comment | Lightweight signal of conversation depth |
| clientName | Hardcoded `"nostr.nearbuilders.org"` | Not worth a prop yet |
| Publish path | Client `relay.ts` (browser direct-to-relay) | Matches what works today; plugin unification deferred |
| Component location | `ui/src/components/nostr/` | Co-located with existing comment components |

## Technical breakdown

```
ui/src/lib/nostr/
  relay.ts      # add parentEventId → e+reply tag; align tags with reference
  threads.ts    # NEW: buildThreads(comments, { orphans })
  types.ts      # add OrphanPolicy type (or place in threads.ts)

ui/src/components/nostr/
  comments.tsx      # NEW: NostrComments orchestrator (fetch, group, publish, refresh)
  comment-item.tsx  # NEW: single comment + Reply + inline form + children
  comment-form.tsx  # extend existing form with reply mode (parentEventId)
  comment-list.tsx  # adapt or fold into comments.tsx (threaded rendering)

ui/src/routes/_layout/_authenticated/nostr.tsx
  # replace inline logic with <NostrComments target={TARGET} />
```

### Proposed API shapes

```ts
// ui/src/lib/nostr/threads.ts
export type OrphanPolicy = "promote" | "hide";

export function buildThreads(
  comments: NearNostrComment[],
  opts?: { orphans?: OrphanPolicy },
): { topLevel: NearNostrComment[]; childrenByParent: Map<string, NearNostrComment[]> };

// ui/src/components/nostr/comments.tsx
export function NostrComments(props: {
  target: NearNostrTarget;
  relays?: string[];
  clientName?: string;
  limit?: number;
  orphans?: OrphanPolicy;
}): JSX.Element;
```

## Tasks

1. **Data layer** — add `parentEventId` to `publishComment` in `relay.ts`; emit `e` + `reply` tag; align tags with reference `#buildTags`.
2. **Grouping util** — add `threads.ts` `buildThreads` with `orphans` policy and deterministic sort; unit test.
3. **Components** — add `NostrComments` + `CommentItem`; extend `comment-form.tsx` for reply mode.
4. **Page integration** — swap `/nostr` page to `<NostrComments>`.
5. **Verify** — `bun run test`, `bun typecheck`, `bun lint`; manual E2E: post top-level → reply → reload → confirm nesting and `parentId` round-trip.

## Testing

- Unit: `buildThreads` (top-level vs children, orphan promote/hide, sort order).
- Unit: `publishComment` tag-building (reply emits `e` + `reply`; top-level does not).
- Manual E2E on `/nostr` against public relays.

## Resolved decisions

1. Orphan policy default: `"promote"` (keep `"hide"` as an option).
2. `clientName`: hardcoded `"nostr.nearbuilders.org"` for now — no prop.
3. Reply count: `CommentItem` shows the reply count on each comment.
