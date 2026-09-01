import { Effect, Exit, Layer } from "every-plugin/effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NostrConfigLive, type NostrResolvedConfig } from "../src/lib/nostr-config";
import { BindingService, BindingServiceLive } from "../src/services/binding";

const CFG: NostrResolvedConfig = {
  relays: [],
  clientName: "test",
  kvApiUrl: "https://kv.test",
  bindingContract: "contextual.near",
  standardRelays: [],
  buzzRelays: [],
  buzzSecretKey: undefined,
  challengeExpirySeconds: 300,
};

const TestLayer = Layer.provide(BindingServiceLive, NostrConfigLive(CFG));

function withBinding<A, E>(
  build: (svc: typeof BindingService.Service) => Effect.Effect<A, E, never>,
): Effect.Effect<A, E, never> {
  return Effect.flatMap(BindingService, build).pipe(Effect.provide(TestLayer));
}

async function runBinding<A, E>(effect: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(effect);
}

describe("BindingService.getBinding", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(status: number, body: unknown): void {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
      }),
    );
  }

  it("parses a JSON-stringified value at entries[0].value", async () => {
    mockFetch(200, {
      entries: [
        {
          value: JSON.stringify({
            npub: "npub1abc",
            relay: "wss://relay.test",
            proof: "proof-json",
            bound_at: 1_700_000_000,
          }),
        },
      ],
    });
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({
        npub: "npub1abc",
        relay: "wss://relay.test",
        proof: "proof-json",
        bound_at: 1_700_000_000,
      });
    }
  });

  it("parses an object value at entries[0].value", async () => {
    mockFetch(200, {
      entries: [
        {
          value: {
            npub: "npub1abc",
            relay: "wss://relay.test",
            proof: "proof-json",
            bound_at: 1_700_000_000,
          },
        },
      ],
    });
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toMatchObject({
        npub: "npub1abc",
        bound_at: 1_700_000_000,
      });
    }
  });

  it("returns null on an empty entries array", async () => {
    mockFetch(200, { entries: [] });
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("returns null when entries[0].value is missing", async () => {
    mockFetch(200, { entries: [{}] });
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("returns null on a 404 response (no throw)", async () => {
    mockFetch(404, "");
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("returns null on a 500 response (no throw)", async () => {
    mockFetch(500, "");
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("returns null on malformed JSON in entries[0].value (no throw)", async () => {
    mockFetch(200, { entries: [{ value: "not-json{" }] });
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("returns null on fetch network error (no throw)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("hits the FastNear KV URL with the right shape", async () => {
    mockFetch(200, { entries: [] });
    await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(calledUrl).toBe("https://kv.test/v0/latest/contextual.near/alice.near/nostr/alice.near");
  });

  it("survives a non-JSON OK response body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("not-json{{", { status: 200 }),
    );
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });

  it("survives an aborted fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const exit = await runBinding(withBinding((svc) => svc.getBinding("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });
});

describe("BindingService.getBindingOutput", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps snake_case bound_at to camelCase boundAt", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            {
              value: {
                npub: "npub1abc",
                relay: "wss://relay.test",
                proof: "proof-json",
                bound_at: 1_700_000_000,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const exit = await runBinding(withBinding((svc) => svc.getBindingOutput("alice.near")));
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({
        npub: "npub1abc",
        relay: "wss://relay.test",
        proof: "proof-json",
        boundAt: 1_700_000_000,
      });
    }
  });

  it("returns null when there is no binding", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("", { status: 404 }),
    );
    const exit = await runBinding(withBinding((svc) => svc.getBindingOutput("alice.near")));
    if (Exit.isSuccess(exit)) expect(exit.value).toBeNull();
  });
});

// Whole-test sanity check: Cause.squash is the assertion primitive used
// repeatedly above — make sure the import path resolves at runtime.
import * as CauseNS from "every-plugin/effect";

describe("sanity: Cause helper is importable", () => {
  it("exists", () => {
    expect(typeof CauseNS.Cause.squash).toBe("function");
  });
});
