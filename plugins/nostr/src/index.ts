import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import type { DecoratedMiddleware } from "every-plugin/orpc";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import type { AuthContext } from "./lib/auth";
import { ContextSchema, runEffect } from "./lib/context";
import { NostrConfigLive, resolveNostrConfig } from "./lib/nostr-config";
import type { PluginsClient } from "./lib/plugins-client.gen";
import { NearNostrLive, NearNostrService } from "./near-nostr";
import {
  NostrCoreLive,
  NostrCoreService,
  StandardAdapterLive,
  StandardAdapterService,
} from "./nostr-core";
import { BindingsService } from "./services/bindings";
import { deriveNostrPubkey, deriveNostrSecretKey } from "./services/key-derivation";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({
    relays: z
      .array(z.string())
      .default(["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"])
      .describe("Default Nostr relay URLs"),
    clientName: z
      .string()
      .default("nostr.nearbuilders.org")
      .describe("Client identifier tag attached to each published event"),
  }),

  secrets: z.object({
    NOSTR_DATABASE_URL: z
      .string()
      .default("pglite:.bos/nostr/:memory:")
      .describe("Database connection string for Nostr binding storage"),
  }),

  context: ContextSchema,

  contract,

  initialize: (config, _plugins, tools) =>
    Effect.gen(function* () {
      const databaseLayer = DatabaseLive(config.secrets.NOSTR_DATABASE_URL);
      const configLayer = NostrConfigLive(resolveNostrConfig(config.variables));

      const core = yield* tools.buildService(
        NostrCoreService,
        NostrCoreLive.pipe(Layer.provide(configLayer)),
      );

      const adapter = yield* tools.buildService(
        StandardAdapterService,
        StandardAdapterLive.pipe(Layer.provide(configLayer)),
      );

      const bindings = yield* tools.buildService(
        BindingsService,
        BindingsService.Live.pipe(Layer.provide(databaseLayer)),
      );

      const nearNostr = yield* tools.buildService(
        NearNostrService,
        NearNostrLive.pipe(
          Layer.provide(Layer.succeed(NostrCoreService, core)),
          Layer.provide(Layer.succeed(StandardAdapterService, adapter)),
          Layer.provide(configLayer),
        ),
      );

      yield* Effect.logInfo("[Nostr] Services Initialized");

      return { core, adapter, bindings, nearNostr };
    }),

  shutdown: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Shutdown");
    }),

  createRouter: (services, builder) => {
    const { nearNostr, bindings, adapter } = services;

    const requireNearAccount = builder.middleware(
      async ({ context, next }: { context: AuthContext; next: any }) => {
        const nearAccountId = context.near?.primaryAccountId;
        if (!nearAccountId) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "NEAR account required. Connect a NEAR wallet first.",
          });
        }
        return next({ context: { nearAccountId } });
      },
    ) as DecoratedMiddleware<AuthContext, { nearAccountId: string }, any, any, any, any>;

    return {
      getPublicKey: builder.getPublicKey
        .use(requireNearAccount)
        .handler(async ({ context: ctx }) => {
          const seed = new TextEncoder().encode(ctx.nearAccountId + (ctx.userId ?? ""));
          const pubkey = deriveNostrPubkey(ctx.nearAccountId, seed);
          const binding = await runEffect(bindings.getBinding(ctx.nearAccountId));
          return { pubkey, hasBinding: binding !== null };
        }),

      listRelays: builder.listRelays.handler(async () => ({
        relays: nearNostr.config.relays,
      })),

      getProfile: builder.getProfile.handler(async ({ input }) => {
        const profile = await adapter.getProfile(input.pubkey);
        if (!profile) {
          throw new ORPCError("NOT_FOUND", { message: "Profile not found" });
        }
        return profile;
      }),

      getIdentity: builder.getIdentity.handler(async ({ input }) => {
        const identity = await nearNostr.getIdentity(input.nearAccountId);
        return identity;
      }),

      publishComment: builder.publishComment
        .use(requireNearAccount)
        .handler(async ({ input, context: ctx }) => {
          const seed = new TextEncoder().encode(ctx.nearAccountId + (ctx.userId ?? ""));
          const secretKey = deriveNostrSecretKey(ctx.nearAccountId, seed);

          const { event, statuses: statusMap } = await nearNostr.createComment({
            target: input.target,
            content: input.content,
            nearAccountId: ctx.nearAccountId,
            nostrSecretKey: secretKey,
            parentEventId: input.parentEventId,
            relays: input.relays,
            adapterType: input.adapterType,
          });

          return { event, statuses: Object.fromEntries(statusMap) };
        }),

      listComments: builder.listComments.handler(async ({ input }) => {
        const comments = await nearNostr.listComments({
          target: input.target,
          limit: input.limit,
          since: input.since,
          until: input.until,
          relays: input.relays,
          adapterType: input.adapterType,
          requireBound: input.requireBound,
        });

        const enriched = await nearNostr.enrichComments(comments);
        return enriched;
      }),

      createBinding: builder.createBinding
        .use(requireNearAccount)
        .handler(async ({ input, context: ctx }) => {
          return await runEffect(
            bindings.createBinding({
              nearAccountId: ctx.nearAccountId,
              nostrPubkey: input.nostrPubkey,
              relay: input.relay,
            }),
          );
        }),

      deleteBinding: builder.deleteBinding
        .use(requireNearAccount)
        .handler(async ({ context: ctx }) => {
          await runEffect(bindings.deleteBinding(ctx.nearAccountId));
          return { success: true as const };
        }),

      getBinding: builder.getBinding.handler(async ({ input }) => {
        return await runEffect(bindings.getBinding(input.nearAccountId));
      }),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),
    };
  },
});
