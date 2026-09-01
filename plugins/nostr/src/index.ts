import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import type { DecoratedMiddleware } from "every-plugin/orpc";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

import { contract } from "./contract";
import type { AuthContext } from "./lib/auth";
import { ContextSchema } from "./lib/context";
import { NostrConfigLive, resolveNostrConfig } from "./lib/nostr-config";
import type { PluginsClient } from "./lib/plugins-client.gen";
import {
  NostrCoreLive,
  NostrCoreService,
  StandardAdapterLive,
  StandardAdapterService,
} from "./nostr-core";
import { BindingService } from "./services/binding";
import { deriveNostrPubkey } from "./services/key-derivation";
import { NostrCommentService } from "./services/nostr";

// Minimal bech32 decode for nsec keys (no external deps)
function decodeBech32(str: string): Uint8Array {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const words: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    const idx = CHARSET.indexOf(c);
    if (idx === -1) continue;
    words.push(idx);
  }
  // Skip separator (last word) and checksum (last 6 words)
  const data = words.slice(1, -6);
  const acc = new Uint8Array(32);
  let bits = 0;
  let acc2 = 0;
  for (const word of data) {
    acc2 = (acc2 << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      acc[acc.length - 1 - ((bits / 5) | 0)] = (acc2 >>> bits) & 0xff;
    }
  }
  return acc;
}

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

      // V1 parity services
      const buzzNsec = config.variables.BUZZ_NSEC;
      let buzzSecretKey: Uint8Array | undefined;
      if (buzzNsec) {
        buzzSecretKey = buzzNsec.startsWith("nsec")
          ? decodeBech32(buzzNsec)
          : new Uint8Array(Buffer.from(buzzNsec, "hex"));
      }

      const kvBindings = new BindingService({
        kvApiUrl: config.variables.KV_API_URL,
        bindingContract: config.variables.BINDING_CONTRACT,
        standardRelays: config.variables.STANDARD_RELAYS.split(","),
        challengeExpirySeconds: config.variables.CHALLENGE_EXPIRY_SECONDS,
      });

      const comments = new NostrCommentService({
        standardRelays: config.variables.STANDARD_RELAYS.split(","),
        buzzRelays: config.variables.BUZZ_RELAYS.split(","),
        buzzSecretKey,
      });

      yield* Effect.logInfo("[Nostr] Services Initialized");

      return { core, adapter, kvBindings, comments };
    }),

  shutdown: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Shutdown");
    }),

  createRouter: (services, builder) => {
    const { kvBindings, comments } = services;

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

    // Session-based auth middleware — parity with nearbuilders.org plugin routers
    const requireAuth = builder.middleware(
      async ({ context, next }: { context: AuthContext; next: any }) => {
        if (!context.user || !context.userId) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "Authentication required",
          });
        }
        return next({
          context: { ...context, userId: context.userId!, user: context.user! },
        });
      },
    ) as DecoratedMiddleware<
      AuthContext,
      { userId: string; user: NonNullable<AuthContext["user"]> },
      any,
      any,
      any,
      any
    >;

    return {
      getPublicKey: builder.getPublicKey
        .use(requireNearAccount)
        .handler(async ({ context: ctx }) => {
          const seed = new TextEncoder().encode(ctx.nearAccountId + (ctx.userId ?? ""));
          const pubkey = deriveNostrPubkey(ctx.nearAccountId, seed);
          const binding = await kvBindings.getBinding(ctx.nearAccountId);
          return { pubkey, hasBinding: binding !== null };
        }),

      listRelays: builder.listRelays.handler(async () => ({
        relays: services.core.relays,
      })),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),

      // ── V1 parity handlers ──

      // From nostr-bindings
      getBindingV1: builder.getBindingV1.handler(async ({ input }) => {
        return await kvBindings.getBindingOutput(input.nearAccountId);
      }),

      getIdentityV1: builder.getIdentityV1.handler(async ({ input }) => {
        return await kvBindings.getIdentity(input.nearAccountId, input.enrichProfile);
      }),

      createChallenge: builder.createChallenge.use(requireAuth).handler(async ({ context }) => {
        const nearAccountId = context.near?.primaryAccountId ?? context.userId;
        if (!nearAccountId) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "NEAR account required for binding",
          });
        }
        return kvBindings.createChallenge(nearAccountId);
      }),

      verifyBinding: builder.verifyBinding
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          try {
            const nearAccountId = context.near?.primaryAccountId ?? context.userId;
            if (!nearAccountId) {
              throw new ORPCError("UNAUTHORIZED", {
                message: "NEAR account required",
              });
            }

            const { verifyEvent } = await import("nostr-tools/pure");
            if (!verifyEvent(input.event as any)) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Invalid Nostr event signature",
              });
            }

            const result = kvBindings.verifyChallenge(input.event, nearAccountId);

            return {
              valid: result.valid,
              nearAccountId,
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
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          try {
            const nearAccountId = context.near?.primaryAccountId ?? context.userId;
            if (!nearAccountId) {
              throw new ORPCError("UNAUTHORIZED", {
                message: "NEAR account required",
              });
            }

            return kvBindings.prepareBindingWrite({
              nostrPubkey: input.nostrPubkey,
              relay: input.relay,
              proof: input.proof,
              nearAccountId,
            });
          } catch (error) {
            if (error instanceof ORPCError) throw error;
            throw errors.BAD_REQUEST({
              message: error instanceof Error ? error.message : "Prepare failed",
              data: {},
            });
          }
        }),

      // From nostr-comments
      listCommentsV1: builder.listCommentsV1.handler(async ({ input, errors }) => {
        try {
          if (!input.adapterType) {
            throw new ORPCError("BAD_REQUEST", {
              message: "adapterType is required",
              data: { hint: "Specify 'buzz' or 'standard'" },
            });
          }

          if (!comments.hasAdapter(input.adapterType)) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Adapter '${input.adapterType}' is not configured`,
            });
          }

          const result = await comments.listComments({
            target: input.target,
            targetType: input.targetType,
            adapterType: input.adapterType,
            limit: input.limit,
            since: input.since,
            enrich: input.enrich,
            requireBound: input.requireBound,
            requireVerified: input.requireVerified,
          });
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

          if (!comments.hasAdapter(input.adapterType)) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Adapter '${input.adapterType}' is not configured`,
            });
          }

          const evt = { ...input.event, kind: input.event.kind ?? 1111 };
          const result = await comments.publishSigned({
            event: evt,
            target: input.target,
            targetType: input.targetType,
            adapterType: input.adapterType,
          });
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
          const channels = await comments.listChannels("buzz");
          return { data: channels };
        } catch {
          return { data: [] };
        }
      }),

      queryEvents: builder.queryEvents.handler(async ({ input, errors }) => {
        try {
          if (!comments.hasAdapter("standard")) {
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

          const events = await comments.rawQuery({ filter, relays: input.relays });
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
          if (!comments.hasAdapter("standard")) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Standard adapter not configured",
            });
          }

          const result = await comments.rawPublish({
            event: input.event as any,
            relays: input.relays,
          });
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
          const profile = await comments.getProfile(input.pubkey);
          return profile;
        } catch {
          return null;
        }
      }),
    };
  },
});
