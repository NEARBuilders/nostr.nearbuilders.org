import { createFileRoute } from "@tanstack/react-router";
import { Link as LinkIcon } from "lucide-react";
import { Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_layout/_authenticated/nostr-link")({
  head: () => ({ meta: [{ title: "Link Nostr Identity | NEAR Builders" }] }),
  component: NostrLinkPage,
});

function NostrLinkPage() {
  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <LinkIcon className="h-3 w-3" />
            Link Nostr Identity
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Sign with your Nostr key to bind it to this NEAR account
          </h1>
          <p className="text-muted-foreground text-sm">
            Bind a Nostr key (must already be generated on the Nostr page) to this NEAR account via
            an on-chain FastNear KV record. Signing the binding challenge proves ownership of the
            Nostr private key for this NEAR account.
          </p>
        </header>
        <Card className="p-6 space-y-3 text-sm text-muted-foreground">
          <p>
            This flow lands in a follow-up release (ticket #11). Today, the Link Nostr Identity
            button on the Nostr page is in place so you can navigate here; the on-chain binding UI
            itself is not wired yet.
          </p>
          <p>
            In the meantime you can still generate a key, publish comments via the plugin API, and
            verify your local key matches once the binding becomes live.
          </p>
        </Card>
      </div>
    </PageContainer>
  );
}
