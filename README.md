<!-- markdownlint-disable MD014 -->
<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD029 -->

<div align="center">

<h1 style="font-size: 4.25rem; font-weight: 800; line-height: 1; margin: 0;">Nostr NEAR Builders</h1>

<img src="ui/src/assets/under-construction.gif" alt="Nostr NEAR Builders" width="380" />

</div>

NEAR-powered identity and decentralized comments on the [Nostr](https://nostr.com/) protocol, deployed at [nostr.nearbuilders.org](https://nostr.nearbuilders.org).

This is a child project of the [everything.dev](https://github.com/nearbuilders/everything-dev) runtime platform. It extends the `dev.everything.near` runtime (`bos://dev.everything.near/dev.everything.dev`) and composes a host, UI, API, and a `nostr` plugin through a single published `bos.config.json` — all configurations are on-chain, inspectable, and verifiable on NEAR.

## What it does

- **NEAR ↔ Nostr identity** — derive a Nostr pubkey from a NEAR session and store an on-chain binding between a NEAR account and a Nostr pubkey.
- **Decentralized comments** — publish signed kind-1 comment events to public relays and list replies targeting builders, projects, scopes, and submissions — no central database required.
- **Relay native** — connect through public relays (Damus, nos.lol, Primal), with kind-0 profile resolution straight from the network.

## Architecture

The `nostr` plugin (`plugins/nostr`) is a Module Federation remote exposing a typed oRPC contract:

| Endpoint | Description |
| --- | --- |
| `getPublicKey` | Derive the user's Nostr pubkey from their NEAR session |
| `createBinding` / `getBinding` / `deleteBinding` | Manage NEAR ↔ Nostr bindings |
| `getIdentity` | Resolve a NEAR account to its Nostr identity |
| `publishComment` | Create and publish a signed kind-1 comment event |
| `listComments` | List comments for a target, enriched with profiles |
| `getProfile` | Fetch a Nostr kind-0 profile |
| `listRelays` | List the configured relays |
| `ping` | Health check |

The UI (`ui/src`) also ships a client-side Nostr layer (`ui/src/lib/nostr`) for direct relay interaction, plus a testbench at `/nostr` behind a NEAR-authenticated route.

## Structure

```
.
├── bos.config.json       # Runtime composition (on-chain config)
├── api/                  # Reference API workspace (oRPC)
├── ui/                   # Frontend (React + TanStack Router)
│   └── src/lib/nostr/    # Client-side Nostr helpers (keys, relays, bindings)
├── plugins/nostr/        # The Nostr plugin (oRPC contract + services)
└── packages/client/      # Typed Nostr client for external consumers
```

## Quick Start

```bash
cp .env.example .env   # First time only
bun install
bun run dev
```

Requires [Bun](https://bun.sh/) and a NEAR wallet to exercise the authenticated flows.

## Check Status

```bash
bos ps        # List running processes
bos status    # Project health check
bos info      # Show configuration
```

## Testing & Quality

Before committing:

```bash
bun run test    # Run all tests
bun typecheck   # Type check all packages
bun lint        # Run linting
```

## Related Projects

- **[everything.dev](https://github.com/nearbuilders/everything-dev)** — the parent runtime platform this project is built on
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** — NEAR SIWN + gasless relay for Better-Auth
- **[near-nostr-sdk](https://github.com/Kampouse/near-nostr-sdk)** — SDK for NEAR ↔ Nostr integration
- **[nostr-msig](https://github.com/Kampouse/nostr-msig)** — Nostr multisig
- **[nostr-testbench](https://github.com/Kampouse/nostr-testbench)** — Nostr testbench

## License

MIT
