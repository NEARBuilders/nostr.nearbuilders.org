import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Import,
  Key,
  KeyRound,
  LinkIcon,
  Puzzle,
  Trash2,
  XCircle,
} from "lucide-react";
import { npubEncode } from "nostr-tools/nip19";
import { useState } from "react";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import type { NostrSession } from "@/lib/nostr";

type BindingData = {
  npub: string;
  relay: string;
  proof: string;
  boundAt: number;
};

const SOURCE_LABEL: Record<NostrSession["source"], string> = {
  generated: "generated (local)",
  imported: "imported (local)",
  extension: "NIP-07 extension",
};

type Props = {
  nearAccountId: string;
  session: NostrSession | null;
  bindingQueryKey: [string, string];
  onConnectExtension: () => void;
  onGenerateKey: () => void;
  onImportKey: (secret: string) => void;
  onExportKey: () => void;
  onClearKey: () => void;
  busy: boolean;
};

export function NostrIdentityCard({
  nearAccountId,
  session,
  bindingQueryKey,
  onConnectExtension,
  onGenerateKey,
  onImportKey,
  onExportKey,
  onClearKey,
  busy,
}: Props) {
  const apiClient = useApiClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");

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
            type="password"
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitImport();
            }}
            placeholder="nsec1… or 64-char hex"
            autoFocus
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
