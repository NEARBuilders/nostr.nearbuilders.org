import { useState } from "react";
import type { SignerState } from "./AuthPanel";
import { AuthPanel } from "./AuthPanel";
import { LinkPanel } from "./LinkPanel";
import { ListPanel } from "./ListPanel";
import { PublishPanel } from "./PublishPanel";
import { RawQueryPanel } from "./RawQueryPanel";
import { SignPanel } from "./SignPanel";

export function App() {
  const [signerState, setSignerState] = useState<SignerState>({
    mode: "none",
    signer: null,
    pubkey: "",
  });

  return (
    <div className="app">
      <header className="app-header">
        <h1>nostr-testbench</h1>
        {signerState.mode !== "none" && (
          <span className="badge ok">
            {signerState.pubkey.slice(0, 12)}... ({signerState.mode})
          </span>
        )}
      </header>
      <div className="grid">
        <AuthPanel onReady={setSignerState} />
        <PublishPanel signerState={signerState} />
        <ListPanel />
        <LinkPanel signerState={signerState} />
        <RawQueryPanel />
        <SignPanel signerState={signerState} />
      </div>
    </div>
  );
}
