import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/lib/api";
import { useAuthClient } from "@/app";
import {
  clearSession,
  generateAndStore,
  getNip07,
  importAndStore,
  loadSession,
  saveSession,
  secretToNsec,
} from "@/lib/nostr";
import type { NostrSession } from "@/lib/nostr";
import { vaultDelete, vaultGet, vaultPut } from "@/lib/nostr/vault";

/**
 * Shared Nostr identity state + key actions for both the /nostr and /nostr-link
 * pages. Single source of truth: session re-reads localStorage after every key
 * action (version counter), so all consumers re-render with the same identity.
 *
 * Vault: generated/imported keys are also stored server-side, encrypted at
 * rest (AES-256-GCM). On any page load without a local key, the vault is
 * offered as a one-click restore path.
 */
export function useNostrIdentity() {
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const nearAccountId = auth.near.getAccountId();
  const [keyBusy, setKeyBusy] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  const session = useMemo(() => {
    if (!nearAccountId) return null;
    void sessionVersion; // re-read localStorage after key actions
    return loadSession(nearAccountId);
  }, [nearAccountId, sessionVersion]);

  const bumpSession = useCallback(() => setSessionVersion((v) => v + 1), []);

  const handleConnectExtension = useCallback(async () => {
    if (!nearAccountId) return;
    const provider = getNip07();
    if (!provider) {
      toast.error("No NIP-07 extension found", {
        description: "Install a Nostr extension (Alby, nos2x, etc.) first.",
      });
      return;
    }
    setKeyBusy(true);
    try {
      const pubkey = await provider.getPublicKey();
      saveSession(nearAccountId, "", pubkey, "extension");
      toast.success("Extension key connected");
      bumpSession();
    } catch (e) {
      toast.error("Extension rejected", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setKeyBusy(false);
    }
  }, [nearAccountId, bumpSession]);

  const handleGenerateKey = useCallback(() => {
    if (!nearAccountId) return;
    setKeyBusy(true);
    try {
      const s = generateAndStore(nearAccountId);
      toast.success("Nostr key generated", {
        description: "Saved locally and backed up to the encrypted vault.",
      });
      void vaultPut(apiClient, secretToNsec(s)).catch(() => {
        toast.info("Vault backup unavailable", {
          description: "Key works locally; vault not configured on this server.",
        });
      });
      bumpSession();
    } finally {
      setKeyBusy(false);
    }
  }, [nearAccountId, apiClient, bumpSession]);

  const handleImportKey = useCallback(
    (secret: string) => {
      if (!nearAccountId) return;
      setKeyBusy(true);
      try {
        const s = importAndStore(nearAccountId, secret);
        toast.success("Nostr key imported");
        void vaultPut(apiClient, secretToNsec(s)).catch(() => undefined);
        bumpSession();
      } catch (e) {
        toast.error("Invalid key", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setKeyBusy(false);
      }
    },
    [nearAccountId, apiClient, bumpSession],
  );

  const handleExportKey = useCallback(() => {
    if (!session?.secretKeyHex) return;
    const nsec = secretToNsec(session);
    void navigator.clipboard
      .writeText(nsec)
      .then(() => {
        toast.info("nsec copied to clipboard", {
          description: "Store it safely — anyone with this key controls the identity.",
        });
      })
      .catch(() => {
        toast.error("Clipboard unavailable", { description: nsec });
      });
  }, [session]);

  const handleClearKey = useCallback(() => {
    if (!nearAccountId) return;
    clearSession(nearAccountId);
    toast.info("Local Nostr key cleared", {
      description: "It remains recoverable from the encrypted vault.",
    });
    bumpSession();
  }, [nearAccountId, bumpSession]);

  const handleVaultRestore = useCallback(async () => {
    if (!nearAccountId || session) return;
    setVaultBusy(true);
    try {
      const entry = await vaultGet(apiClient);
      if (!entry) {
        toast.error("Nothing stored in the vault for this account");
        return;
      }
      importAndStore(nearAccountId, entry.nsec);
      toast.success("Key restored from encrypted vault");
      bumpSession();
    } catch (e) {
      toast.error("Vault restore failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVaultBusy(false);
    }
  }, [nearAccountId, session, apiClient, bumpSession]);

  const handleVaultForget = useCallback(async () => {
    if (!nearAccountId) return;
    setVaultBusy(true);
    try {
      await vaultDelete(apiClient);
      toast.info("Vault entry deleted");
    } catch (e) {
      toast.error("Vault delete failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVaultBusy(false);
    }
  }, [nearAccountId, apiClient]);

  return {
    nearAccountId,
    session,
    keyBusy,
    vaultBusy,
    handleConnectExtension,
    handleGenerateKey,
    handleImportKey,
    handleExportKey,
    handleClearKey,
    handleVaultRestore,
    handleVaultForget,
  };
}

export type UseNostrIdentity = ReturnType<typeof useNostrIdentity>;
export type { NostrSession };
