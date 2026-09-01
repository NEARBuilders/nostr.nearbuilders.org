import { Context, Layer } from "every-plugin/effect";
import { nip19 } from "nostr-tools";

const DEFAULT_KV_API = "https://kv.main.fastnear.com";
const DEFAULT_NEAR_RPC = "https://rpc.mainnet.near.org";
const DEFAULT_BINDING_CONTRACT = "contextual.near";
const DEFAULT_STANDARD_RELAYS = "wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net";
const DEFAULT_BUZZ_RELAYS = "wss://nearbuilders.communities.buzz.xyz";

export interface NostrResolvedConfig {
  relays: string[];
  clientName: string;
  kvApiUrl: string;
  nearRpc: string;
  bindingContract: string;
  standardRelays: string[];
  buzzRelays: string[];
  buzzSecretKey: Uint8Array | undefined;
  challengeExpirySeconds: number;
}

export interface NostrVariables {
  relays: string[];
  clientName: string;
  KV_API_URL: string;
  BINDING_CONTRACT: string;
  STANDARD_RELAYS: string;
  BUZZ_RELAYS: string;
  BUZZ_NSEC: string | undefined;
  CHALLENGE_EXPIRY_SECONDS: number;
}

function decodeSecret(value: string | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  if (value.startsWith("nsec1")) {
    const decoded = nip19.decode(value);
    if (decoded.type !== "nsec") return undefined;
    return decoded.data as Uint8Array;
  }
  return new Uint8Array(Buffer.from(value, "hex"));
}

export class NostrConfigTag extends Context.Tag("nostr/Config")<
  NostrResolvedConfig,
  NostrResolvedConfig
>() {}

export function resolveNostrConfig(variables: NostrVariables): NostrResolvedConfig {
  return {
    relays: variables.relays,
    clientName: variables.clientName,
    kvApiUrl: variables.KV_API_URL.trim() || DEFAULT_KV_API,
    nearRpc: DEFAULT_NEAR_RPC,
    bindingContract: variables.BINDING_CONTRACT.trim() || DEFAULT_BINDING_CONTRACT,
    standardRelays: (variables.STANDARD_RELAYS || DEFAULT_STANDARD_RELAYS)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    buzzRelays: (variables.BUZZ_RELAYS || DEFAULT_BUZZ_RELAYS)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    buzzSecretKey: decodeSecret(variables.BUZZ_NSEC),
    challengeExpirySeconds: variables.CHALLENGE_EXPIRY_SECONDS,
  };
}

export const NostrConfigLive = (config: NostrResolvedConfig) =>
  Layer.succeed(NostrConfigTag, config);
