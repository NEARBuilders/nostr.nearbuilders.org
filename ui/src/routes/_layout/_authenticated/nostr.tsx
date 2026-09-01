import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, MessageSquare, RefreshCw, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { NostrCommentForm } from "@/components/nostr/nostr-comment-form";
import { NostrCommentList } from "@/components/nostr/nostr-comment-list";
import { NostrIdentityCard } from "@/components/nostr/nostr-identity-card";
import type { NearNostrTarget } from "@/lib/nostr";
import {
  clearSession,
  formatTargetString,
  generateAndStore,
  loadSession,
  parseTargetString,
  secretKeyBytes,
  signCommentEvent,
} from "@/lib/nostr";

const DEFAULT_TARGET = "project:test-nostr-page";

export const Route = createFileRoute("/_layout/_authenticated/nostr")({
  head: () => ({
    meta: [{ title: "Nostr | NEAR Builders" }],
  }),
  component: NostrPage,
});

function NostrPage() {
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const nearAccountId = auth.near.getAccountId();

  const [targetInput, setTargetInput] = useState(DEFAULT_TARGET);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [lastStatuses, setLastStatuses] = useState<Array<{ relay: string; success: boolean }>>([]);
  const [generating, setGenerating] = useState(false);

  const target: NearNostrTarget | null = useMemo(
    () => parseTargetString(targetInput),
    [targetInput],
  );

  const session = useMemo(() => {
    if (!nearAccountId) return null;
    return loadSession(nearAccountId);
  }, [nearAccountId]);

  const relaysQuery = useQuery({
    queryKey: ["nostr-relays"],
    queryFn: () => apiClient.nostr.listRelays(),
    staleTime: 60_000,
  });

  const commentsQuery = useQuery({
    queryKey: ["nostr-comments", target?.type ?? null, target?.id ?? null],
    queryFn: () => {
      if (!target) throw new Error("Invalid target");
      return apiClient.nostr.listComments({
        target: target.id,
        targetType: target.type,
        adapterType: "standard",
        enrich: true,
        limit: 50,
      });
    },
    enabled: !!target && !!nearAccountId,
    staleTime: 30_000,
  });

  const comments = commentsQuery.data?.data ?? [];

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["nostr-comments"] });
  }, [queryClient]);

  const handlePublish = useCallback(
    async (content: string, parentEventId?: string) => {
      if (!session || !nearAccountId || !target) return;
      const event = signCommentEvent({
        content,
        target,
        nearAccountId,
        secretKey: secretKeyBytes(session),
        ...(parentEventId ? { parentEventId } : {}),
      });
      const result = await apiClient.nostr.createComment({
        event,
        target: target.id,
        targetType: target.type,
        adapterType: "standard",
      });
      setLastStatuses(result.statuses);
      const successes = result.statuses.filter((s) => s.success).length;
      const total = result.statuses.length;
      if (successes === total) {
        toast.success(`Comment published to ${total} relay${total === 1 ? "" : "s"}`);
      } else if (successes > 0) {
        toast.warning(`Published to ${successes}/${total} relays`);
      } else {
        toast.error("Failed to publish comment to any relay");
      }
      setReplyTo(null);
      refresh();
    },
    [apiClient, nearAccountId, session, target, refresh],
  );

  const handleGenerateKey = useCallback(() => {
    if (!nearAccountId) return;
    setGenerating(true);
    try {
      generateAndStore(nearAccountId);
      toast.success("Nostr key generated");
      refresh();
    } finally {
      setGenerating(false);
    }
  }, [nearAccountId, refresh]);

  const handleClearKey = useCallback(() => {
    if (!nearAccountId) return;
    clearSession(nearAccountId);
    setReplyTo(null);
    toast.info("Local Nostr key cleared");
    refresh();
  }, [nearAccountId, refresh]);

  const handleReply = useCallback((id: string, preview: string) => {
    setReplyTo({ id, preview });
  }, []);

  const handleCancelReply = useCallback(() => setReplyTo(null), []);

  useEffect(() => {
    if (!commentsQuery.isError) return;
    toast.error("Failed to load comments", {
      description: commentsQuery.error instanceof Error ? commentsQuery.error.message : undefined,
    });
  }, [commentsQuery.isError, commentsQuery.error]);

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            Comments
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Nostr Comments
          </h1>
          <p className="text-muted-foreground text-sm">
            Publish and read Nostr-backed comments signed in your browser, relayed through public
            relays, linked to your NEAR identity.
          </p>
        </header>

        {nearAccountId && (
          <NostrIdentityCard
            nearAccountId={nearAccountId}
            nostrPubkey={session?.pubkey ?? ""}
            bindingQueryKey={["nostr-binding", nearAccountId]}
            onGenerateKey={handleGenerateKey}
            onClearKey={handleClearKey}
            generating={generating}
          />
        )}

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              Comments
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={commentsQuery.isFetching || !target}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>

          <RelayStatusPanel
            relays={relaysQuery.data?.relays ?? []}
            statuses={lastStatuses}
            loading={relaysQuery.isLoading}
          />

          <div className="space-y-2">
            <label
              htmlFor="nostr-target-input"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Target
            </label>
            <input
              id="nostr-target-input"
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder={DEFAULT_TARGET}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              format: <span className="font-mono">type:id</span> (e.g.{" "}
              <span className="font-mono">project:my-app</span> or{" "}
              <span className="font-mono">builder:alice.near</span>)
            </p>
          </div>

          {replyTo && session && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <div className="flex-1 space-y-1">
                <div className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                  Replying to
                </div>
                <div className="text-foreground line-clamp-2">{replyTo.preview}</div>
              </div>
              <button
                type="button"
                onClick={handleCancelReply}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cancel reply"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {session && target && (
            <NostrCommentForm
              onSubmit={handlePublish}
              loading={false}
              placeholder={`Comment on ${formatTargetString(target)}...`}
              replyTo={replyTo?.id}
            />
          )}

          <NostrCommentList
            comments={comments}
            loading={commentsQuery.isLoading}
            isError={commentsQuery.isError}
            onReply={handleReply}
            onRetry={refresh}
          />
        </Card>
      </div>
    </PageContainer>
  );
}

function RelayStatusPanel({
  relays,
  statuses,
  loading,
}: {
  relays: string[];
  statuses: Array<{ relay: string; success: boolean }>;
  loading: boolean;
}) {
  const statusByRelay = new Map(statuses.map((s) => [s.relay, s.success]));

  if (loading && relays.length === 0) {
    return (
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">Loading relays…</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="font-bold uppercase tracking-wider text-muted-foreground">Relays</span>
      {relays.map((relay) => {
        const status = statusByRelay.get(relay);
        return (
          <span
            key={relay}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono"
            title={
              status === undefined ? relay : `${relay} – ${status ? "ok" : "failed"} (last publish)`
            }
          >
            {status === undefined ? (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            ) : status ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            {relay.replace(/^wss:\/\//, "")}
          </span>
        );
      })}
    </div>
  );
}
