import { useState } from "react";
import { type SignerState } from "./AuthPanel";
import { Log, type LogLine } from "./Log";

export function SignPanel({ signerState }: { signerState: SignerState }) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [kind, setKind] = useState(1);
  const [content, setContent] = useState("testbench sign test");
  const [tags, setTags] = useState('[["t","test"]]');
  const [loading, setLoading] = useState(false);

  const log = (text: string, cls = "") =>
    setLogs((prev) => [...prev, { text, cls }]);

  const sign = async () => {
    if (signerState.mode === "none") return;
    setLogs([]);
    setLoading(true);
    try {
      log(`Signing kind ${kind} event...`, "dim");

      let parsedTags: string[][] = [];
      try { parsedTags = JSON.parse(tags); } catch {}

      const template = {
        kind,
        content,
        created_at: Math.floor(Date.now() / 1000),
        tags: parsedTags,
      };

      let signed;
      if (signerState.signer) {
        signed = await signerState.signer.signEvent(template);
      } else if (signerState.secretKey) {
        const { finalizeEvent } = await import("nostr-tools/pure");
        signed = finalizeEvent(template, signerState.secretKey);
      } else {
        throw new Error("No signer");
      }

      log("SIGNED", "ok");
      log(`  id: ${signed.id}`, "");
      log(`  pubkey: ${signed.pubkey}`, "");
      log(`  sig: ${signed.sig}`, "dim");
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>Sign Event</h2>
      <div className="row"><label>Kind</label><input type="number" value={kind} onChange={(e) => setKind(parseInt(e.target.value) || 1)} /></div>
      <div className="row"><label>Content</label><textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
      <div className="row"><label>Tags (JSON)</label><input value={tags} onChange={(e) => setTags(e.target.value)} /></div>
      <button className="btn primary" disabled={signerState.mode === "none" || loading} onClick={sign}>
        {loading ? "Approve..." : "Sign"}
      </button>
      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}
