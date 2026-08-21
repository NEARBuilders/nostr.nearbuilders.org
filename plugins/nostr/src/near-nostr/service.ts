import { Context, Effect, Layer } from "every-plugin/effect";
import { NostrConfigTag } from "../lib/nostr-config";
import { StandardAdapterService } from "../nostr-core/adapters/standard-service";
import { NostrCoreService } from "../nostr-core/core-service";
import { NearNostr } from "./core";

export class NearNostrService extends Context.Tag("nostr/NearNostr")<
  NearNostrService,
  NearNostr
>() {}

export const NearNostrLive = Layer.effect(
  NearNostrService,
  Effect.gen(function* () {
    const core = yield* NostrCoreService;
    const adapter = yield* StandardAdapterService;
    const config = yield* NostrConfigTag;

    return new NearNostr({
      core,
      adapter,
      config: {
        relays: config.relays,
        clientName: config.clientName,
        kvApiUrl: config.kvApiUrl,
        nearRpc: config.nearRpc,
        bindingContract: config.bindingContract,
      },
    });
  }),
);
