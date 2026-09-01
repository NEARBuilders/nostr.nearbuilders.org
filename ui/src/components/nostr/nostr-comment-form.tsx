import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NostrCommentForm({
  onSubmit,
  loading,
  placeholder,
  replyTo,
}: {
  onSubmit: (content: string, parentEventId?: string) => Promise<void>;
  loading: boolean;
  placeholder?: string;
  replyTo?: string;
}) {
  const [content, setContent] = useState("");

  useEffect(() => {
    setContent("");
  }, [replyTo]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await onSubmit(trimmed, replyTo);
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={replyTo ? "Write a reply..." : (placeholder ?? "Write a comment...")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        disabled={loading}
        className="w-full resize-none"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || loading}
          size="sm"
        >
          {replyTo ? (loading ? "Replying…" : "Reply") : loading ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
