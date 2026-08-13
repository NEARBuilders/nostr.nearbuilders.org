import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAuthClient } from "@/app";
import { Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { NostrCommentForm } from "@/components/nostr/nostr-comment-form";
import { NostrCommentList } from "@/components/nostr/nostr-comment-list";
import { NostrIdentityCard } from "@/components/nostr/nostr-identity-card";
import {
  clearSession,
  generateAndStore,
  listComments,
  loadSession,
  publishComment,
  secretKeyBytes,
} from "@/lib/nostr";

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
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const session = useMemo(() => {
    if (!nearAccountId) return null;
    return loadSession(nearAccountId);
  }, [nearAccountId, refreshKey]);

  const {
    data: comments = [],
    isLoading: commentsLoading,
    refetch,
  } = useQuery({
    queryKey: ["nostr-comments", TARGET.type, TARGET.id, refreshKey],
    queryFn: () => listComments({ target: TARGET, limit: 50 }),
    staleTime: 30_000,
  });

  const handlePublish = useCallback(
    async (content: string) => {
      if (!session || !nearAccountId) return;
      setPublishing(true);
      try {
        await publishComment({
          target: TARGET,
          content,
          secretKey: secretKeyBytes(session),
          nearAccountId,
        });
        setRefreshKey((k) => k + 1);
      } finally {
        setPublishing(false);
      }
    },
    [session, nearAccountId],
  );

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

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              Comments
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Refresh
            </button>
          </div>

          {session && (
            <NostrCommentForm
              onSubmit={handlePublish}
              loading={publishing}
              placeholder={`Comment on ${TARGET.type}:${TARGET.id}...`}
            />
          )}

          <NostrCommentList comments={comments} loading={commentsLoading} />
        </Card>
      </div>
    </PageContainer>
  );
}
