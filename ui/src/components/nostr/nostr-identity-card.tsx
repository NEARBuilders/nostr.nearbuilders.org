import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CloudDownload,
  Copy,
  Import,
  Key,
  KeyRound,
  Link,
  Link2,
  LinkIcon,
  Loader2,
  PlusCircle,
  Puzzle,
  Trash2,
  XCircle,
} from "lucide-react";
import { npubEncode } from "nostr-tools/nip19";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import type { NostrSession } from "@/lib/nostr";
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
import { DEFAULT_RELAYS } from "@/lib/nostr/types";
import { vaultGet } from "@/lib/nostr/vault";

type BindingData = {
  npub: string;
  boundAt: number;
};

const SOURCE_LABEL: Record<string, string> = {
  generated: "generated (local)",
  imported: "imported (local)",
  extension: "NIP-07 extension",
};

type Props =
  | {
      nearAccountId: string;
      onKeyChange?: () => void;
      selfManaged?: false;
    }
  | {
      nearAccountId: string;
      onKeyChange?: undefined;
      session: NostrSession | null;
      bindingQueryKey: readonly [string, ...string[]];
      onConnectExtension: () => void;
      onGenerateKey: () => void;
      onImportKey: (secret: string) => void;
      onExportKey: () => void;
      onClearKey: () => void;
      onVaultRestore: () => void;
      busy: boolean;
      vaultBusy: boolean;
      selfManaged?: undefined;
    };

export function NostrIdentityCard(props: Props) {
  if ("session" in props && props.session !== undefined) {
    return <ControlledIdentityCard {...(props as ControlledProps)} />;
  }
  const { nearAccountId, onKeyChange } = props as {
    nearAccountId: string;
    onKeyChange?: () => void;
  };
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
      toast.error("Vault restore failed", {
        description: e instanceof Error ? e.message : String(e),
      });
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleVaultRestore()}
          >
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

type ControlledProps = {
  nearAccountId: string;
  session: NostrSession | null;
  bindingQueryKey: [string, string];
  onConnectExtension: () => void;
  onGenerateKey: () => void;
  onImportKey: (secret: string) => void;
  onExportKey: () => void;
  onClearKey: () => void;
  onVaultRestore: () => void;
  busy: boolean;
  vaultBusy: boolean;
};

function ControlledIdentityCard({
  nearAccountId,
  session,
  bindingQueryKey,
  onConnectExtension,
  onGenerateKey,
  onImportKey,
  onExportKey,
  onClearKey,
  onVaultRestore,
  busy,
  vaultBusy,
}: ControlledProps) {
  const apiClient = useApiClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (importOpen) importInputRef.current?.focus();
  }, [importOpen]);

  const bindingQuery = useQuery({
    queryKey: bindingQueryKey,
    queryFn: () => apiClient.nostr.getBinding({ nearAccountId }),
    enabled: !!nearAccountId,
    staleTime: 60_000,
  });

  const npubFromHex = (hex: string) =>
    hex ? `${npubEncode(hex).slice(0, "npub1".length + 16)}…` : "—";

  const localPubkey = session?.pubkey ?? "";
  const hasLocalSecret = !!session?.secretKeyHex;
  const binding = bindingQuery.data ?? null;
  const linkedToLocal = binding?.npub === localPubkey && !!localPubkey;
  const linkedToDifferent = !!binding && !linkedToLocal;
  const hasLocal = !!session;
  const isLinking = bindingQuery.isLoading && !bindingQuery.data;

  const submitImport = () => {
    const value = importValue.trim();
    if (!value) return;
    onImportKey(value);
    setImportValue("");
    setImportOpen(false);
  };

  return (
    <div className="p-6 border border-border rounded-[10px] space-y-4 bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
        <Key className="h-3 w-3" />
        Nostr Identity
      </div>

      <div className="space-y-2">
        <InfoRow label="NEAR Account" value={nearAccountId} mono />
        <InfoRow label="Nostr Pubkey (local)" value={npubFromHex(localPubkey)} mono />
        {session && <InfoRow label="Key Source" value={SOURCE_LABEL[session.source]} />}
        <InfoRow
          label="Binding"
          value={
            <BindingValue
              binding={binding ?? null}
              linkedToLocal={linkedToLocal}
              linkedToDifferent={linkedToDifferent}
              isLoading={isLinking}
            />
          }
        />
        {binding && <InfoRow label="Bound Pubkey" value={npubFromHex(binding.npub)} mono />}
        {binding && (
          <InfoRow label="Bound At" value={new Date(binding.boundAt * 1000).toLocaleString()} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!hasLocal && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConnectExtension}
              disabled={busy}
            >
              <Puzzle className="h-3 w-3 mr-1" />
              Use Extension
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGenerateKey}
              disabled={busy}
            >
              <KeyRound className="h-3 w-3 mr-1" />
              Generate Key
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen((v) => !v)}
              disabled={busy}
            >
              <Import className="h-3 w-3 mr-1" />
              Import Key
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onVaultRestore}
              disabled={busy || vaultBusy}
            >
              <CloudDownload className="h-3 w-3 mr-1" />
              {vaultBusy ? "Restoring…" : "Restore from Vault"}
            </Button>
          </>
        )}
        {hasLocal && hasLocalSecret && (
          <Button type="button" variant="outline" size="sm" onClick={onExportKey}>
            <Copy className="h-3 w-3 mr-1" />
            Copy nsec
          </Button>
        )}
        {hasLocal && (
          <Button type="button" variant="outline" size="sm" onClick={onClearKey}>
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Key
          </Button>
        )}
        {hasLocal && !binding && (
          <Button asChild type="button" variant="default" size="sm">
            <Link to="/nostr-link">
              <LinkIcon className="h-3 w-3 mr-1" />
              Link Nostr Identity
            </Link>
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
              if (e.key === "Enter") submitImport();
            }}
            placeholder="nsec1… or 64-char hex"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={submitImport}
            disabled={busy || !importValue.trim()}
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

function BindingValue({
  binding,
  linkedToLocal,
  linkedToDifferent,
  isLoading,
}: {
  binding: BindingData | null;
  linkedToLocal: boolean;
  linkedToDifferent: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        Loading…
      </span>
    );
  }
  if (binding && linkedToLocal) {
    return (
      <span className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-green-500" />
        verified — this key
      </span>
    );
  }
  if (binding && linkedToDifferent) {
    return (
      <span className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-yellow-500" />
        verified — different key
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <XCircle className="h-3 w-3 text-muted-foreground" />
      not linked
    </span>
  );
}
