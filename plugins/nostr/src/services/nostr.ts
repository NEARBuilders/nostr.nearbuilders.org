import { createHash } from "node:crypto";
import { Context, Effect, Layer } from "every-plugin/effect";
import WebSocket from "ws";
import { NostrConfigTag } from "../lib/nostr-config";
import { BuzzAdapter, StandardAdapter } from "../nostr-core/adapters";
import type { RelayAdapter } from "../nostr-core/adapters/types";
import type { NostrEvent } from "../nostr-core/types";

const PUBLISH_TIMEOUT_MS = 5_000;
const KV_API = "https://kv.main.fastnear.com";

const DEFAULT_RELAY_FALLBACKS = ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.primal.net"];

export type NostrComment = {
  id: string;
  pubkey: string;
  content: string;
  target: string;
  targetType: string;
  nearAccountId?: string | null;
  parentEventId?: string | null;
  createdAt: number;
  tags?: string[][];
  source: "standard" | "buzz";
  profile?: NostrProfile | null;
};

export type PublishResult = {
  eventId: string;
  statuses: { relay: string; success: boolean }[];
};

export type ChannelInfo = {
  id: string;
  name?: string | null;
  members?: number | null;
};

export type NostrProfile = {
  pubkey: string;
  name?: string | null;
  picture?: string | null;
  about?: string | null;
  nip05?: string | null;
  website?: string | null;
};

export interface NostrCommentServiceShape {
  readonly listComments: (opts: {
    target: string;
    targetType: string;
    adapterType: string;
    limit?: number;
    since?: number;
    enrich?: boolean;
    requireBound?: boolean;
    requireVerified?: boolean;
  }) => Effect.Effect<NostrComment[], never>;
  readonly publishSigned: (opts: {
    event: NostrEvent;
    target: string;
    targetType: string;
    adapterType: string;
  }) => Effect.Effect<PublishResult, never>;
  readonly listChannels: (adapterType?: string) => Effect.Effect<ChannelInfo[], never>;
  readonly rawQuery: (opts: {
    filter: Record<string, unknown>;
    relays?: string[];
  }) => Effect.Effect<NostrEvent[], never>;
  readonly rawPublish: (opts: {
    event: NostrEvent;
    relays?: string[];
  }) => Effect.Effect<PublishResult, never>;
  readonly getProfile: (pubkey: string) => Effect.Effect<NostrProfile | null, never>;
  readonly hasAdapter: (adapterType: string) => Effect.Effect<boolean, never>;
}

export class NostrCommentService extends Context.Tag("nostr/NostrCommentService")<
  NostrCommentService,
  NostrCommentServiceShape
>() {}

const toComment = (
  event: NostrEvent,
  target: string,
  targetType: string,
  source: "standard" | "buzz",
): NostrComment => ({
  id: event.id,
  pubkey: event.pubkey,
  content: event.content,
  target,
  targetType,
  nearAccountId: event.tags.find((t) => t[0] === "near_account")?.[1],
  parentEventId: event.tags.find((t) => t[0] === "e" && t[3] === "reply")?.[1],
  createdAt: event.created_at,
  tags: event.tags,
  source,
});

const publishToRelays = (
  event: NostrEvent,
  relays: readonly string[],
): Effect.Effect<{ relay: string; success: boolean }[], never> =>
  Effect.scoped(
    Effect.forEach(
      relays,
      (relay) =>
        Effect.acquireRelease(
          Effect.sync(() => new WebSocket(relay)),
          (socket) =>
            Effect.sync(() => {
              if (
                socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING
              ) {
                socket.close();
              }
            }),
        ).pipe(
          Effect.flatMap((socket) =>
            Effect.async<{ relay: string; success: boolean }>((resume) => {
              const timer = setTimeout(() => {
                resume(Effect.succeed({ relay, success: false }));
              }, PUBLISH_TIMEOUT_MS);

              socket.on("open", () => {
                socket.send(JSON.stringify(["EVENT", event]));
              });
              socket.on("message", (data: WebSocket.RawData) => {
                try {
                  const msg = JSON.parse(data.toString()) as unknown[];
                  if (msg[0] === "OK" && msg[1] === event.id) {
                    clearTimeout(timer);
                    resume(Effect.succeed({ relay, success: msg[2] === true }));
                  }
                } catch {
                  clearTimeout(timer);
                  resume(Effect.succeed({ relay, success: false }));
                }
              });
              socket.on("error", () => {
                clearTimeout(timer);
                resume(Effect.succeed({ relay, success: false }));
              });
            }),
          ),
        ),
      { concurrency: "unbounded", discard: false },
    ),
  );

const verifyKvAccount = (nearAccountId: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(
        `${KV_API}/v0/latest/contextual.near/${nearAccountId}/nostr/${nearAccountId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) return false;
      const data = (await res.json()) as {
        entries?: Array<{ value?: unknown }>;
      };
      return Boolean(data?.entries?.[0]?.value);
    },
    catch: () => false as boolean,
  }).pipe(Effect.orElseSucceed(() => false));

export const NostrCommentServiceLive = Layer.scoped(
  NostrCommentService,
  Effect.acquireRelease(
    Effect.gen(function* () {
      const cfg = yield* NostrConfigTag;

      const adapters = new Map<string, RelayAdapter>();
      if (cfg.standardRelays.length) {
        adapters.set("standard", new StandardAdapter(cfg.standardRelays));
      }
      if (cfg.buzzRelays.length && cfg.buzzSecretKey) {
        adapters.set(
          "buzz",
          new BuzzAdapter({
            relays: cfg.buzzRelays,
            secretKey: cfg.buzzSecretKey,
            resolveChannel: (target: string) =>
              createHash("sha256").update(target).digest("hex").slice(0, 16),
          }),
        );
      }

      const getAdapter = (type: string): RelayAdapter => {
        const adapter = adapters.get(type);
        if (!adapter) throw new Error(`Adapter not configured: ${type}`);
        return adapter;
      };

      const listComments: NostrCommentServiceShape["listComments"] = (opts) =>
        Effect.gen(function* () {
          const adapter = getAdapter(opts.adapterType);
          const queried = yield* Effect.tryPromise({
            try: () =>
              adapter.query({
                target: opts.target,
                targetType: opts.targetType,
                clientName: "near-nostr-sdk",
                limit: opts.limit,
                since: opts.since,
              }),
            catch: () => ({ events: [] }) as { events: NostrEvent[] },
          }).pipe(Effect.orElseSucceed(() => ({ events: [] }) as { events: NostrEvent[] }));

          let filtered = queried.events.map((e: NostrEvent) =>
            toComment(e, opts.target, opts.targetType, opts.adapterType as "standard" | "buzz"),
          );

          if (opts.requireBound) {
            filtered = filtered.filter((c: NostrComment) => c.nearAccountId);
          }
          if (opts.requireVerified) {
            const accounts = [
              ...new Set(
                filtered
                  .filter((c: NostrComment) => c.nearAccountId)
                  .map((c: NostrComment) => c.nearAccountId!),
              ),
            ];
            const BATCH = 5;
            const verified = new Set<string>();
            for (let i = 0; i < accounts.length; i += BATCH) {
              const batch = accounts.slice(i, i + BATCH);
              const results = yield* Effect.forEach(batch, (acc: string) => verifyKvAccount(acc), {
                concurrency: BATCH,
                discard: false,
              });
              results.forEach((ok: boolean, idx: number) => {
                if (ok) verified.add(batch[idx]!);
              });
            }
            filtered = filtered.filter(
              (c: NostrComment) => c.nearAccountId && verified.has(c.nearAccountId),
            );
          }
          if (opts.enrich) {
            const standard = getAdapter("standard") as StandardAdapter;
            const pubkeys = [...new Set(filtered.map((c: NostrComment) => c.pubkey))];
            const BATCH = 5;
            const profileMap = new Map<string, NostrProfile>();
            for (let i = 0; i < pubkeys.length; i += BATCH) {
              const batch = pubkeys.slice(i, i + BATCH);
              const profiles = yield* Effect.forEach(
                batch,
                (pk: string) =>
                  Effect.tryPromise({
                    try: () => standard.getProfile(pk),
                    catch: () => null as NostrProfile | null,
                  }).pipe(Effect.orElseSucceed(() => null)),
                { concurrency: BATCH, discard: false },
              );
              profiles.forEach((profile: NostrProfile | null, idx: number) => {
                if (profile) profileMap.set(batch[idx]!, profile);
              });
            }
            for (const c of filtered) {
              const p = profileMap.get(c.pubkey);
              if (p) c.profile = p;
            }
          }
          return filtered;
        });

      const publishSigned: NostrCommentServiceShape["publishSigned"] = (opts) =>
        Effect.gen(function* () {
          const adapter = getAdapter(opts.adapterType);
          const relays = (adapter as { relays?: string[] }).relays ?? DEFAULT_RELAY_FALLBACKS;
          const statuses = yield* publishToRelays(opts.event, relays);
          return { eventId: opts.event.id ?? "", statuses };
        });

      const listChannels: NostrCommentServiceShape["listChannels"] = (adapterType) =>
        Effect.gen(function* () {
          const type = adapterType ?? "buzz";
          const adapter = getAdapter(type);
          if (!(adapter instanceof BuzzAdapter)) return [] as ChannelInfo[];
          const events = yield* Effect.tryPromise({
            try: () => adapter.listChannels(),
            catch: () => [] as NostrEvent[],
          }).pipe(Effect.orElseSucceed(() => [] as NostrEvent[]));
          return events.map((e: NostrEvent) => {
            const id = e.tags.find((t) => t[0] === "d")?.[1];
            const name = e.tags.find((t) => t[0] === "name")?.[1];
            return { id: id ?? e.id, name: name ?? null };
          });
        });

      const rawQuery: NostrCommentServiceShape["rawQuery"] = (opts) => {
        const standard = getAdapter("standard") as StandardAdapter;
        return Effect.tryPromise({
          try: () => standard.queryRaw(opts.filter, opts.relays),
          catch: () => [] as NostrEvent[],
        }).pipe(Effect.orElseSucceed(() => [] as NostrEvent[]));
      };

      const rawPublish: NostrCommentServiceShape["rawPublish"] = (opts) =>
        Effect.gen(function* () {
          const relays = opts.relays ?? DEFAULT_RELAY_FALLBACKS;
          const statuses = yield* publishToRelays(opts.event, relays);
          return { eventId: opts.event.id ?? "", statuses };
        });

      const getProfile: NostrCommentServiceShape["getProfile"] = (pubkey) => {
        const standard = getAdapter("standard") as StandardAdapter;
        return Effect.tryPromise({
          try: () => standard.getProfile(pubkey),
          catch: () => null as NostrProfile | null,
        }).pipe(Effect.orElseSucceed(() => null));
      };

      const hasAdapter: NostrCommentServiceShape["hasAdapter"] = (adapterType) =>
        Effect.succeed(adapters.has(adapterType));

      return Object.assign(
        {
          listComments,
          publishSigned,
          listChannels,
          rawQuery,
          rawPublish,
          getProfile,
          hasAdapter,
        },
        {
          __close: (): void => {
            for (const a of adapters.values()) a.close();
            adapters.clear();
          },
        },
      );
    }),
    (svc) => Effect.sync(() => (svc as { __close: () => void }).__close()),
  ),
);
