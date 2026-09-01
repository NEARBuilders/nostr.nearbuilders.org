---
"@every-plugin/nostr": minor
---

Comments UI integration: server-owned near_target convention + createComment tag validation. Behaviour changes called out below.

## near_target convention

Previously the plugin echoed target raw into the near_target tag while the deployed testbench publishes a composite "type:id" key, so each reader sees its own events but not the other. The plugin now composes nearTargetKey(targetType, target) as "type:id" in one helper (nostr-core/types.ts), consumed by:

- standard.ts buildTags near_target value
- standard.ts query and subscribe client-side near_target filter
- buzz.ts buildTags near_target value (channel derivation unchanged)

Callers still pass separate target and targetType inputs to createComment and listComments; the convention is enforced server-side. UI testbench events (already composite) remain visible; plugin-published events become composite too.

## clientName for listComments

listComments was hardcoding "near-nostr-sdk" as the clientName query argument. Now reads cfg.clientName (default nostr.nearbuilders.org), consistent with the t-tag value clients sign.

## createComment validate-before-publish

createComment now rejects (400) signed events whose near_target tag is absent or does not match composite(targetType, target). Previously it would publish the mismatched event and clients would silently never see it back in listComments.

Helper exported as assertCommentTagsMatchRequest for direct unit testing; 7 new tests cover the validator.

## Route renames (procedure keys; HTTP paths unchanged)

The legacy V1 suffix on four procedure keys is dropped now that the legacy DB-backed names it was avoiding collisions with were deleted (PR #8). Renamed:

- `getBindingV1` -> `getBinding`
- `getIdentityV1` -> `getIdentity`
- `listCommentsV1` -> `listComments`
- `getProfileV1` -> `getProfile`

HTTP paths under `/v1/*` stay as-is: the `v1` prefix is honest API versioning, and PR #8 confirmed `nearbuilders.org` UI consumes these paths in production (e.g. `nostr-feed.tsx` hitting `/v1/comments`). External raw-fetch consumers are unaffected; typed oRPC clients that imported these procedures must update the method name.

## Out of scope

The kind assertion is intentionally permissive (any kind preserves existing kind 1 + 1111 compatibility). Buzz channel derivation via resolveChannel keeps hashing the raw target so existing buzz channel ids are unchanged.

UI wiring (ticket 12) lands in a follow-up PR consuming the convention.
