# Scope — Nostr comments, identity, and Activity unblock

**Status:** Draft for team review — 28 Aug 2026
**Window:** 1–14 September 2026 (first two weeks)
**Surfaces:** `localhost:3000/nostr` lab → one production mount
**Depends on:** shipped Phase 0 threads + existing `near-nostr` binding APIs
**Does not depend on:** Elliot (out fishing; review when back)
**Related:** `docs/prd-nostr-threads.md`, `docs/roadmap-nostr-feed.md`, `docs/nostr-findings-and-plan.md`, `NOSTR.md`, `ACTIVITY.md`

> **Update (28 Aug):** PR #6 (this repo, plugin parity) + PR #162 (nearbuilders.org, full client) reframe N2/N3 — see `docs/nostr-findings-and-plan.md`. Most of binding/verified-author already exists in those PRs; the open item is porting #162's UI onto merged #6 with near-connect → auth.near.

---

## 1. Why this window

Phase 0 (single-level threaded comments as `<NostrComments>`) is in the lab and already renders **reply-to-reply**. Phase 1 (multi-level) is further along than the written roadmap:

- NIP-10 `root` + `reply` tags already emitted on nested publish, `rootId` parsed on list.
- Recursive `CommentItem` (collapse, reply counts), `buildThreads` tree.
- The `["p", "_near:<account>"]` tag is already removed (strict relays reject it) — client **and** plugin.

What is not done is the part that makes the rest of the stack real:

- NEAR ↔ Nostr binding is on screen as **not linked**
- Author names are claimed `near_account` tags, not verified identities
- Two different pubkeys already display as the same NEAR account (`buidlguidl.near`)
- Activity is still blocked on "what event do we publish" and "who is the actor"
- Comments still live only on `/nostr`, not on a builder/project page

James's question in Slack — *how does Nostr take Activity to the next level?* — is not answered by deeper threads. It is answered by **attributable comments on real objects**, plus a frozen Activity event contract other work can implement.

This scope is two weeks, not the whole growth roadmap.

---

## 2. Outcome by 14 September

A teammate can:

1. Open `/nostr`, link `account.near` to their Nostr pubkey, and still be linked after reload.
2. Post a top-level comment, a reply, and a reply-to-reply that survive hard refresh, with correct NIP-10 `root` + `reply` tags.
3. See **verified** vs **unverified** authors — old localStorage keys cannot look like a bound account.
4. Read a one-pager that defines the Activity Nostr event (kind, tags, signer) so the Activity starter can proceed without waiting on more comment UI.
5. *(Stretch)* See `<NostrComments>` on one real project page.

If we miss the stretch and hit 1–4, the window succeeded.

---

## 3. Current state (lab, 27–28 Aug)

Observed on `/nostr` testbench, signed in as `buidlguidl.near`:

| Area | State |
|---|---|
| Thread UI | Working. Recursive tree: "hi legionearians" → "testing reply" → "ok!" |
| Reply counts / collapse / inline composer | Working |
| Sort | Top-level newest-first; replies oldest-first |
| Target | `project:test-nostr-page…` |
| NIP-10 tags | `root` + `reply` markers emitted; `rootId` parsed (client + plugin) |
| `p` tags | Hex pubkeys only; `_near:` removed |
| Local key | Stored (`generateSecretKey` — a random key, not NEAR-derived) |
| Binding | **Not linked** |
| Author labels | NEAR names shown for everyone (claimed, not verified) |
| Integrity | Pubkeys `0fbb14924e5d…` and `64881369b43c…` both labeled `buidlguidl.near` |

Remaining NIP-10 gap: a depth-1 reply (reply-to-top-level) emits only the `reply` marker, no `root` marker; replies don't yet mention the parent author via `["p", <parentPubkey>]`. Both are small, day-one refinements (N1), not a rewrite.

Conclusion: the widget is a product. The identity layer is still a prototype.

---

## 4. Product split (locked)

Do not collapse these into one event kind.

| Layer | What it is | Who signs | Kind | Shows up |
|---|---|---|---|---|
| Identity | NEAR account ↔ npub | User + KV binding | Existing challenge flow (kind 27235) + kind 0 later | Identity card, author line |
| Conversation | Speech on a target | User | Kind 1 now (NIP-22 / 1111 later) | `NostrComments` |
| Activity | "Something happened" fact | Project / gateway key | New regular kind — **not 1, not 1111, not 31234** | Feed, profile, leaderboard |

Comments attach *to* an activity item via `NearNostrTarget { type: "activity", id }`.
Activity items are not comments.

`31234` is already NIP-37 Draft Event. ACTIVITY.md must not use it.

---

## 5. In scope (1–14 Sep)

### Week 1 — 1 to 7 Sep — "Make the lab honest"

1. **NIP-10 tag correctness (refinement, not rewrite)** — N1
   Nested publish already emits `root` + `reply`. Close the two gaps: emit `root` marker for depth-1 replies too, and add `["p", <parentPubkey>]` to replies. Extract a pure `buildCommentTags` and unit-test the three cases (top-level, reply-to-root, reply-to-reply) plus "never `_near:` in `p`". Dump live A/B/C event tags for the PR.

2. **Wire binding** — N2
   Assemble the challenge → sign kind 27235 → verify → FastNear KV flow. Identity card goes `not linked` → `linked`. Same pubkey after reload. Bind the **held (random) local key** into **FastNear KV** (`contextual.near`, key `nostr/<account>`). Day-1 spike: confirm `auth.near` (better-near-auth `TransactionBuilder`/relay) can send `contextual.near.__fastdata_kv`; fallback is a direct wallet-sign.

3. **Verified vs claimed authors** — N3
   `nearAccountVerified` only when `getBinding(account).npub === comment.pubkey`. Unverified comments stay visible on `/nostr` but cannot look fully authentic.

### Week 2 — 8 to 14 Sep — "Leave the lab"

4. **Activity Nostr contract v0** (doc + review, not the gateway) — N4
   Kind number, tags, who signs, how comments target an activity id, how bots later consume the same stream.

5. **One production mount** — N5
   `<NostrComments target={one real project}>` on a single project page. Read works logged out. Post policy documented.

6. **Hygiene** — N6
   Tests, typecheck, lint. Short note in `NOSTR.md` / `ACTIVITY.md` pointing at the new contract. Close or re-tag stale Phase 1 "build nested UI" tickets — the UI already nests.

---

## 6. Out of scope (park until after 14 Sep)

Do not start these in this window even if a ticket looks related.

- Multi-level polish (depth cap, "continue thread", animations)
- NIP-22 / kind 1111 migration
- Unifying client `relay.ts` publish onto the plugin
- Realtime `subscribeComments`
- Kind 7 reactions
- Kind 0 profile enrichment pass
- NIP-07 extension signer
- Buzz / NIP-29 channels
- TG/X announcement bots
- Activity HTTP gateway, Redis leaderboards, SSE (contract only)
- Self-hosted relay provisioning
- Mounting comments on every builder / scope / submission page
- City Nodes #10–#15 (separate repo)

Rationale: each of those is a real later phase. None of them fix spoofable authors or unblock Activity.

---

## 7. Decisions already made

Reviewers should treat these as closed unless they object on 28–29 Aug.

| Decision | Choice |
|---|---|
| Nesting UI | Keep current recursive `CommentItem`. No flatten. No depth-cap UI this window. |
| Orphans | `"promote" \| "hide"`, default `"promote"` |
| Sort | Top-level newest first, replies oldest first |
| `clientName` | Hardcoded (`nostr.nearbuilders.org`). No new prop. |
| Publish path | Browser `relay.ts` direct-to-relay. Plugin tags stay aligned, not merged. |
| `p` tags | 32-byte hex only. Never `["_near:account"]`. |
| Identity model | **Bind the held (random) local key.** No deterministic NEAR-derived key, no second key minted. |
| Binding store | **FastNear KV (`contextual.near`), not the plugin Postgres `bindings` table.** Portable across UIs. |
| Author display | NEAR name is verified only via binding. Tag is a claim. |
| `/nostr` post policy | Unbound users may post (lab). |
| Production post policy | Prefer `requireBound` on the Week 2 mount; final call in Week 2 kickoff. |
| Comment kind | Stay on kind 1. Keep `r` / `t` / `near_target` clean for a later 1111 move. |
| Activity kind | New unused regular kind in 1000–9999. Forbidden: 1, 7, 1111, 31234. |
| Production URL | Lab is local `/nostr`. `nostr.nearbuilders.org` 500s — infra, not this scope. |

---

## 8. Work breakdown

### W1.A — NIP-10 publish/list refinement (N1)

**Files:** `ui/src/lib/nostr/relay.ts` (extract `buildCommentTags`), `ui/src/lib/nostr/types.ts`, plugin adapter `#buildTags` + `listComments` parse.

**Do:**
- Emit `root` marker for every reply (`rootId ?? parentId`), including depth-1.
- Emit `["p", <parentPubkey>]` on replies.
- Extract `buildCommentTags` and unit-test the three cases.
- Dump live A/B/C tags into the PR.

**Accept:**
- Three-event dump in the PR.
- Hard reload keeps A → B → C.
- `bun run test` covers tag building.

### W1.B — Binding on the testbench (N2)

**Files:** `ui/src/lib/nostr/binding.ts` (exists, unwired), identity card on `/nostr`, `auth.near` for the KV write.

**Do:**
- Link / unlink on the existing identity card.
- Challenge (`bind:<account>:<expiresAt>:<clientName>`, 5 min) → sign kind 27235 with the held key → `__fastdata_kv` write (`nostr/<account>` = `{ npub, relay, proof, bound_at }`) → `getBinding` read-back.
- Do not mint a second key; bind the key already in localStorage.
- Persist across reload. Explicit errors (expired challenge, wallet reject, KV fail).

**Accept:**
- Card shows `linked` for `account.near` ↔ pubkey; reload stays linked.
- `getBinding(account)` returns that pair.

### W1.C — Verified author chrome (N3)

**Files:** `comment-item.tsx`, list/enrich path, types (`nearAccountVerified?`).

**Do:**
- Resolve `getBinding` for distinct accounts on the current page (cache).
- Verified: account name + mark. Unverified: pubkey prefix + "unverified"/"claimed `<account>`".
- Do not hide unverified comments on `/nostr`.

**Accept:**
- The two historical `buidlguidl.near` pubkeys cannot both look verified.
- Comments posted after a successful link look verified.

### W2.A — Activity contract v0 (N4)

**File:** `docs/activity-nostr-contract.md` (and a pointer from `ACTIVITY.md`).

Must specify: event-family split, chosen kind + why, gateway signs facts / users sign comments, tag list (minimum), comments target `{ type: "activity", id }`, relays = log (Redis/SSE/points stay in the Activity service), open questions.

**Accept:** someone can implement ingest without a design thread.

### W2.B — One production mount (N5)

**Files:** project page route + `NostrComments`.

One real project (not the test target), logged-out read, post policy documented, no extra features.

### W2.C — Hygiene (N6)

`bun run test && bun typecheck && bun lint`; close/retitle tickets; two-paragraph Slack update.

---

## 9. Calendar

```
Fri 28–Sun 31 Aug   Review this scope. Dump A/B/C tags. N1 refinements + tests.
Mon 1–Wed 3 Sep     W1.A finished. Start W1.B: day-1 KV-write spike.
Thu 4–Sun 7 Sep     Finish W1.B + W1.C. Demo on /nostr: linked + verified + nested reload.
Mon 8–Wed 10 Sep    W2.A contract. Decide requireBound for the mount.
Thu 11–Sun 14 Sep   W2.B mount + W2.C hygiene. Team review. Elliot input if back.
```

Elliot is not required for W1. Best use of him in W2: Activity contract review and "is this enough to hook the starter."

---

## 10. Suggested tickets

| ID | Title | Week | Pri |
|---|---|---|---|
| N1 | `fix(nostr): NIP-10 root marker on depth-1 + parent p tag; buildCommentTags tests` | 1 | P0 |
| N2 | `feat(nostr): wire NEAR↔Nostr binding on /nostr identity card (FastNear KV)` | 1 | P0 |
| N3 | `feat(nostr): verified vs claimed near_account on CommentItem` | 1 | P0 |
| N4 | `docs(activity): v0 Nostr event contract (kind, tags, signer)` | 2 | P1 |
| N5 | `feat(nostr): mount NostrComments on one project page` | 2 | P1 |
| N6 | `chore(nostr): tests, ticket hygiene, NOSTR.md / ACTIVITY.md pointers` | 2 | P2 |

Engineering detail for N1–N3 lives in `docs/roadmap-nostr-feed.md`. This scope is the contract with the team.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Depth-1 replies lack a `root` marker | N1 first; emit `rootId ?? parentId` always |
| NEAR→KV write path unknown in better-near-auth | Day-1 spike; fallback to direct wallet-sign, document blocker rather than invent a side store |
| Plugin DB `bindings` vs FastNear KV | KV is the chosen store (portable); the DB service is left dormant, not extended |
| `Clear Key` mints a third persona for the same account | N3 before any Clear Key demo |
| Public relays drop custom tags | Listing already works in lab; no new custom-only filters this window |
| `nostr.nearbuilders.org` stays 500 | Ship against local + preview deploy; infra is a separate ticket |
| Scope creeps into Activity gateway | Contract is docs-only. Implementation is a later scope. |
| Kind 31234 copied from ACTIVITY.md | Explicitly banned in N4 |

---

## 12. How this answers Slack

**James — Activity feed next level**
Not a comment box glued onto a firehose. Attributable actors, comments *on* facts, one tagged stream any UI (nearbuilders, Legion, later bots/agents) can read.

**Jemartel — comments first, feedable anywhere**
Keep `<NostrComments target={…}>` as the unit. Formalize identity so those comments mean something off `/nostr`.

**Zeeshan — comments vs TG/X bots**
This window is comments + identity. Bots consume the Activity contract in N4 later; they do not get a second pipeline.

**Elliot — Activity starter still not hooked**
Unblock with N2 (identity primitive) + N4 (schema). Do not wait on thread polish.

---

## 13. Success metrics (window, not year)

Must have:
- Binding happy path on `/nostr` (link, reload, publish)
- Nested comment tag round-trip (root + reply markers)
- Zero verified-name collisions for unbound keys
- Activity contract merged and pointed from `ACTIVITY.md`

Nice:
- One project page with the widget
- Board tickets closed / retitled

Not measured this window: DAU, relay fan-out, agent summaries, leaderboard points.

---

## 14. After 14 September (not committed)

Only if this window is green:
- `requireBound` on all production mounts
- Activity gateway implementing N4
- `subscribeComments` on mounted surfaces
- Kind 0 names/avatars
- Kind 7 reactions
- NIP-22 evaluation for object comments
- More surfaces (builder, scope, submission)
- Self-hosted relay for Activity reliability

---

## 15. Ask of reviewers tomorrow

1. Confirm the locked decisions in §7, especially the identity model (bind held key) and binding store (FastNear KV).
2. Confirm Activity stays **docs-only** this window.
3. Assign N1–N3. N4 can be drafted in parallel.
4. Do not add City Nodes, Buzz, or bots into these two weeks.
