import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { NearNostrComment } from "@/lib/nostr";

export function NostrCommentList({
  comments,
  loading,
}: {
  comments: NearNostrComment[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 border border-border rounded-[10px] space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="text-muted-foreground text-sm text-center py-8">
        No comments yet. Be the first!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.eventId} className="p-4 border border-border rounded-[10px] space-y-2 bg-card">
          <div className="flex items-center gap-2">
            <Avatar className="w-6 h-6">
              <AvatarImage src={c.profile?.picture} />
              <AvatarFallback className="text-[10px]">
                {(c.profile?.name ?? c.pubkey).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground">
              {c.profile?.name ?? `${c.pubkey.slice(0, 12)}...`}
            </span>
            {c.nearAccountId && (
              <span className="text-[11px] text-muted-foreground font-mono">{c.nearAccountId}</span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto">
              {new Date(c.createdAt * 1000).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
          {c.parentId && (
            <div className="text-[11px] text-muted-foreground">
              reply to {c.parentId.slice(0, 12)}...
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
