import { CheckCircle2, Key, PlusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";

export function NostrIdentityCard({
  nearAccountId,
  nostrPubkey,
  hasBinding,
  hasLocalSession,
  onGenerateKey,
  onClearKey,
  generating,
}: {
  nearAccountId: string;
  nostrPubkey: string;
  hasBinding: boolean;
  hasLocalSession: boolean;
  onGenerateKey: () => void;
  onClearKey: () => void;
  generating: boolean;
}) {
  const hasKey = hasLocalSession || hasBinding;

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
          value={nostrPubkey ? `${nostrPubkey.slice(0, 16)}...` : "—"}
          mono
        />
        <InfoRow
          label="Binding"
          value={
            <span className="flex items-center gap-1">
              {hasBinding ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  verified
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-muted-foreground" />
                  not linked
                </>
              )}
            </span>
          }
        />
        <InfoRow
          label="Local Key"
          value={
            <span className="flex items-center gap-1">
              {hasLocalSession ? (
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

      <div className="flex gap-2">
        {!hasKey && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateKey}
            disabled={generating}
          >
            <PlusCircle className="h-3 w-3 mr-1" />
            {generating ? "Generating..." : "Generate Key"}
          </Button>
        )}
        {hasLocalSession && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearKey}
          >
            Clear Key
          </Button>
        )}
      </div>
    </div>
  );
}
