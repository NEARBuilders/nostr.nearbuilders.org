import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  CircleAlert,
  KeyRound,
  LinkIcon,
  Loader2,
  PenLine,
  Puzzle,
  Radio,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  loadSession,
  pollBinding,
  secretKeyBytes,
  signBindingEvent,
  submitBindingWrite,
} from "@/lib/nostr";

type Step = "challenge" | "submit" | "confirm" | "done";

const STEP_LABELS: Array<{ key: Step; label: string; icon: typeof PenLine }> = [
  { key: "challenge", label: "Sign binding challenge", icon: PenLine },
  { key: "submit", label: "Submit on-chain KV write", icon: Radio },
  { key: "confirm", label: "Wait for FastNear indexing", icon: Puzzle },
  { key: "done", label: "Identity linked", icon: Check },
];

export const Route = createFileRoute("/_layout/_authenticated/nostr-link")({
  head: () => ({ meta: [{ title: "Link Nostr Identity | NEAR Builders" }] }),
  component: NostrLinkPage,
});

function NostrLinkPage() {
  const authClient = useAuthClient();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const nearAccountId = authClient.near.getAccountId();
  const session = nearAccountId ? loadSession(nearAccountId) : null;

  const [activeStep, setActiveStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundNpub, setBoundNpub] = useState<string | null>(null);

  const handleLink = useCallback(async () => {
    if (!session || !nearAccountId) return;
    setError(null);
    setBoundNpub(null);
    try {
      setActiveStep("challenge");
      const { challenge } = await apiClient.nostr.createChallenge({});
      const signed = signBindingEvent({
        challenge,
        nearAccountId,
        secretKey: secretKeyBytes(session),
      });
      const verified = await apiClient.nostr.verifyBinding({
        event: {
          id: signed.id,
          pubkey: signed.pubkey,
          content: signed.content,
          tags: signed.tags,
          created_at: signed.created_at,
          sig: signed.sig,
        },
      });
      if (!verified.valid) {
        throw new Error("Binding challenge verification failed");
      }

      const relays = await apiClient.nostr.listRelays();
      const tx = await apiClient.nostr.prepareBindingWrite({
        nostrPubkey: verified.nostrPubkey,
        relay: relays.relays[0] ?? "",
        proof: verified.proof,
      });

      setActiveStep("submit");
      await submitBindingWrite(authClient, tx, nearAccountId);

      setActiveStep("confirm");
      const binding = await pollBinding(apiClient, nearAccountId);
      if (!binding) {
        throw new Error(
          "Transaction confirmed but the binding is not indexed yet — try again in a moment",
        );
      }

      setBoundNpub(binding.npub);
      setActiveStep("done");
      await queryClient.invalidateQueries({ queryKey: ["nostr-binding"] });
      toast.success("Nostr identity linked");
    } catch (e) {
      setActiveStep(null);
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error("Linking failed", { description: message });
    }
  }, [apiClient, authClient, nearAccountId, queryClient, session]);

  const running = activeStep !== null && activeStep !== "done";

  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <LinkIcon className="h-3 w-3" />
            Link Nostr Identity
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Bind your Nostr key to this NEAR account
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Proves ownership of a Nostr key by signing a server-issued challenge, then writes the
            binding on-chain (FastNear KV) with your NEAR wallet. The transaction signer must be
            this account — bindings are indexed by transaction predecessor.
          </p>
        </header>

        {!nearAccountId && (
          <Notice
            icon={CircleAlert}
            title="NEAR account required"
            body="Connect a NEAR wallet and sign in before linking a Nostr identity."
          />
        )}

        {nearAccountId && !session && (
          <Notice
            icon={KeyRound}
            title="No local Nostr key"
            body="Generate a Nostr key on the Nostr page first — that key is the identity being bound."
          >
            <Button asChild type="button" variant="outline" size="sm">
              <Link to="/nostr">Go to Nostr page</Link>
            </Button>
          </Notice>
        )}

        {nearAccountId && session && (
          <div className="space-y-4">
            <ol className="space-y-2">
              {STEP_LABELS.map(({ key, label, icon: Icon }) => {
                const stepIndex = STEP_LABELS.findIndex((s) => s.key === key);
                const activeIndex = activeStep
                  ? STEP_LABELS.findIndex((s) => s.key === activeStep)
                  : -1;
                const done =
                  activeStep === "done" || (activeIndex > stepIndex && activeIndex !== -1);
                const active = activeStep === key;
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-3 rounded-[10px] border p-3 ${
                      active
                        ? "border-ring bg-muted/40"
                        : done
                          ? "border-border bg-card"
                          : "border-border bg-card opacity-70"
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center">
                      {active ? (
                        <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                      ) : done ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="text-sm text-foreground">{label}</span>
                    <span className="ml-auto text-[11px] font-mono text-muted-foreground">
                      {done || active ? `step ${stepIndex + 1}/4` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>

            {error && (
              <div className="flex items-start gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <CircleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <p className="text-foreground">Linking failed</p>
                  <p className="font-mono text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            )}

            {activeStep === "done" && boundNpub ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card p-4">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm text-foreground">
                  Linked as <span className="font-mono text-xs">{boundNpub}</span>
                </span>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to="/nostr">Back to Nostr</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handleLink} disabled={running} size="sm">
                  {running ? "Linking…" : "Link Nostr identity"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Your wallet will prompt once to sign the transaction (≈0.01 NEAR storage + gas).
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function Notice({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof CircleAlert;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-border bg-card p-4">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  );
}
