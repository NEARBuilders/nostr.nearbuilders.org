---
"ui": patch
---

Fix the SSR deploy build: Zephyr failed to publish the server snapshot with "Could not infer the server entrypoint" because the server build's only entry asset is `remoteEntry.server.js`, which matches none of Zephyr's inferred-entrypoint candidates (`server/index.js`, `index.js`, …). The server config now passes `entrypoint: "remoteEntry.server.js"` to `withZephyr()`, so Zephyr uses the explicit value and verifies it was emitted. `app.ui.ssr` is now populated on deploy (previously `null`).
