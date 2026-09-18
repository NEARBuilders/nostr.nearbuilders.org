/**
 * Client helpers for the server-side encrypted nsec vault.
 *
 * The nsec is encrypted at rest with AES-256-GCM (VAULT_SECRET, outside the
 * DB). Transfer security = the user's authenticated session; ownership is
 * resolved server-side from the session, never from the request body.
 */
import type { ApiClient } from "../api";

export interface VaultStatus {
  stored: boolean;
  createdAt?: string;
}

export async function vaultPut(
  client: ApiClient,
  nsec: string,
): Promise<VaultStatus> {
  const res = await client.nostr.vaultPut({ nsec });
  return { stored: true, createdAt: res.createdAt };
}

export async function vaultGet(
  client: ApiClient,
): Promise<{ nsec: string; createdAt: string } | null> {
  return client.nostr.vaultGet({});
}

export async function vaultDelete(client: ApiClient): Promise<boolean> {
  const res = await client.nostr.vaultDelete({});
  return res.deleted;
}
