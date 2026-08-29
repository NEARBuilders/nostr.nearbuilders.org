import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAuthClient } from "@/app";
import { PageContainer } from "@/components/layout/page-container";
import { NostrComments } from "@/components/nostr/comments";
import { NostrIdentityCard } from "@/components/nostr/nostr-identity-card";
import { clearSession, generateAndStore, loadSession } from "@/lib/nostr";

const TARGET = { type: "project" as const, id: "test-nostr-page" };

export const Route = createFileRoute("/_layout/_authenticated/nostr")({
  head: () => ({
    meta: [{ title: "Nostr Testbench | app" }],
  }),
  component: NostrPage,
});

function NostrPage() {
  const auth = useAuthClient();
  const nearAccountId = auth.near.getAccountId();
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const session = useMemo(() => {
    if (!nearAccountId) return null;
    return loadSession(nearAccountId);
  }, [nearAccountId, refreshKey]);

  const handleGenerateKey = useCallback(() => {
    if (!nearAccountId) return;
    setGenerating(true);
    try {
      generateAndStore(nearAccountId);
      setRefreshKey((k) => k + 1);
    } finally {
      setGenerating(false);
    }
  }, [nearAccountId]);

  const handleClearKey = useCallback(() => {
    if (!nearAccountId) return;
    clearSession(nearAccountId);
    setRefreshKey((k) => k + 1);
  }, [nearAccountId]);

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            Nostr Testbench
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Nostr Comments
          </h1>
          <p className="text-muted-foreground text-sm">
            Publish and read Nostr-backed comments via public relays.
          </p>
        </header>

        {nearAccountId && (
          <NostrIdentityCard
            nearAccountId={nearAccountId}
            nostrPubkey={session?.pubkey ?? ""}
            hasBinding={false}
            hasLocalSession={!!session}
            onGenerateKey={handleGenerateKey}
            onClearKey={handleClearKey}
            generating={generating}
          />
        )}

        <NostrComments target={TARGET} key={refreshKey} />
      </div>
    </PageContainer>
  );
}
