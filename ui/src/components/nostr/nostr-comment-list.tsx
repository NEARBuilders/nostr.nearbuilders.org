import { Reply } from "lucide-react";
import { npubEncode } from "nostr-tools/nip19";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type CommentProfile = {
  name?: string | null;
  picture?: string | null;
  about?: string | null;
  nip05?: string | null;
  website?: string | null;
};

export type NostrCommentListItem = {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  parentEventId?: string | null;
  nearAccountId?: string | null;
  profile?: CommentProfile | null;
};

type Props = {
  comments: NostrCommentListItem[];
  loading: boolean;
  isError?: boolean;
  onReply?: (id: string, contentPreview: string) => void;
  onRetry?: () => void;
};

const npubShort = (hex: string): string => {
  if (!hex) return "—";
  try {
    const npub = npubEncode(hex);
    return npub.length > 14 ? `${npub.slice(0, 14)}…` : npub;
  } catch {
    return hex.length > 16 ? `${hex.slice(0, 16)}…` : hex;
  }
};

export function NostrCommentList({ comments, loading, isError = false, onReply, onRetry }: Props) {
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

  if (isError) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-muted-foreground">Failed to load comments.</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
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
      {comments.map((c) => {
        const profileName = c.profile?.name ?? npubShort(c.pubkey);
        const profilePic: string | undefined = c.profile?.picture ?? undefined;
        const fallback = (c.profile?.name ?? c.pubkey).slice(0, 2).toUpperCase();
        return (
          <div key={c.id} className="p-4 border border-border rounded-[10px] space-y-2 bg-card">
            <div className="flex items-center gap-2 flex-wrap">
              <Avatar className="w-6 h-6">
                <AvatarImage src={profilePic} />
                <AvatarFallback className="text-[10px]">{fallback}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground">{profileName}</span>
              {c.profile?.nip05 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {c.profile.nip05}
                </span>
              )}
              {c.nearAccountId && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {c.nearAccountId}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {new Date(c.createdAt * 1000).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {c.parentEventId && (
                <span className="font-mono">↳ reply to {c.parentEventId.slice(0, 12)}…</span>
              )}
              {onReply && (
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => onReply(c.id, c.content)}
                >
                  <Reply className="h-3 w-3" />
                  Reply
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
