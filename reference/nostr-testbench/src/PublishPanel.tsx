import { type NearNostrTargetType, StandardAdapter } from "near-nostr-sdk";
import { finalizeEvent } from "nostr-tools/pure";
import { useState } from "react";
import type { SignerState } from "./AuthPanel";
import { Log, type LogLine } from "./Log";

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

const TARGET_TYPES: NearNostrTargetType[] = ["builder", "project", "scope", "submission", "page"];

export function PublishPanel({ signerState }: { signerState: SignerState }) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [content, setContent] = useState("Hello from nostr-sdk testbench");
  const [target, setTarget] = useState("testbench");
  const [targetType, setTargetType] = useState<NearNostrTargetType>("project");
  const [loading, setLoading] = useState(false);

  const log = (text: string, cls = "") => setLogs((prev) => [...prev, { text, cls }]);

  const publish = async () => {
    if (signerState.mode === "none") return;
    setLogs([]);
    setLoading(true);
    try {
      const clientName = "nostr-testbench";
      const targetKey = `${targetType}:${target}`;
      const pubkey = signerState.pubkey;

      // Build tags matching StandardAdapter.query expectations:
      // query filters on #t: [targetType, clientName]
      // then client-side filters on near_target tag
      const tags: string[][] = [
        ["t", targetType], // relay-filterable: matches query #t filter
        ["t", clientName], // relay-filterable: matches query #t filter
        ["p", pubkey], // author
        ["client", clientName], // app tag
        ["near_target", targetKey], // client-side filter key
      ];

      log(`Publishing to "${targetKey}"...`, "dim");
      log(`Tags: ${JSON.stringify(tags)}`, "info");

      const template = {
        kind: 1,
        content,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      };

      let signed: { id: string; [key: string]: unknown };
      if (signerState.signer) {
        log("Signing with extension...", "warn");
        signed = await signerState.signer.signEvent(template);
      } else if (signerState.secretKey) {
        log("Signing with nsec...", "warn");
        signed = finalizeEvent(template, signerState.secretKey);
      } else {
        throw new Error("No signer");
      }

      log(`Signed: ${signed.id}`, "ok");
      const adapter = new StandardAdapter(DEFAULT_RELAYS);
      const result = await adapter.publishSigned(signed);

      log(`Published to relays:`, "ok");
      for (const [relay, ok] of result.statuses) {
        log(`  ${relay}: ${ok ? "ok" : "failed"}`, ok ? "" : "err");
      }
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>Publish (Kind 1)</h2>
      <div className="row">
        <label htmlFor="content">Content</label>
        <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="target">Target</label>
        <input id="target" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="target-type">Type</label>
        <select
          id="target-type"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as NearNostrTargetType)}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={signerState.mode === "none" || loading}
        onClick={publish}
      >
        {loading ? "Signing..." : "Publish"}
      </button>
      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}
