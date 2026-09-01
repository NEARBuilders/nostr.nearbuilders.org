import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Key, LinkIcon, PlusCircle, XCircle } from "lucide-react";
import { npubEncode } from "nostr-tools/nip19";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";

type BindingData = {
  npub: string;
  relay: string;
  proof: string;
  boundAt: number;
};

type Props = {
  nearAccountId: string;
  nostrPubkey: string;
  bindingQueryKey: [string, string];
  onGenerateKey: () => void;
  onClearKey: () => void;
  generating: boolean;
};

export function NostrIdentityCard({
  nearAccountId,
  nostrPubkey,
  bindingQueryKey,
  onGenerateKey,
  onClearKey,
  generating,
}: Props) {
  const apiClient = useApiClient();

  const bindingQuery = useQuery({
    queryKey: bindingQueryKey,
    queryFn: () => apiClient.nostr.getBindingV1({ nearAccountId }),
    enabled: !!nearAccountId,
    staleTime: 60_000,
  });

  const npubFromHex = (hex: string) =>
    hex ? `${npubEncode(hex).slice(0, "npub1".length + 16)}…` : "—";

  const localPubkey = nostrPubkey;
  const binding = bindingQuery.data ?? null;
  const linkedToLocal = binding?.npub === localPubkey && !!localPubkey;
  const linkedToDifferent = !!binding && !linkedToLocal;
  const hasLocal = !!localPubkey;
  const isLinking = bindingQuery.isLoading && !bindingQuery.data;

  return (
    <div className="p-6 border border-border rounded-[10px] space-y-4 bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
        <Key className="h-3 w-3" />
        Nostr Identity
      </div>

      <div className="space-y-2">
        <InfoRow label="NEAR Account" value={nearAccountId} mono />
        <InfoRow label="Nostr Pubkey (local)" value={npubFromHex(localPubkey)} mono />
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
        <InfoRow
          label="Local Key"
          value={
            <span className="flex items-center gap-1">
              {hasLocal ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  stored
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-muted-foreground" />
                  none
                </>
              )}
            </span>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {!hasLocal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateKey}
            disabled={generating}
          >
            <PlusCircle className="h-3 w-3 mr-1" />
            {generating ? "Generating…" : "Generate Key"}
          </Button>
        )}
        {hasLocal && (
          <Button type="button" variant="outline" size="sm" onClick={onClearKey}>
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
