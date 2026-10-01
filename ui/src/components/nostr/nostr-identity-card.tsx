import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudDownload, Copy, Import, Key, Link2, Loader2, PlusCircle, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import {
  buildTxArgs,
  clearSession,
  createBindingChallenge,
  generateAndStore,
  getBinding,
  importAndStore,
  loadSession,
  secretKeyBytes,
  secretToNsec,
  signBindingChallenge,
} from "@/lib/nostr";
import { vaultGet } from "@/lib/nostr/vault";
import { npubEncode } from "nostr-tools/nip19";
import { DEFAULT_RELAYS } from "@/lib/nostr/types";

const SOURCE_LABEL: Record<string, string> = {
  generated: "generated (local)",
  imported: "imported (local)",
  extension: "NIP-07 extension",
};

export function NostrIdentityCard({
  nearAccountId,
  onKeyChange,
}: {
  nearAccountId: string;
  onKeyChange?: () => void;
}) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const session = useMemo(() => loadSession(nearAccountId), [nearAccountId, refreshKey]);

  const { data: binding, isLoading: bindingLoading } = useQuery({
    queryKey: ["nostr-binding", nearAccountId],
    queryFn: () => getBinding(nearAccountId),
    staleTime: 60_000,
  });

  const isLinked = !!binding?.nostrPubkey;
  const boundToCurrentKey = isLinked && binding?.nostrPubkey === session?.pubkey;

  const handleLink = useCallback(async () => {
    if (!nearAccountId || !session) return;
    setLinking(true);
    try {
      const { challenge } = createBindingChallenge(nearAccountId);
      const event = signBindingChallenge(secretKeyBytes(session), challenge);

      const { contract, method, args } = buildTxArgs({
        nearAccountId,
        nostrPubkey: session.pubkey,
        proof: event.id,
        relay: DEFAULT_RELAYS[0],
      });

      const payload = await auth.near.buildSignedDelegateAction(contract, (builder, receiverId) =>
        builder.functionCall(receiverId, method, args, {
          gas: "300 Tgas",
          attachedDeposit: "0.01 NEAR",
        }),
      );

      await auth.near.relayTransaction({ payload });
      await queryClient.invalidateQueries({ queryKey: ["nostr-binding", nearAccountId] });
      toast.success("Nostr identity linked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }, [auth.near, nearAccountId, queryClient, session]);

  const bindingValue = bindingLoading
    ? "checking…"
    : isLinked
      ? boundToCurrentKey
        ? "linked"
        : `linked to ${binding.nostrPubkey.slice(0, 12)}…`
      : "not linked";

  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (importOpen) importInputRef.current?.focus();
  }, [importOpen]);

  const [vaultBusy, setVaultBusy] = useState(false);
  const apiClient = useApiClient();
  const handleImportSubmit = () => {
    const value = importValue.trim();
    if (!value) return;
    try {
      const s = importAndStore(nearAccountId, value);
      setImportValue("");
      setImportOpen(false);
      setRefreshKey((k) => k + 1);
      onKeyChange?.();
      toast.success("Nostr key imported", { description: `${npubEncode(s.pubkey).slice(0, 20)}…` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const handleVaultRestore = useCallback(async () => {
    if (!nearAccountId || session) return;
    setVaultBusy(true);
    try {
      const entry = await vaultGet(apiClient);
      if (!entry?.nsec) {
        toast.error("Nothing stored in the vault for this account");
        return;
      }
      importAndStore(nearAccountId, entry.nsec);
      toast.success("Key restored from encrypted vault");
      setRefreshKey((k) => k + 1);
      onKeyChange?.();
    } catch (e) {
      toast.error("Vault restore failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setVaultBusy(false);
    }
  }, [nearAccountId, session, apiClient]);

  return (
    <div className="p-6 border border-border rounded-[10px] space-y-4 bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
        <Key className="h-3 w-3" />
        Nostr Identity
      </div>

      <div className="space-y-2">
        <InfoRow label="NEAR Account" value={nearAccountId} mono />
        <InfoRow
          label="Nostr Pubkey"
          value={session?.pubkey ? `${session.pubkey.slice(0, 16)}...` : "—"}
          mono
        />
        <InfoRow
          label="Binding"
          value={
            <span className="flex items-center gap-1">
              {isLinked ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-muted-foreground" />
              )}
              {bindingValue}
            </span>
          }
        />
        <InfoRow
          label="Local Key"
          value={
            <span className="flex items-center gap-1">
              {session ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-muted-foreground" />
              )}
              {session ? ("source" in session ? SOURCE_LABEL[session.source] : "stored") : "none"}
            </span>
          }
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {!session && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              generateAndStore(nearAccountId);
              setRefreshKey((k) => k + 1);
              onKeyChange?.();
            }}
          >
            <PlusCircle className="h-3 w-3 mr-1" />
            Generate Key
          </Button>
        )}
        {!session && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen((v) => !v)}
          >
            <Import className="h-3 w-3 mr-1" />
            Import nsec
          </Button>
        )}
        {!session && vaultBusy && (
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground self-center">
            <Loader2 className="h-3 w-3 animate-spin" />
            restoring…
          </span>
        )}
        {session && !boundToCurrentKey && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleLink()}
            disabled={linking}
          >
            {linking ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Link2 className="h-3 w-3 mr-1" />
            )}
            {linking ? "Linking…" : "Link to NEAR"}
          </Button>
        )}
        {session && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clearSession(nearAccountId);
              setRefreshKey((k) => k + 1);
              onKeyChange?.();
            }}
          >
            Clear Key
          </Button>
        )}
        {session && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secretToNsec(session));
                toast.success("nsec copied to clipboard");
              } catch {
                toast.error("Clipboard unavailable");
              }
            }}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy nsec
          </Button>
        )}
        {!session && !vaultBusy && (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleVaultRestore()}>
            <CloudDownload className="h-3 w-3 mr-1" />
            Restore from Vault
          </Button>
        )}
      </div>

      {importOpen && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={importInputRef}
            type="password"
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImportSubmit();
            }}
            placeholder="nsec1… or 64-char hex"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleImportSubmit}
            disabled={!importValue.trim()}
          >
            Import
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setImportOpen(false);
              setImportValue("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
