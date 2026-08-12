import { type NearNostrTargetType, StandardAdapter } from "near-nostr-sdk";
import { useState } from "react";
import { Log, type LogLine } from "./Log";

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

const TARGET_TYPES: NearNostrTargetType[] = ["builder", "project", "scope", "submission", "page"];

export function ListPanel() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [target, setTarget] = useState("testbench");
  const [targetType, setTargetType] = useState<NearNostrTargetType>("project");
  const [loading, setLoading] = useState(false);

  const log = (text: string, cls = "") => setLogs((prev) => [...prev, { text, cls }]);

  const fetchComments = async () => {
    setLogs([]);
    setLoading(true);
    try {
      // target must match near_target tag format: "type:slug"
      const targetKey = `${targetType}:${target}`;
      log(`Fetching for "${targetKey}"...`, "dim");

      const adapter = new StandardAdapter(DEFAULT_RELAYS);
      const { events } = await adapter.query({
        target: targetKey,
        targetType,
        clientName: "nostr-testbench",
        limit: 20,
      });

      log(`Found ${events.length} events`, events.length > 0 ? "ok" : "warn");
      for (const e of events) {
        log(`[${e.kind}] ${e.id?.slice(0, 12)}... ${e.content?.slice(0, 80)}`, "ok");
        log(`  pubkey: ${e.pubkey}`, "dim");
        log(`  created: ${new Date(e.created_at * 1000).toISOString()}`, "dim");
      }
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>List Comments</h2>
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
      <button type="button" className="btn primary" disabled={loading} onClick={fetchComments}>
        {loading ? "Fetching..." : "Fetch"}
      </button>
      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}
