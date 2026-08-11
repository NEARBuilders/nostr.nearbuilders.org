import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { ContextSchema } from "./lib/context";
import type { PluginsClient } from "./lib/plugins-types.gen";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({}),

  secrets: z.object({}),

  context: ContextSchema,

  contract,

  initialize: (_config, _plugins, _tools) => {
    console.log("[API] Services Initialized");
    return Effect.succeed({});
  },

  shutdown: () => Effect.log("[API] Shutdown"),

  createRouter: (_services, builder) => {
    return {
      ping: builder.ping.handler(async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      })),
    };
  },
});
