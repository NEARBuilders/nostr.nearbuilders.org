import { Context, Effect, Layer } from "every-plugin/effect";
import { NostrConfigTag } from "../../lib/nostr-config";
import { StandardAdapter } from "./standard";

export class StandardAdapterService extends Context.Tag("nostr/StandardAdapter")<
  StandardAdapterService,
  StandardAdapter
>() {}

export const StandardAdapterLive = Layer.scoped(
  StandardAdapterService,
  Effect.acquireRelease(
    Effect.gen(function* () {
      const { relays } = yield* NostrConfigTag;
      return new StandardAdapter(relays);
    }),
    (adapter) => Effect.sync(() => adapter.close()),
  ),
);
