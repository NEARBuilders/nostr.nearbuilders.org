import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import type { DecoratedMiddleware } from "every-plugin/orpc";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { verifyEvent } from "nostr-tools/pure";

import { contract } from "./contract";
import type { AuthContext } from "./lib/auth";
import { createAuthMiddleware } from "./lib/auth";
import { ContextSchema, runEffect } from "./lib/context";
import { NostrConfigLive, resolveNostrConfig } from "./lib/nostr-config";
import type { PluginsClient } from "./lib/plugins-client.gen";
import {
  NostrCoreLive,
  NostrCoreService,
  StandardAdapterLive,
  StandardAdapterService,
} from "./nostr-core";
import { BindingService, BindingServiceLive } from "./services/binding";
import { deriveNostrPubkey } from "./services/key-derivation";
import { NostrCommentService, NostrCommentServiceLive } from "./services/nostr";

type BindingServiceInstance = typeof BindingService.Service;
type NostrCommentServiceInstance = typeof NostrCommentService.Service;

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
    STANDARD_RELAYS: z
      .string()
      .default("wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net")
      .describe("Comma-separated standard Nostr relays for V1 parity routes"),
    BUZZ_RELAYS: z
      .string()
      .default("wss://nearbuilders.communities.buzz.xyz")
      .describe("Comma-separated Buzz relay URLs"),
    BUZZ_NSEC: z
      .string()
      .optional()
      .default("")
      .describe(
        "nsec/hex key for Buzz adapter NIP-42 relay auth (server identity only, never signs user events)",
      ),
    KV_API_URL: z
      .string()
      .default("https://kv.main.fastnear.com")
      .describe("FastNear KV API URL for bindings"),
    BINDING_CONTRACT: z
      .string()
      .default("contextual.near")
      .describe("FastNear KV binding contract account"),
    CHALLENGE_EXPIRY_SECONDS: z.coerce
      .number()
      .default(300)
      .describe("Binding challenge expiry in seconds"),
  }),

  secrets: z.object({}),

  context: ContextSchema,

  contract,

  initialize: (config, _plugins, tools) =>
    Effect.gen(function* () {
      const configLayer = NostrConfigLive(resolveNostrConfig(config.variables));

      const core = yield* tools.buildService(
        NostrCoreService,
        NostrCoreLive.pipe(Layer.provide(configLayer)),
      );

      const adapter = yield* tools.buildService(
        StandardAdapterService,
        StandardAdapterLive.pipe(Layer.provide(configLayer)),
      );

      const binding: BindingServiceInstance = yield* tools.buildService(
        BindingService,
        BindingServiceLive.pipe(Layer.provide(configLayer)),
      );

      const comments: NostrCommentServiceInstance = yield* tools.buildService(
        NostrCommentService,
        NostrCommentServiceLive.pipe(Layer.provide(configLayer)),
      );

      yield* Effect.logInfo("[Nostr] Services Initialized");

      return { core, adapter, binding, comments };
    }),

  shutdown: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Shutdown");
    }),

  createRouter: (services, builder) => {
    const { binding, comments } = services;
    const mw = createAuthMiddleware(builder);

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
          const entry = await runEffect(binding.getBinding(ctx.nearAccountId));
          return { pubkey, hasBinding: entry !== null };
        }),

      listRelays: builder.listRelays.handler(async () => ({
        relays: services.core.relays,
      })),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),

      // ── V1 parity handlers ──

      getBindingV1: builder.getBindingV1.handler(({ input }) =>
        runEffect(binding.getBindingOutput(input.nearAccountId)),
      ),

      getIdentityV1: builder.getIdentityV1.handler(({ input }) =>
        runEffect(binding.getIdentity(input.nearAccountId, input.enrichProfile)),
      ),

      createChallenge: builder.createChallenge
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ context }) => runEffect(binding.createChallenge(context.nearAccountId))),

      verifyBinding: builder.verifyBinding
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(async ({ input, context, errors }) => {
          try {
            if (!verifyEvent(input.event as any)) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Invalid Nostr event signature",
              });
            }
            const result = await runEffect(
              binding.verifyChallenge(input.event as any, context.nearAccountId),
            );
            return {
              valid: result.valid,
              nearAccountId: context.nearAccountId,
              nostrPubkey: result.nostrPubkey,
              proof: result.proof,
            };
          } catch (error) {
            if (error instanceof ORPCError) throw error;
            throw errors.BAD_REQUEST({
              message: error instanceof Error ? error.message : "Verification failed",
              data: {},
            });
          }
        }),

      prepareBindingWrite: builder.prepareBindingWrite
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(async ({ input, context, errors }) => {
          try {
            return await runEffect(
              binding.prepareBindingWrite({
                nostrPubkey: input.nostrPubkey,
                relay: input.relay,
                proof: input.proof,
                nearAccountId: context.nearAccountId,
              }),
            );
          } catch (error) {
            if (error instanceof ORPCError) throw error;
            throw errors.BAD_REQUEST({
              message: error instanceof Error ? error.message : "Prepare failed",
              data: {},
            });
          }
        }),

      listCommentsV1: builder.listCommentsV1.handler(async ({ input, errors }) => {
        try {
          if (!input.adapterType) {
            throw new ORPCError("BAD_REQUEST", {
              message: "adapterType is required",
              data: { hint: "Specify 'buzz' or 'standard'" },
            });
          }
          const has = await runEffect(comments.hasAdapter(input.adapterType));
          if (!has) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Adapter '${input.adapterType}' is not configured`,
            });
          }
          const result = await runEffect(
            comments.listComments({
              target: input.target,
              targetType: input.targetType,
              adapterType: input.adapterType,
              limit: input.limit,
              since: input.since,
              enrich: input.enrich,
              requireBound: input.requireBound,
              requireVerified: input.requireVerified,
            }),
          );
          return { data: result, meta: { count: result.length } };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Could not list comments",
            data: {},
          });
        }
      }),

      createComment: builder.createComment.handler(async ({ input, errors }) => {
        try {
          if (!input.adapterType) {
            throw new ORPCError("BAD_REQUEST", {
              message: "adapterType is required",
              data: { hint: "Specify 'buzz' or 'standard'" },
            });
          }
          const has = await runEffect(comments.hasAdapter(input.adapterType));
          if (!has) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Adapter '${input.adapterType}' is not configured`,
            });
          }
          const evt = { ...input.event, kind: input.event.kind ?? 1111 };
          const result = await runEffect(
            comments.publishSigned({
              event: evt,
              target: input.target,
              targetType: input.targetType,
              adapterType: input.adapterType,
            }),
          );
          return result;
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Could not publish comment",
            data: {},
          });
        }
      }),

      listChannels: builder.listChannels.handler(async () => {
        try {
          const channels = await runEffect(comments.listChannels("buzz"));
          return { data: channels };
        } catch {
          return { data: [] };
        }
      }),

      queryEvents: builder.queryEvents.handler(async ({ input, errors }) => {
        try {
          const has = await runEffect(comments.hasAdapter("standard"));
          if (!has) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Standard adapter not configured",
            });
          }
          const filter: Record<string, unknown> = {};
          if (input.filter.kinds) filter.kinds = input.filter.kinds;
          if (input.filter.authors) filter.authors = input.filter.authors;
          if (input.filter.ids) filter.ids = input.filter.ids;
          if (input.filter.since) filter.since = input.filter.since;
          if (input.filter.until) filter.until = input.filter.until;
          if (input.filter.limit) filter.limit = input.filter.limit;
          if (input.filter.tags) {
            for (const { tag, values } of input.filter.tags) {
              filter[`#${tag}`] = values;
            }
          }
          const events = await runEffect(comments.rawQuery({ filter, relays: input.relays }));
          return { events };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Query failed",
            data: {},
          });
        }
      }),

      publishEvent: builder.publishEvent.handler(async ({ input, errors }) => {
        try {
          const has = await runEffect(comments.hasAdapter("standard"));
          if (!has) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Standard adapter not configured",
            });
          }
          const result = await runEffect(
            comments.rawPublish({
              event: input.event as any,
              relays: input.relays,
            }),
          );
          return {
            eventId: result.eventId,
            statuses: result.statuses,
          };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw errors.BAD_REQUEST({
            message: error instanceof Error ? error.message : "Publish failed",
            data: {},
          });
        }
      }),

      getProfileV1: builder.getProfileV1.handler(async ({ input }) => {
        try {
          return await runEffect(comments.getProfile(input.pubkey));
        } catch {
          return null;
        }
      }),
    };
  },
});
