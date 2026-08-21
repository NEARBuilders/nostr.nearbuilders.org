import { Context, Effect, Layer } from "every-plugin/effect";
import { NostrConfigTag } from "../lib/nostr-config";
import { NostrCore } from "./core";

export class NostrCoreService extends Context.Tag("nostr/NostrCore")<
  NostrCoreService,
  NostrCore
>() {}

export const NostrCoreLive = Layer.scoped(
  NostrCoreService,
  Effect.acquireRelease(
    Effect.gen(function* () {
      const { relays } = yield* NostrConfigTag;
      return new NostrCore({ relays });
    }),
    (core) => Effect.sync(() => core.close()),
  ),
);
