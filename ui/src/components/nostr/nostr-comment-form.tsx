import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NostrCommentForm({
  onSubmit,
  loading,
  placeholder,
}: {
  onSubmit: (content: string) => Promise<void>;
  loading: boolean;
  placeholder?: string;
}) {
  const [content, setContent] = useState("");

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content.trim());
    setContent("");
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={placeholder ?? "Write a comment..."}
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
          {loading ? "Publishing..." : "Publish"}
        </Button>
      </div>
    </div>
  );
}
