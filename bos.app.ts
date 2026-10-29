import { App } from "everything-dev/descriptor";

// Authored app descriptor. The published config is canonicalized to JSON
// from this file; dev-only overrides live in bos.dev.ts (never published).
export default App({
  name: "nostr.nearbuilders.org",
  extends: "bos://dev.everything.near/everything.dev",
  platform: "2.0.0-rc.25",
  account: "nearbuilding.near",
  domain: "nostr.nearbuilders.org",
  title: "Nostr NEAR Builders",
  description: "NEAR-powered identity and decentralized comments on the Nostr protocol.",
  staging: {
    domain: "staging.nostr.nearbuilders.org",
  },
  repository: "https://github.com/NEARBuilders/nostr.nearbuilders.org",
  ci: {
    railway: {
      service: "app",
    },
  },
  ui: {
    path: "ui",
  },
  api: {
    path: "api",
    secrets: ["API_DATABASE_URL", "BETTER_AUTH_SECRET"],
  },
  plugins: {
    nostr: {
      path: "plugins/nostr",
      variables: {
        STANDARD_RELAYS:
          "wss://relay.nearbuilders.org,wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net",
      },
      secrets: ["BUZZ_NSEC"],
    },
  },
});
