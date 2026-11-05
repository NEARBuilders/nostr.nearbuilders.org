/**
 * Caller → NEAR account resolution, following the identity-keying convention
 * (everything-dev / nearbuilders#329): the canonical owner id is the primary
 * account, and ownership checks fan out over the primary plus all linked
 * accounts so records survive primary-account changes.
 */

export interface NearIdentity {
  primaryAccountId: string | null;
  linkedAccounts?: readonly { accountId: string }[];
}

export function controlledNearAccounts(near: NearIdentity | undefined | null): string[] {
  const primary = near?.primaryAccountId;
  if (!primary) return [];
  const linked = (near?.linkedAccounts ?? [])
    .map((account) => account.accountId)
    .filter((accountId) => accountId && accountId !== primary);
  return [primary, ...new Set(linked)];
}
