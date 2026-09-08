---
"@every-plugin/nostr": minor
---

Add general signed-event subscriptions with bounded reconnect/replay and cleanup.
Make raw queries report relay failures and result limits, support 1,000-event scans,
and align reported and effective relay configuration. Raw publishing accepts verified
signed events without a user session; raw destinations must be configured relays.
Keep comment and binding authentication and add runtime, HTTP, and bundle coverage.
