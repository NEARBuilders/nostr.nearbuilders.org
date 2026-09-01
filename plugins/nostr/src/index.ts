import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import type { DecoratedMiddleware } from "every-plugin/orpc";
import { ORPCError } from "every-plugin/orpc";
import { contract } from "./contract";
import type { AuthContext } from "./lib/auth";
import { createAuthMiddleware } from "./lib/auth";
import { ContextSchema, runEffect } from "./lib/context";
import {
  NostrConfigLive,
  NostrSecretsSchema,
  NostrVariablesSchema,
  resolveNostrConfig,
} from "./lib/nostr-config";
import type { PluginsClient } from "./lib/plugins-client.gen";
import { BuzzAdapterLive, StandardAdapterLive } from "./nostr-core/adapters";
import type { NostrFilter } from "./nostr-core/types";
import { BindingService, BindingServiceLive } from "./services/binding";
import { deriveNostrPubkey } from "./services/key-derivation";
import { NostrCommentService, NostrCommentServiceLive } from "./services/nostr";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: NostrVariablesSchema,

  secrets: NostrSecretsSchema,

  context: ContextSchema,

  contract,

  initialize: (config, _plugins, tools) =>
    Effect.gen(function* () {
      const resolved = resolveNostrConfig(config.variables, config.secrets);
      const configLayer = NostrConfigLive(resolved);

      const binding = yield* tools.buildService(
        BindingService,
        BindingServiceLive.pipe(Layer.provide(configLayer)),
      );

      const comments = yield* tools.buildService(
        NostrCommentService,
        NostrCommentServiceLive.pipe(
          Layer.provide(BuzzAdapterLive),
          Layer.provide(StandardAdapterLive),
          Layer.provide(configLayer),
        ),
      );

      yield* Effect.logInfo("[Nostr] Services Initialized");

      return { relays: resolved.relays, binding, comments };
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
        relays: services.relays,
      })),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),

      getBinding: builder.getBinding.handler(({ input }) =>
        runEffect(binding.getBindingOutput(input.nearAccountId)),
      ),

      getIdentity: builder.getIdentity.handler(({ input }) =>
        runEffect(binding.getIdentity(input.nearAccountId, input.enrichProfile)),
      ),

      createChallenge: builder.createChallenge
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ context }) => runEffect(binding.createChallenge(context.nearAccountId))),

      verifyBinding: builder.verifyBinding
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(async ({ input, context }) => {
          const result = await runEffect(
            binding.verifyChallenge(input.event, context.nearAccountId),
          );
          return {
            valid: result.valid,
            nearAccountId: context.nearAccountId,
            nostrPubkey: result.nostrPubkey,
            proof: result.proof,
          };
        }),

      prepareBindingWrite: builder.prepareBindingWrite
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ input, context }) =>
          runEffect(
            binding.prepareBindingWrite({
              nostrPubkey: input.nostrPubkey,
              relay: input.relay,
              proof: input.proof,
              nearAccountId: context.nearAccountId,
            }),
          ),
        ),

      listComments: builder.listComments.handler(({ input }) =>
        runEffect(
          comments.listComments({
            target: input.target,
            targetType: input.targetType,
            adapterType: input.adapterType ?? "standard",
            limit: input.limit,
            since: input.since,
            enrich: input.enrich,
            requireBound: input.requireBound,
            requireVerified: input.requireVerified,
          }),
        ).then((result) => ({ data: result, meta: { count: result.length } })),
      ),

      createComment: builder.createComment
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ input }) =>
          runEffect(
            comments.publishSigned({
              event: input.event,
              target: input.target,
              targetType: input.targetType,
              adapterType: input.adapterType ?? "standard",
            }),
          ),
        ),

      listChannels: builder.listChannels.handler(() =>
        runEffect(comments.listChannels("buzz")).then((data) => ({ data })),
      ),

      queryEvents: builder.queryEvents.handler(({ input }) => {
        const filter: NostrFilter = {};
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
        return runEffect(comments.rawQuery({ filter, relays: input.relays })).then((events) => ({
          events,
        }));
      }),

      publishEvent: builder.publishEvent
        .use(mw.requireAuth)
        .handler(({ input }) =>
          runEffect(comments.rawPublish({ event: input.event, relays: input.relays })).then(
            (result) => ({ eventId: result.eventId, statuses: result.statuses }),
          ),
        ),

      getProfile: builder.getProfile.handler(({ input }) =>
        runEffect(comments.getProfile(input.pubkey)),
      ),
    };
  },
});
