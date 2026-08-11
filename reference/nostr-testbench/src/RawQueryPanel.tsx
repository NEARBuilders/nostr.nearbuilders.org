import { useState } from "react";
import { NostrCore } from "near-nostr-sdk";
import { Log } from "./Log";

type LogLine = { text: string; cls: string };

export function RawQueryPanel() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState('{"kinds":[1],"limit":5}');
  const [relays, setRelays] = useState("wss://relay.damus.io,wss://nos.lol");
  const [loading, setLoading] = useState(false);

  const log = (text: string, cls = "") =>
    setLogs((prev) => [...prev, { text, cls }]);

  const query = async () => {
    setLogs([]);
    setLoading(true);
    try {
      const parsed = JSON.parse(filter);
      const relayList = relays.split(",").map((r) => r.trim());

      log(`Querying ${relayList.length} relays...`, "dim");
      log(`Filter: ${JSON.stringify(parsed)}`, "info");

      const core = new NostrCore({ relays: relayList });
      const events = await core.queryEvents({ filters: parsed });

      log(`Got ${events.length} events`, "ok");
      for (const e of events) {
        log(``, "");
        log(`[${e.kind}] ${e.id?.slice(0, 12)}... ${e.content?.slice(0, 60)}`, "ok");
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
      <h2>Raw Relay Query</h2>
      <div className="row"><label>Filter (JSON)</label><textarea value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      <div className="row"><label>Relays</label><input value={relays} onChange={(e) => setRelays(e.target.value)} /></div>
      <button className="btn primary" disabled={loading} onClick={query}>
        {loading ? "Querying..." : "Query"}
      </button>
      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}
