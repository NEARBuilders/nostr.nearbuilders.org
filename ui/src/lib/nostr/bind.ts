import { finalizeEvent } from "nostr-tools/pure";
import type { ApiClient } from "@/lib/api";
import type { AuthClient } from "@/lib/auth";

export type BindingWriteArgs = {
  contractId: string;
  methodName: string;
  key: string;
  value: string;
  args: Record<string, string>;
  gas: string;
  attachedDeposit: string;
};

/**
 * Sign the kind-27235 binding proof event with the local Nostr key.
 * Content must be the server-issued challenge (`bind:<account>:<expiry>:<label>`);
 * the `p` tag names the NEAR account being bound (NEAR-nostr convention).
 * The server injects the kind when verifying, so only the six signed fields
 * minus `kind` are sent to `verifyBinding`.
 */
export function signBindingEvent(opts: {
  challenge: string;
  nearAccountId: string;
  secretKey: Uint8Array;
}) {
  return finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", opts.nearAccountId]],
      content: opts.challenge,
    },
    opts.secretKey,
  );
}

/**
 * Submit the __fastdata_kv write through the user's wallet (direct path).
 * The user pays gas plus the attachedDeposit (storage on the KV contract);
 * the tx signer must be the same NEAR account the challenge was issued for,
 * since FastNear KV indexes bindings by tx predecessor.
 */
export async function submitBindingWrite(
  authClient: AuthClient,
  tx: BindingWriteArgs,
  accountId: string,
): Promise<void> {
  const connected = await authClient.near.ensureConnected();
  if (!connected) {
    throw new Error("Wallet connection required to sign the binding transaction");
  }
  const client = authClient.near.getNearClient();
  await client
    .transaction(accountId)
    .functionCall(tx.contractId, tx.methodName, tx.args, {
      gas: `${Number(tx.gas)}`,
      attachedDeposit: BigInt(tx.attachedDeposit),
    })
    .send({ waitUntil: "FINAL" });
}

/**
 * Poll FastNear KV (via the plugin's getBinding) until the write is indexed
 * or the deadline passes. Indexing latency is best-effort; returns null on
 * timeout so the UI can tell the user to check back.
 */
export async function pollBinding(
  apiClient: ApiClient,
  nearAccountId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<{ npub: string; relay: string; proof: string; boundAt: number } | null> {
  const deadline = Date.now() + (opts?.timeoutMs ?? 45_000);
  const intervalMs = opts?.intervalMs ?? 2_000;
  while (Date.now() < deadline) {
    const binding = await apiClient.nostr.getBinding({ nearAccountId });
    if (binding) return binding;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
