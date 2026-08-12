import { NearConnector } from "@hot-labs/near-connect";
import { NearNostr } from "near-nostr-sdk";
import { finalizeEvent } from "nostr-tools/pure";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SignerState } from "./AuthPanel";
import { Log, type LogLine } from "./Log";

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

export function LinkPanel({ signerState }: { signerState: SignerState }) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [account, setAccount] = useState("");
  const [linkStep, setLinkStep] = useState<"idle" | "challenge" | "signed" | "bound">("idle");
  const [challenge, setChallenge] = useState("");
  const [bindingArgs, setBindingArgs] = useState<{
    contract: string;
    method: string;
    args: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const connectorRef = useRef<NearConnector | null>(null);

  const log = useCallback(
    (text: string, cls = "") => setLogs((prev) => [...prev, { text, cls }]),
    [],
  );

  const nn = new NearNostr({ relays: DEFAULT_RELAYS });

  // Init connector once
  useEffect(() => {
    if (connectorRef.current) return;
    const connector = new NearConnector({ network: "mainnet" });
    connectorRef.current = connector;

    connector.on("wallet:signIn", async ({ accounts, success }) => {
      if (success && accounts.length) {
        const acc = accounts[0].accountId;
        setAccount(acc);
        log(`Wallet connected: ${acc}`, "ok");
      }
    });

    connector.on("wallet:signOut", () => {
      log("Wallet disconnected", "warn");
    });

    // Check existing session
    connector
      .wallet()
      .then((w) => w.getAccounts())
      .then((accts) => {
        if (accts.length) {
          setAccount(accts[0].accountId);
          log(`Wallet session: ${accts[0].accountId}`, "dim");
        }
      })
      .catch(() => {});
  }, [log]);

  // Step 1: Generate challenge
  const generateChallenge = () => {
    if (!account || signerState.mode === "none") return;
    setLogs([]);
    const { challenge: ch, expiresAt } = nn.createBindingChallenge(account);
    log(`Challenge generated (5min TTL):`, "dim");
    log(`  ${ch}`, "info");
    log(`  expires: ${new Date(expiresAt * 1000).toISOString()}`, "dim");
    setChallenge(ch);
    setLinkStep("challenge");
  };

  // Step 2: Sign the challenge with Nostr key + build KV args
  const signChallenge = async () => {
    if (!challenge || signerState.mode === "none") return;
    setLoading(true);
    try {
      const template = nn.buildBindingEventTemplate({
        nostrPubkey: signerState.pubkey,
        challenge,
      });
      log(`Signing kind ${template.kind} binding event...`, "warn");

      let signed: { id: string; [key: string]: unknown };
      if (signerState.signer) {
        signed = await signerState.signer.signEvent(template);
      } else if (signerState.secretKey) {
        signed = finalizeEvent(template, signerState.secretKey);
      } else {
        throw new Error("No signer available");
      }

      log(`Signed: ${signed.id.slice(0, 20)}...`, "ok");

      const verified = nn.verifyBindingEvent(signed);
      log(`Verified OK:`, "ok");
      log(`  NEAR: ${verified.nearAccountId}`, "");
      log(`  Nostr: ${verified.nostrPubkey}`, "");
      log(`  Client: ${verified.clientName}`, "dim");

      const args = nn.buildBindingArgs({
        nearAccountId: verified.nearAccountId,
        nostrPubkey: verified.nostrPubkey,
        proof: signed.id,
      });
      log(`KV write args ready:`, "ok");
      log(`  contract: ${args.contract}`, "dim");
      log(`  method: ${args.method}`, "dim");
      log(`  key: nostr/${verified.nearAccountId}`, "dim");
      setBindingArgs(args);
      setLinkStep("signed");
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Connect NEAR wallet + send tx via near-connect
  const connectAndSend = async () => {
    if (!bindingArgs || !connectorRef.current) return;
    setLoading(true);
    try {
      const connector = connectorRef.current;

      // Connect if needed
      let wallet:
        | Awaited<ReturnType<typeof connector.wallet>>
        | Awaited<ReturnType<typeof connector.connect>>;
      try {
        wallet = await connector.wallet();
        const accts = await wallet.getAccounts();
        if (!accts.length) throw new Error("no session");
      } catch {
        log("Connecting NEAR wallet...", "warn");
        wallet = await connector.connect();
      }

      const accts = await wallet.getAccounts();
      const accId = accts[0]?.accountId ?? "";
      log(`Signed in: ${accId}`, "ok");

      log(`Sending tx to ${bindingArgs.contract}.${bindingArgs.method}...`, "warn");

      const outcome = await wallet.signAndSendTransaction({
        receiverId: bindingArgs.contract,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: bindingArgs.method,
              args: bindingArgs.args,
              gas: "100000000000000",
              deposit: "10000000000000000000000", // 0.01 NEAR for storage
            },
          },
        ],
      });

      const success = (outcome as any)?.status?.SuccessValue !== undefined;
      if (success) {
        log("TX SUCCESS", "ok");
        const txHash = (outcome as any)?.transaction?.hash || "see above";
        log(`  hash: ${txHash}`, "");
        setLinkStep("bound");
      } else {
        log(`TX may have failed — check wallet`, "warn");
      }
    } catch (e: any) {
      const msg = e?.message ?? e?.toString?.() ?? "unknown";
      if (msg.includes("User rejected") || e?.code === "USER_REJECTED") {
        log("Wallet rejected", "warn");
      } else {
        log(`Error: ${msg}`, "err");
      }
    } finally {
      setLoading(false);
    }
  };

  // Read-only: check existing binding
  const checkBinding = async () => {
    if (!account) return;
    setLogs([]);
    setLoading(true);
    try {
      log(`Checking binding for "${account}"...`, "dim");
      const identity = await nn.getIdentity(account);
      if (identity) {
        log("BOUND", "ok");
        log(`  nostr: ${identity.nostrPubkey}`, "");
        if (identity.profile?.name) log(`  name: ${identity.profile.name}`, "dim");
        if (identity.relay) log(`  relay: ${identity.relay}`, "dim");
        setLinkStep("bound");
      } else {
        log(`No binding found for ${account}`, "warn");
        setLinkStep("idle");
      }
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const isReady = signerState.mode !== "none" && account;
  const isBound = linkStep === "bound";

  return (
    <div className="panel">
      <h2>Link NEAR ↔ Nostr</h2>
      <div className="row">
        <label htmlFor="near-account">NEAR Account</label>
        <input
          id="near-account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="jemartel.near"
        />
      </div>

      {isBound ? (
        <button type="button" className="btn" onClick={checkBinding} disabled={loading}>
          {loading ? "Checking..." : "Re-check"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn primary"
            disabled={!isReady || loading}
            onClick={generateChallenge}
          >
            1. Challenge
          </button>
          <button
            type="button"
            className="btn"
            disabled={linkStep !== "challenge" || loading}
            onClick={signChallenge}
          >
            2. Sign
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={linkStep !== "signed" || loading}
            onClick={connectAndSend}
          >
            3. Wallet
          </button>
          <button
            type="button"
            className="btn"
            disabled={!account || loading}
            onClick={checkBinding}
          >
            Check
          </button>
        </div>
      )}

      {!isReady && !isBound && (
        <p style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
          Auth a Nostr key + enter NEAR account
        </p>
      )}

      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}
