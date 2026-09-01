import "dotenv/config";
import type { PluginConfigInput } from "every-plugin";
import packageJson from "./package.json" with { type: "json" };
import type Plugin from "./src/index";

export default {
  pluginId: packageJson.name,
  port: Number(process.env.PORT) || 3015,
  config: {
    variables: {
      relays: ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"],
      clientName: "nostr.nearbuilders.org",
      STANDARD_RELAYS: "wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net",
      BUZZ_RELAYS: "wss://nearbuilders.communities.buzz.xyz",
      BUZZ_NSEC: process.env.BUZZ_NSEC || "",
      KV_API_URL: "https://kv.main.fastnear.com",
      BINDING_CONTRACT: "contextual.near",
      CHALLENGE_EXPIRY_SECONDS: 300,
    },
    secrets: {},
  } satisfies PluginConfigInput<typeof Plugin>,
};
