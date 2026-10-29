import { Effect, Context as EffectContext, Layer } from "effect";
import { createPlugin } from "every-plugin";
import { z } from "zod";
import { contract } from "./contract";
import { ContextSchema } from "./lib/context";
import type { PluginEntries } from "./lib/plugin-clients";

class ApiServices extends EffectContext.Service<ApiServices, Record<string, never>>()(
  "api/ApiServices",
) {}

export default createPlugin.withPlugins<PluginEntries>()({
  variables: z.object({}),

  secrets: z.object({
    API_DATABASE_URL: z.string().default("pglite:.bos/api/:memory:"),
    BETTER_AUTH_SECRET: z.string().default(""),
  }),

  context: ContextSchema,

  contract,

  initialize: () =>
    Effect.sync(() =>
      Layer.effect(
        ApiServices,
        Effect.acquireRelease(
          Effect.sync(() => {
            console.log("[API] Services Initialized");
            return {};
          }),
          () => Effect.log("[API] Shutdown"),
        ),
      ),
    ),

  createRouter: (builder) => ({
    ping: builder.ping.handler(async () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    })),
  }),
});
