import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
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

/**
 * Shared Nostr identity state + key actions for both the /nostr and /nostr-link
 * pages. Single source of truth: session re-reads localStorage after every key
 * action (version counter), so all consumers re-render with the same identity.
 */
export function useNostrIdentity() {
  const auth = useAuthClient();
  const nearAccountId = auth.near.getAccountId();
  const [keyBusy, setKeyBusy] = useState(false);
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
      generateAndStore(nearAccountId);
      toast.success("Nostr key generated", {
        description: "Export the nsec now — it is only stored in this browser.",
      });
      bumpSession();
    } finally {
      setKeyBusy(false);
    }
  }, [nearAccountId, bumpSession]);

  const handleImportKey = useCallback(
    (secret: string) => {
      if (!nearAccountId) return;
      setKeyBusy(true);
      try {
        importAndStore(nearAccountId, secret);
        toast.success("Nostr key imported");
        bumpSession();
      } catch (e) {
        toast.error("Invalid key", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setKeyBusy(false);
      }
    },
    [nearAccountId, bumpSession],
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
    toast.info("Local Nostr key cleared");
    bumpSession();
  }, [nearAccountId, bumpSession]);

  return {
    nearAccountId,
    session,
    keyBusy,
    handleConnectExtension,
    handleGenerateKey,
    handleImportKey,
    handleExportKey,
    handleClearKey,
  };
}

export type UseNostrIdentity = ReturnType<typeof useNostrIdentity>;
export type { NostrSession };
