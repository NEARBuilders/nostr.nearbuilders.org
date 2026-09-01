# @every-plugin/nostr

A `createPlugin` for the [everything.dev](https://github.com/nearbuilders/everything-dev) runtime that exposes Nostr ↔ NEAR identity bindings and relay-backed comment threads.

## What it provides

| Route group | Endpoints |
| --- | --- |
| NEAR → Nostr identity | `getPublicKey`, `listRelays`, `ping` |
| FastNear KV binding parity (V1) | `getBindingV1`, `getIdentityV1`, `createChallenge`, `verifyBinding`, `prepareBindingWrite` |
| Relay-backed comments (V1) | `listCommentsV1`, `createComment`, `listChannels`, `queryEvents`, `publishEvent`, `getProfileV1` |

Binding events are kind-27235 (NIP-99); comment events are kind-1111 + legacy kind-1 (standard) or kind-9 + channel meta events (buzz).

## Service architecture

```
BindingService          (src/services/binding.ts)
└── Effect.Service (Context.Tag) with Layer.effect over NostrConfigTag
    Reads FastNear KV via src/lib/fastnear-kv.ts

NostrCommentService     (src/services/nostr.ts)
└── Effect.Service with Layer.scoped + acquireRelease for buzz adapter lifecycle
    Consumes StandardAdapterService via Layer.provide

StandardAdapterService  (src/nostr-core/adapters/standard-service.ts)
└── Effect.Service with Layer.scoped + StandardAdapter close() finalizer
    Wraps nostr-tools SimplePool

BuzzAdapter             (src/nostr-core/adapters/buzz.ts)
└── Plain class, constructed by NostrCommentService when BUZZ_NSEC is configured
    NIP-42 relay auth + per-publish OK await
```

## Configuration

Variables (bos.config.json → plugin.dev.ts):

| Variable | Default | Notes |
| --- | --- | --- |
| `relays` | 3 public relays | Default relay pool for non-V1 paths |
| `clientName` | `nostr.nearbuilders.org` | Tag attached to published events |
| `STANDARD_RELAYS` | comma-separated URL list | V1-parity relay pool |
| `BUZZ_RELAYS` | `wss://nearbuilders.communities.buzz.xyz` | Buzz-specific relays |
| `KV_API_URL` | `https://kv.main.fastnear.com` | FastNear KV base URL |
| `BINDING_CONTRACT` | `contextual.near` | Contract account hosting the KV table |
| `CHALLENGE_EXPIRY_SECONDS` | `300` | TTL of a `bind:<account>:<expiry>:<label>` challenge |

Secrets:

| Secret | Required for | Format |
| --- | --- | --- |
| `BUZZ_NSEC` | buzz adapter | `nsec1...` or 64-char hex |

Misconfigured `BUZZ_NSEC` fails the plugin at initialize (fail-fast, not silent degradation).

## Development

```bash
bun install
bun run dev        # bos dev
bun test           # vitest, from the repo root via `bun run --cwd plugins/nostr test`
bun run typecheck
bun run lint
```

## Tests

`plugins/nostr/tests/` — 38 vitest tests covering key derivation, kind-27235 signing + tamper detection, KV read paths (mocked fetch), and challenge verification. Shared fixtures in `tests/helpers.ts`.

## Module structure

```
plugins/nostr/
├── src/
│   ├── contract.ts               ORPC routes (Zod inputs/outputs)
│   ├── index.ts                  createPlugin wiring + handlers
│   ├── lib/
│   │   ├── auth.ts               framework-owned, synced via bos sync
│   │   ├── context.ts            framework-owned, synced via bos sync
│   │   ├── fastnear-kv.ts        cfg-driven FastNear KV read client
│   │   ├── nostr-config.ts       Zod schemas + Context.Tag + resolveNostrConfig
│   │   └── schemas.ts            shared Zod schemas + z.infer for wire types
│   ├── nostr-core/
│   │   ├── adapters/             RelayAdapter implementations + standard-service.ts
│   │   ├── core.ts               nostr-tools SimplePool wrapper (vendored)
│   │   ├── signers/              LocalSigner (vendored)
│   │   └── types.ts              NostrEvent re-exported from nostr-tools/core
│   └── services/
│       ├── binding.ts            BindingService
│       ├── key-derivation.ts     NEAR-account-derived Nostr keys
│       └── nostr.ts              NostrCommentService
└── tests/
```
