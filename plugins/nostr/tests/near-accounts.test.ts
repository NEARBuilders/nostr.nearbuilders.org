import { describe, expect, it } from "vitest";
import { controlledNearAccounts } from "../src/lib/near-accounts";

describe("controlledNearAccounts", () => {
  it("returns just the primary account when nothing is linked", () => {
    expect(controlledNearAccounts({ primaryAccountId: "alice.near" })).toEqual(["alice.near"]);
  });

  it("puts the primary first and appends linked accounts", () => {
    expect(
      controlledNearAccounts({
        primaryAccountId: "alice.near",
        linkedAccounts: [{ accountId: "bob.near" }, { accountId: "carol.near" }],
      }),
    ).toEqual(["alice.near", "bob.near", "carol.near"]);
  });

  it("does not repeat the primary when it also appears as linked", () => {
    expect(
      controlledNearAccounts({
        primaryAccountId: "alice.near",
        linkedAccounts: [{ accountId: "alice.near" }, { accountId: "bob.near" }],
      }),
    ).toEqual(["alice.near", "bob.near"]);
  });

  it("deduplicates linked accounts while keeping their order", () => {
    expect(
      controlledNearAccounts({
        primaryAccountId: "alice.near",
        linkedAccounts: [{ accountId: "bob.near" }, { accountId: "bob.near" }],
      }),
    ).toEqual(["alice.near", "bob.near"]);
  });

  it("returns empty when there is no primary account", () => {
    expect(
      controlledNearAccounts({ primaryAccountId: null, linkedAccounts: [{ accountId: "x" }] }),
    ).toEqual([]);
    expect(controlledNearAccounts(undefined)).toEqual([]);
    expect(controlledNearAccounts(null)).toEqual([]);
  });
});
