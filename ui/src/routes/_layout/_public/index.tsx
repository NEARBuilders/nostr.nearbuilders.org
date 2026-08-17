import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, MessageSquare, Radio, Sparkles } from "lucide-react";
import { getAccount, getActiveRuntime, getAppName, getRepository } from "@/app";
import { Button, Card, PageContainer } from "@/components";

export const Route = createFileRoute("/_layout/_public/")({
  loader: async ({ context }) => ({
    runtimeConfig: context.runtimeConfig,
  }),
  head: () => ({
    meta: [
      { title: "Welcome | Nostr NEAR Builders" },
      {
        name: "description",
        content:
          "NEAR-powered identity and decentralized comments on the Nostr protocol — link NEAR accounts to Nostr pubkeys and publish comments through public relays.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { runtimeConfig } = Route.useLoaderData();
  const appName = getAppName(runtimeConfig);
  const account = getAccount(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);
  const repository = getRepository(runtimeConfig);

  const accountId = runtime?.accountId ?? account;

  return (
    <PageContainer variant="wide">
      <div className="space-y-16">
        <section className="flex flex-col items-center gap-6 pt-12 pb-8 text-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {accountId}
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
              {appName}
            </h1>
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              NEAR accounts meet the open Nostr network — derive a Nostr identity from your NEAR
              session, bind it on-chain, and publish signed comments to public relays.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/nostr">
                Open the testbench
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/about">Learn more</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-foreground">NEAR ↔ Nostr identity</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Derive a Nostr pubkey from your NEAR session and bind it on-chain — one identity
              across both protocols.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <MessageSquare className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Decentralized comments</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Publish and read signed kind-1 comment events targeting builders, projects, scopes,
              and submissions — no central database required.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <Radio className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Relay native</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect through public relays like Damus, nos.lol, and Primal, with profiles and
              content resolved straight from the network.
            </p>
          </Card>
        </section>

        {repository && (
          <section className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">Fork this app and make it yours.</p>
            <Button asChild variant="outline">
              <a href={repository} target="_blank" rel="noopener noreferrer">
                {repository}
              </a>
            </Button>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
