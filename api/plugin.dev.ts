/**
 * Dev-mode plugin configuration for the local API server.
 *
 */

import type { PluginConfigInput } from "every-plugin";
import packageJson from "./package.json" with { type: "json" };
import type Plugin from "./src/index";

export default {
  pluginId: packageJson.name,
  port: Number(process.env.PORT) || 3001,
  config: {
    variables: {},
    secrets: {},
  } satisfies PluginConfigInput<typeof Plugin>,
};
