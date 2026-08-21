import { Context, Layer } from "every-plugin/effect";

export interface NostrResolvedConfig {
  relays: string[];
  clientName: string;
  kvApiUrl: string;
  nearRpc: string;
  bindingContract: string;
}

const DEFAULT_KV_API = "https://kv.main.fastnear.com";
const DEFAULT_NEAR_RPC = "https://rpc.mainnet.near.org";
const DEFAULT_BINDING_CONTRACT = "contextual.near";

export class NostrConfigTag extends Context.Tag("nostr/Config")<
  NostrResolvedConfig,
  NostrResolvedConfig
>() {}

export function resolveNostrConfig(variables: {
  relays: string[];
  clientName: string;
}): NostrResolvedConfig {
  return {
    relays: variables.relays,
    clientName: variables.clientName,
    kvApiUrl: DEFAULT_KV_API,
    nearRpc: DEFAULT_NEAR_RPC,
    bindingContract: DEFAULT_BINDING_CONTRACT,
  };
}

export const NostrConfigLive = (config: NostrResolvedConfig) =>
  Layer.succeed(NostrConfigTag, config);
