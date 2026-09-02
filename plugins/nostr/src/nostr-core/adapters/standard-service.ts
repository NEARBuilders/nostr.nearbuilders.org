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
      const { standardRelays } = yield* NostrConfigTag;
      return new StandardAdapter(standardRelays);
    }),
    (adapter) => Effect.sync(() => adapter.close()),
  ),
);
