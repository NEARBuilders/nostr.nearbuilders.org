---
"@every-plugin/nostr": patch
---

Use the runtime's built-in `WebSocket` for relay connections, falling back to `ws` only when
none exists. In production the plugin runs on Bun, where the bundled `ws` library fails every
handshake: Bun's `https` client reports the `101 Switching Protocols` reply as a `'response'`
event instead of `'upgrade'`, so `ws` aborts with `Unexpected server response: 101`. Every relay
connection therefore failed and surfaced as `RELAY_UNAVAILABLE` ("Could not connect to relay").
