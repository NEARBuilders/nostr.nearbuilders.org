# Scope: Nostr threaded comments

Optional threaded replies on the Nostr comment feed — reply to any comment and see the conversation nested inline, in one reusable component that any project, scope, or builder page can drop in.

## What this is

Threads on the Nostr comment feed. Today the feed is a flat list: anyone can post a top-level comment, but there's no way to reply to one. This adds a reply affordance and nests replies under the comment they answer, one level deep.

It is not a chat system and not a new Nostr standard. Replies are ordinary Nostr kind-1 events carrying a standard `e` tag pointing at the parent — so a reply posted here is readable by any Nostr client, and the conversation isn't locked to this app.

## The problem

**The feed is flat and read-mostly.** The comment UI can't reply. The `publishComment` helper on the client has no reply support, even though the backend and the reference SDK already model replies. So conversations can't happen.

**The feed isn't reusable.** All the comment logic is embedded in the `/nostr` test page. The parent integration scope promises comments on builders, projects, scopes, and submissions — but there's no component to drop onto those surfaces.

**Identity is weak.** Comments are signed with a random key stored in the browser, not the linked NEAR ↔ Nostr identity the parent scope calls for. A reply carries a pubkey, but it doesn't reliably point at a real builder.

Threads are the smallest slice that moves all three: they make the feed conversational, force the extraction of a reusable component, and tee up the identity work.

## What we build

Four things. These are the scope.

### 1. Reply

A "Reply" action on every comment opens an inline reply form. Submitting signs a kind-1 event with an `e` + `reply` tag pointing at the parent and publishes it to the same relays. No backend change — the plugin already accepts `parentEventId`.

### 2. Thread

A grouping layer turns the flat event list into threads: comments with no parent are top-level; replies sit indented under their parent. Sorting is deterministic — top-level newest-first, replies oldest-first inside a thread.

### 3. Reuse

Extract `NostrComments` and `CommentItem` components so a page only passes a `target` and gets a working, threaded feed. The `/nostr` page becomes the first consumer.

### 4. Configure

Replies whose parent isn't in the loaded window are a real edge case. One prop controls it: `orphans: "promote"` (default — orphaned replies surface at top level, nothing silently vanishes) or `orphans: "hide"` (strict surfaces that only show bound replies to loaded parents).

## What stays simple

Deliberately not touched this cycle, so threads ship without blocking on bigger work:

- **Identity stays the generated local key.** The challenge → sign → verify → FastNear KV binding flow that links a NEAR account to a stable Nostr pubkey is the next piece, not this one.
- **One level deep.** Arbitrary-depth nesting needs a schema change (root vs parent) and recursive rendering.
- **No realtime.** The feed still refreshes on demand; relay subscriptions come later.
- **No profile enrichment.** Comments show a pubkey prefix until kind-0 name/avatar resolution is added.

## How it works

A reply is just a comment with a parent. The tag model already exists end-to-end:

- Publish: `publishComment({ parentEventId })` emits `["e", "<parentId>", "", "reply"]`.
- Read: `listComments` parses `parentId` from that `e` tag.

So the work is frontend-only: add `parentEventId` to the client publish helper, add a `buildThreads` grouping utility with the orphan policy, and wrap it all in the reusable component.

## What doesn't get built

- Arbitrary-depth threading (NIP-10 root/reply markers, recursive UI)
- DMs or encrypted messaging
- Moderation or reputation systems
- A Buzz competitor or a new Nostr standard
- On-chain storage of messages

## What done looks like

**A reply can be posted from the feed and appears indented under its parent after a reload, on any surface using the shared `NostrComments` component, with no backend changes.**

That single sentence is the whole scope.

## Why now

The plumbing is already there. The plugin's `publishComment` accepts `parentEventId`, the adapter emits the `e` + `reply` tag, `listComments` returns `parentId`, and the client types already carry `parentId`. The reference SDK (`reference/near-nostr-sdk`) and its testbench (`reference/nostr-testbench`) demonstrate the exact tag convention. The gap is a few hundred lines of UI — the lowest-risk, highest-visibility slice of the feed work.

## To discuss with the team

Candidates for this or the next cycle, ranked by leverage:

1. **Identity binding** — link NEAR account ↔ Nostr pubkey (challenge → sign kind 27235 → verify → wallet tx → FastNear KV). Makes threads attributable. Backend `createBindingChallenge` / `verifyBindingEvent` / `bindings` service already exist; the client `binding.ts` helpers are unwired.
2. **Profile enrichment** — kind-0 name/avatar resolution on comments.
3. **Realtime** — relay subscriptions instead of manual refresh.
4. **Reactions (kind 7)** — upvotes on comments.
5. **Multi-level threads** — root + reply markers, recursive rendering.
6. **NIP-07 extension signer** — sign with the user's own extension instead of a generated key.
7. **Buzz channels** — NIP-29 group discussion on `nearbuilders.communities.buzz.xyz`.
8. **Feed on real surfaces** — wire `NostrComments` into actual builder/project/scope pages.
