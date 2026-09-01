const KV_API = "https://kv.main.fastnear.com";
const BINDING_CONTRACT = "contextual.near";
const DEFAULT_RELAY = "wss://relay.damus.io";

export type NearNostrBinding = {
  nearAccountId: string;
  nostrPubkey: string;
  relay?: string;
  proof?: string;
  boundAt?: number;
};

export async function getBinding(nearAccountId: string): Promise<NearNostrBinding | null> {
  try {
    const res = await fetch(
      `${KV_API}/v0/latest/${BINDING_CONTRACT}/${nearAccountId}/nostr/${nearAccountId}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.entries?.[0];
    if (!entry?.value) return null;
    const parsed = typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
    return {
      nearAccountId,
      nostrPubkey: parsed.npub ?? parsed.value?.npub,
      relay: parsed.relay ?? parsed.value?.relay,
      proof: parsed.proof ?? parsed.value?.proof,
      boundAt: parsed.bound_at ?? parsed.value?.bound_at,
    };
  } catch {
    return null;
  }
}

export function buildTxArgs(opts: {
  nearAccountId: string;
  nostrPubkey: string;
  proof: string;
  relay?: string;
}): { contract: string; method: string; args: Record<string, unknown> } {
  return {
    contract: BINDING_CONTRACT,
    method: "__fastdata_kv",
    args: {
      [`nostr/${opts.nearAccountId}`]: JSON.stringify({
        npub: opts.nostrPubkey,
        relay: opts.relay ?? DEFAULT_RELAY,
        proof: opts.proof,
        bound_at: Math.floor(Date.now() / 1000),
      }),
    },
  };
}
