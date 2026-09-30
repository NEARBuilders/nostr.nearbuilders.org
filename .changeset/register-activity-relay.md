---
"@every-plugin/nostr": patch
---

Add `relay.nearbuilders.org` (activity.nearbuilders.org's own relay, running
`ghcr.io/mattn/nostr-relay`) to the production `STANDARD_RELAYS` allowlist, alongside the
existing defaults (`relay.damus.io`, `nos.lol`, `relay.primal.net`) — purely additive, nothing
existing removed.

Note: this only fixes the allowlist. Whether the deployed plugin can actually reach the new
relay is a separate, currently-open question — production `queryEvents`/`publishEvent` against
the existing default relays have been failing with `RELAY_UNAVAILABLE` in the caller repo
(activity.nearbuilders.org) throughout this cycle. That needs verifying after this deploys, not
assumed fixed by this change alone.
