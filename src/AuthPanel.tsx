import { useEffect, useState } from "react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { hexToBytes, bytesToHex } from "nostr-tools/utils";
import { finalizeEvent } from "nostr-tools/pure";
import { ExtensionSigner, type WindowNostr, type NostrSigner } from "near-nostr-sdk";
import { Log } from "./Log";

type LogLine = { text: string; cls: string };

export type SignerMode = "none" | "extension" | "nsec";
export type SignerState = {
  mode: SignerMode;
  signer: NostrSigner | null;
  pubkey: string;
  secretKey?: Uint8Array;
};

const LS_KEY = "nostr-testbench:session";

function loadSession(): SignerState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { mode: "none", signer: null, pubkey: "" };
    const p = JSON.parse(raw);
    if (p.mode === "nsec" && p.secretKeyHex) {
      const sk = hexToBytes(p.secretKeyHex);
      const pk = getPublicKey(sk);
      return { mode: "nsec", signer: null, pubkey: pk, secretKey: sk };
    }
    if (p.mode === "extension" && p.pubkey) {
      return { mode: "extension", signer: null, pubkey: p.pubkey };
    }
  } catch {}
  return { mode: "none", signer: null, pubkey: "" };
}

function saveSession(state: SignerState) {
  try {
    if (state.mode === "nsec" && state.secretKey) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        mode: "nsec",
        secretKeyHex: bytesToHex(state.secretKey),
        pubkey: state.pubkey,
      }));
    } else if (state.mode === "extension" && state.pubkey) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        mode: "extension",
        pubkey: state.pubkey,
      }));
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {}
}

export function AuthPanel({ onReady }: { onReady: (state: SignerState) => void }) {
  const [state, setState] = useState<SignerState>(loadSession);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [nsecInput, setNsecInput] = useState("");
  const [nip07Available, setNip07Available] = useState(false);
  const [loading, setLoading] = useState(false);

  const log = (text: string, cls = "") =>
    setLogs((prev) => [...prev, { text, cls }]);

  // Check for NIP-07 extension on mount + delayed poll for Firefox
  useEffect(() => {
    const check = () => {
      const win = window as any;
      setNip07Available(!!(win.nostr || win.nostrWallet));
    };
    check();
    const t1 = setTimeout(check, 1000);
    const t2 = setTimeout(check, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Restore extension signer if session persisted
  useEffect(() => {
    if (state.mode === "extension" && state.pubkey && !state.signer) {
      const win = window as any;
      const ext = (win.nostr || win.nostrWallet) as WindowNostr | undefined;
      if (ext) {
        const signer = new ExtensionSigner(ext);
        const updated = { ...state, signer };
        setState(updated);
        onReady(updated);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtensionLogin = async () => {
    setLoading(true);
    log("Connecting to extension...", "dim");
    try {
      const win = window as any;
      const ext = (win.nostr || win.nostrWallet) as WindowNostr | undefined;
      if (!ext) throw new Error("No NIP-07 extension found");
      const signer = new ExtensionSigner(ext);
      const pk = await signer.getPublicKey();
      log(`Connected: ${pk.slice(0, 16)}...`, "ok");
      const newState: SignerState = { mode: "extension", signer, pubkey: pk };
      setState(newState);
      saveSession(newState);
      onReady(newState);
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const handleNsecLogin = () => {
    setLoading(true);
    log("Importing key...", "dim");
    try {
      let sk: Uint8Array;
      if (nsecInput.startsWith("nsec")) {
        const decoded = nip19.decode(nsecInput);
        if (decoded.type !== "nsec") throw new Error("Not an nsec key");
        sk = decoded.data as Uint8Array;
      } else {
        sk = hexToBytes(nsecInput);
      }
      const pk = getPublicKey(sk);
      const nsec = nip19.nsecEncode(sk);
      log(`Imported: ${pk.slice(0, 16)}...`, "ok");
      log(`nsec: ${nsec}`, "warn");
      const newState: SignerState = { mode: "nsec", signer: null, pubkey: pk, secretKey: sk };
      setState(newState);
      saveSession(newState);
      onReady(newState);
    } catch (e: any) {
      log(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    setLoading(true);
    log("Generating new keypair...", "dim");
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const nsec = nip19.nsecEncode(sk);
    log(`Generated: ${pk.slice(0, 16)}...`, "ok");
    log(`nsec: ${nsec}`, "warn");
    const newState: SignerState = { mode: "nsec", signer: null, pubkey: pk, secretKey: sk };
    setState(newState);
    saveSession(newState);
    onReady(newState);
    setLoading(false);
  };

  const disconnect = () => {
    const newState: SignerState = { mode: "none", signer: null, pubkey: "" };
    setState(newState);
    saveSession(newState);
    setLogs([]);
  };

  // Build a unified sign function from whatever mode we're in
  const signEvent = async (template: { kind: number; content: string; tags: string[][]; created_at: number }) => {
    if (state.mode === "extension" && state.signer) {
      return state.signer.signEvent(template);
    }
    if (state.mode === "nsec" && state.secretKey) {
      return finalizeEvent(template, state.secretKey);
    }
    throw new Error("No signer available");
  };

  return (
    <div className="panel">
      <h2>Nostr Auth</h2>
      {state.mode !== "none" ? (
        <>
          <div className="status">
            <span className="badge green">{state.mode}</span>
            <span className="dim" style={{ fontSize: 11 }}>{state.pubkey.slice(0, 20)}...</span>
          </div>
          <button className="btn danger" onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button className="btn primary" disabled={!nip07Available || loading} onClick={handleExtensionLogin}>
              Extension
            </button>
            <button className="btn" disabled={loading} onClick={handleGenerate}>
              Generate
            </button>
            <button className="btn" disabled={!nsecInput.trim() || loading} onClick={handleNsecLogin}>
              Import
            </button>
          </div>
          {!nip07Available && <p style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>No NIP-07 extension detected — try Generate or Import</p>}
          <input placeholder="nsec1... or hex" value={nsecInput} onChange={(e) => setNsecInput(e.target.value)} />
        </>
      )}
      <hr className="sep" />
      <Log lines={logs} />
    </div>
  );
}

