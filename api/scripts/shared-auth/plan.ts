/**
 * Merge plan for moving nostr.nearbuilders.org onto the shared nearbuilders.org auth
 * database (nearbuilders.org#380, following feedback's #166 pattern).
 *
 * Pure: takes snapshots of the two auth databases and decides, without touching any
 * database, which shared org/team each nostr org/team becomes, which auth rows must be
 * copied (ids preserved), and which conflicts block the cutover.
 *
 * Nostr stores no app data keyed on auth ids (the nsec vault keys on `near_account`,
 * bindings live on relays and the FastNear KV), so unlike feedback there is nothing to
 * remap: the plan merges the whole identity graph — users, NEAR accounts, provider
 * accounts, orgs, teams, memberships and pending invitations. Sessions are dropped
 * (everyone signs in again) and API keys are listed for re-issue.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthNearAccount {
  id: string;
  userId: string;
  accountId: string;
  network: string;
  publicKey: string;
  isPrimary: boolean | null;
  createdAt: Date;
}

export interface AuthAccount {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AuthTeam {
  id: string;
  name: string;
  organizationId: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface AuthTeamMember {
  id: string;
  teamId: string;
  userId: string;
  createdAt: Date;
}

export interface AuthInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
  teamId: string | null;
  nearAccountId: string | null;
  nearNetwork: string | null;
}

export interface AuthApiKey {
  id: string;
  name: string | null;
  referenceId: string;
}

export interface AuthSnapshot {
  users: AuthUser[];
  nearAccounts: AuthNearAccount[];
  accounts: AuthAccount[];
  organizations: AuthOrganization[];
  teams: AuthTeam[];
  members: AuthMember[];
  teamMembers: AuthTeamMember[];
  invitations: AuthInvitation[];
  apiKeys: AuthApiKey[];
  sessionCount: number;
}

/** Hand-picked source id → shared id pairs, for orgs/teams whose slug or name differs. */
export interface MergeOverrides {
  organizations?: Record<string, string>;
  teams?: Record<string, string>;
}

export type Resolution<T extends string> =
  | { kind: "same-id"; targetId: string }
  | { kind: T; targetId: string }
  | { kind: "override"; targetId: string }
  | { kind: "copy"; targetId: string };

export interface OrgMapping {
  sourceId: string;
  slug: string;
  targetSlug: string;
  sharedNearAccounts: string[];
  resolution: Resolution<"slug">;
}

export interface TeamMapping {
  sourceId: string;
  name: string;
  sourceOrganizationId: string;
  resolution: Resolution<"name">;
}

export interface UserMapping {
  sourceId: string;
  resolution: Resolution<"near-account" | "email">;
}

export interface MergePlan {
  organizations: OrgMapping[];
  teams: TeamMapping[];
  users: UserMapping[];
  /** Rows to insert into the shared auth DB, already rewritten to shared ids. */
  inserts: {
    users: AuthUser[];
    nearAccounts: AuthNearAccount[];
    accounts: AuthAccount[];
    organizations: AuthOrganization[];
    teams: AuthTeam[];
    members: AuthMember[];
    teamMembers: AuthTeamMember[];
    invitations: AuthInvitation[];
  };
  /** Memberships already present in the shared DB with a different role; the shared role wins. */
  roleDifferences: {
    organizationId: string;
    userId: string;
    sourceRole: string;
    targetRole: string;
  }[];
  /** Nostr API keys that will not exist in the shared DB and must be re-issued. */
  apiKeysToReissue: AuthApiKey[];
  /** Nostr sessions that will be dropped; their users sign in again. */
  sessionsDropped: number;
  /** Anything that blocks the cutover. A plan with conflicts must not be applied. */
  conflicts: string[];
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function nearKey(account: { accountId: string; network: string }): string {
  return `${account.network}:${account.accountId.toLowerCase()}`;
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function memberNearAccounts(snapshot: AuthSnapshot, organizationId: string): AuthNearAccount[] {
  const userIds = new Set(
    snapshot.members
      .filter((member) => member.organizationId === organizationId)
      .map((m) => m.userId),
  );
  return snapshot.nearAccounts.filter((account) => userIds.has(account.userId));
}

function sharedNearAccountIds(
  source: AuthSnapshot,
  target: AuthSnapshot,
  sourceOrgId: string,
  targetOrgId: string,
): string[] {
  const targetKeys = new Set(memberNearAccounts(target, targetOrgId).map(nearKey));
  const shared = new Set<string>();
  for (const account of memberNearAccounts(source, sourceOrgId)) {
    if (targetKeys.has(nearKey(account))) shared.add(account.accountId.toLowerCase());
  }
  return [...shared].sort();
}

export function planMerge(
  source: AuthSnapshot,
  target: AuthSnapshot,
  overrides: MergeOverrides = {},
): MergePlan {
  const conflicts: string[] = [];

  const targetOrgs = byId(target.organizations);
  const targetTeams = byId(target.teams);
  const targetUsers = byId(target.users);
  const targetOrgBySlug = new Map(target.organizations.map((o) => [o.slug, o]));

  const orgMap = new Map<string, string>();
  const organizations: OrgMapping[] = [];
  const orgInserts: AuthOrganization[] = [];
  for (const org of [...source.organizations].sort((a, b) => a.id.localeCompare(b.id))) {
    const override = overrides.organizations?.[org.id];
    let resolution: Resolution<"slug">;
    let targetSlug = org.slug;
    let sharedMembers: string[] = [];
    if (override) {
      if (!targetOrgs.has(override)) {
        conflicts.push(`Override maps org ${org.id} to ${override}, which is not in the shared DB`);
        continue;
      }
      resolution = { kind: "override", targetId: override };
      targetSlug = targetOrgs.get(override)!.slug;
      sharedMembers = sharedNearAccountIds(source, target, org.id, override);
    } else if (targetOrgs.has(org.id)) {
      resolution = { kind: "same-id", targetId: org.id };
      targetSlug = targetOrgs.get(org.id)!.slug;
      sharedMembers = sharedNearAccountIds(source, target, org.id, org.id);
    } else if (targetOrgBySlug.has(org.slug)) {
      const slugMatch = targetOrgBySlug.get(org.slug)!;
      sharedMembers = sharedNearAccountIds(source, target, org.id, slugMatch.id);
      if (sharedMembers.length === 0) {
        conflicts.push(
          `Org ${org.id} matches shared org ${slugMatch.id} by slug "${org.slug}" but they share no members; add an override`,
        );
        continue;
      }
      resolution = { kind: "slug", targetId: slugMatch.id };
      targetSlug = slugMatch.slug;
    } else {
      resolution = { kind: "copy", targetId: org.id };
      orgInserts.push(org);
    }
    orgMap.set(org.id, resolution.targetId);
    organizations.push({
      sourceId: org.id,
      slug: org.slug,
      targetSlug,
      sharedNearAccounts: sharedMembers,
      resolution,
    });
  }

  const teamMap = new Map<string, string>();
  const teams: TeamMapping[] = [];
  const teamInserts: AuthTeam[] = [];
  const sortedTeams = [...source.teams].sort((a, b) => a.id.localeCompare(b.id));
  for (const team of sortedTeams) {
    const targetOrgId = orgMap.get(team.organizationId);
    if (!targetOrgId) {
      conflicts.push(
        `Team ${team.id} belongs to org ${team.organizationId}, which has no resolution in the shared DB`,
      );
      continue;
    }
    const override = overrides.teams?.[team.id];
    let resolution: Resolution<"name">;
    if (override) {
      const overrideTeam = targetTeams.get(override);
      if (!overrideTeam) {
        conflicts.push(
          `Override maps team ${team.id} to ${override}, which is not in the shared DB`,
        );
        continue;
      }
      if (overrideTeam.organizationId !== targetOrgId) {
        conflicts.push(
          `Override maps team ${team.id} to ${override}, which belongs to another organization`,
        );
        continue;
      }
      resolution = { kind: "override", targetId: override };
    } else if (targetTeams.has(team.id)) {
      if (targetTeams.get(team.id)!.organizationId !== targetOrgId) {
        conflicts.push(
          `Team ${team.id} exists in the shared DB under a different organization than ${targetOrgId}`,
        );
        continue;
      }
      resolution = { kind: "same-id", targetId: team.id };
    } else {
      const sameName = target.teams.filter(
        (t) =>
          t.organizationId === targetOrgId && normalizeName(t.name) === normalizeName(team.name),
      );
      if (sameName.length > 1) {
        conflicts.push(
          `Team "${team.name}" (${team.id}) matches ${sameName.length} teams in shared org ${targetOrgId}; add an override`,
        );
        continue;
      }
      if (sameName.length === 1) {
        resolution = { kind: "name", targetId: sameName[0]!.id };
      } else {
        resolution = { kind: "copy", targetId: team.id };
        teamInserts.push({ ...team, organizationId: targetOrgId });
      }
    }
    teamMap.set(team.id, resolution.targetId);
    teams.push({
      sourceId: team.id,
      name: team.name,
      sourceOrganizationId: team.organizationId,
      resolution,
    });
  }

  const targetUserByNear = new Map<string, string>();
  for (const account of target.nearAccounts) targetUserByNear.set(nearKey(account), account.userId);
  const targetUserByEmail = new Map(target.users.map((u) => [normalizeName(u.email), u.id]));
  const targetUserByPhone = new Map(
    target.users.filter((u) => u.phoneNumber).map((u) => [u.phoneNumber!, u.id]),
  );

  const userMap = new Map<string, string>();
  const users: UserMapping[] = [];
  const userInserts: AuthUser[] = [];
  const nearAccountInserts: AuthNearAccount[] = [];
  const accountInserts: AuthAccount[] = [];
  const copiedUserIds = new Set<string>();
  for (const user of [...source.users].sort((a, b) => a.id.localeCompare(b.id))) {
    const nearAccounts = source.nearAccounts.filter((a) => a.userId === user.id);
    const nearMatches = new Set(
      nearAccounts.map((a) => targetUserByNear.get(nearKey(a))).filter((id): id is string => !!id),
    );
    let resolution: UserMapping["resolution"];
    if (targetUsers.has(user.id)) {
      resolution = { kind: "same-id", targetId: user.id };
    } else if (nearMatches.size > 1) {
      conflicts.push(
        `User ${user.id}'s NEAR accounts belong to ${nearMatches.size} different shared users: ${[...nearMatches].join(", ")}`,
      );
      continue;
    } else if (nearMatches.size === 1) {
      resolution = { kind: "near-account", targetId: [...nearMatches][0]! };
    } else if (targetUserByEmail.has(normalizeName(user.email))) {
      const targetUserId = targetUserByEmail.get(normalizeName(user.email))!;
      const targetUser = targetUsers.get(targetUserId);
      if (!user.emailVerified || !targetUser?.emailVerified) {
        conflicts.push(
          `User ${user.id} matches shared user ${targetUserId} by email but the email is not verified on both sides; add a link in the shared DB instead`,
        );
        continue;
      }
      resolution = { kind: "email", targetId: targetUserId };
    } else if (user.phoneNumber && targetUserByPhone.has(user.phoneNumber)) {
      conflicts.push(
        `User ${user.id}'s phone number ${user.phoneNumber} is already on shared user ${targetUserByPhone.get(user.phoneNumber)}; resolve it before the cutover`,
      );
      continue;
    } else {
      resolution = { kind: "copy", targetId: user.id };
      copiedUserIds.add(user.id);
      userInserts.push(user);
      nearAccountInserts.push(...nearAccounts);
      accountInserts.push(...source.accounts.filter((a) => a.userId === user.id));
    }
    userMap.set(user.id, resolution.targetId);
    users.push({ sourceId: user.id, resolution });
  }

  // The shared DB keeps (account_id, network) unique across users (auth migration 0017),
  // so a NEAR account claimed by two nostr users can only merge if both resolve to the
  // same shared user. A copy for each would violate the index.
  const claimants = new Map<string, Set<string>>();
  for (const account of source.nearAccounts) {
    const key = nearKey(account);
    const owners = claimants.get(key) ?? new Set<string>();
    owners.add(account.userId);
    claimants.set(key, owners);
  }
  for (const [key, owners] of claimants) {
    if (owners.size < 2) continue;
    const targets = new Set(
      [...owners].map((id) => userMap.get(id)).filter((id): id is string => !!id),
    );
    const unmapped = [...owners].filter((id) => !userMap.has(id));
    if (targets.size > 1 || unmapped.length > 0) {
      conflicts.push(
        `NEAR account ${key} is claimed by ${owners.size} nostr users (${[...owners].join(", ")}); they must all resolve to one shared user`,
      );
    }
  }

  const targetMemberKeys = new Map(
    target.members.map((m) => [`${m.organizationId}|${m.userId}`, m]),
  );
  const memberInserts: AuthMember[] = [];
  const roleDifferences: MergePlan["roleDifferences"] = [];
  const plannedMemberKeys = new Set<string>();
  for (const member of source.members) {
    const userId = userMap.get(member.userId);
    if (!userId) continue;
    const organizationId = orgMap.get(member.organizationId);
    if (!organizationId) continue;
    const key = `${organizationId}|${userId}`;
    const existing = targetMemberKeys.get(key);
    if (existing) {
      if (existing.role !== member.role) {
        roleDifferences.push({
          organizationId,
          userId,
          sourceRole: member.role,
          targetRole: existing.role,
        });
      }
      continue;
    }
    if (plannedMemberKeys.has(key)) continue;
    plannedMemberKeys.add(key);
    memberInserts.push({ ...member, organizationId, userId });
  }

  const targetTeamMemberKeys = new Set(target.teamMembers.map((m) => `${m.teamId}|${m.userId}`));
  const teamMemberInserts: AuthTeamMember[] = [];
  for (const teamMember of source.teamMembers) {
    const userId = userMap.get(teamMember.userId);
    if (!userId) continue;
    const teamId = teamMap.get(teamMember.teamId);
    if (!teamId) continue;
    const key = `${teamId}|${userId}`;
    if (targetTeamMemberKeys.has(key)) continue;
    targetTeamMemberKeys.add(key);
    teamMemberInserts.push({ ...teamMember, teamId, userId });
  }

  // Pending invitations carry over so "accept invitation" links keep working.
  const targetNearIdByKey = new Map(target.nearAccounts.map((a) => [nearKey(a), a.id] as const));
  const plannedNearIdByKey = new Map(nearAccountInserts.map((a) => [nearKey(a), a.id] as const));
  const invitationInserts: AuthInvitation[] = [];
  for (const invitation of source.invitations) {
    if (invitation.status !== "pending") continue;
    const organizationId = orgMap.get(invitation.organizationId);
    const inviterId = userMap.get(invitation.inviterId);
    if (!organizationId || !inviterId) {
      conflicts.push(
        `Invitation ${invitation.id} references an org or inviter with no resolution in the shared DB`,
      );
      continue;
    }
    const teamId = invitation.teamId ? (teamMap.get(invitation.teamId) ?? null) : null;
    if (invitation.teamId && !teamId) {
      conflicts.push(
        `Invitation ${invitation.id} references team ${invitation.teamId}, which has no resolution in the shared DB`,
      );
      continue;
    }
    let nearAccountId: string | null = null;
    if (invitation.nearAccountId) {
      const sourceNear = source.nearAccounts.find((a) => a.id === invitation.nearAccountId);
      const key = sourceNear ? nearKey(sourceNear) : null;
      nearAccountId = (key && (targetNearIdByKey.get(key) ?? plannedNearIdByKey.get(key))) ?? null;
    }
    invitationInserts.push({ ...invitation, organizationId, inviterId, teamId, nearAccountId });
  }

  return {
    organizations,
    teams,
    users,
    inserts: {
      users: userInserts,
      nearAccounts: nearAccountInserts,
      accounts: accountInserts,
      organizations: orgInserts,
      teams: teamInserts,
      members: memberInserts,
      teamMembers: teamMemberInserts,
      invitations: invitationInserts,
    },
    roleDifferences,
    apiKeysToReissue: source.apiKeys,
    sessionsDropped: source.sessionCount,
    conflicts,
  };
}

/** Human-readable summary for the dry-run report. */
export function summarizePlan(plan: MergePlan): string {
  const count = <T extends { resolution: { kind: string } }>(rows: T[], kind: string) =>
    rows.filter((row) => row.resolution.kind === kind).length;
  const lines = [
    `Organizations: ${plan.organizations.length} (same id ${count(plan.organizations, "same-id")}, by slug ${count(plan.organizations, "slug")}, override ${count(plan.organizations, "override")}, copied ${count(plan.organizations, "copy")})`,
    ...plan.organizations
      .filter((org) => org.resolution.kind !== "same-id")
      .map((org) => {
        const shared = org.sharedNearAccounts.length
          ? `; shared members ${org.sharedNearAccounts.join(", ")}`
          : "";
        return `  ${org.slug} [${org.sourceId}] -> ${org.targetSlug} [${org.resolution.targetId}] (${org.resolution.kind}${shared})`;
      }),
    `Teams: ${plan.teams.length} (same id ${count(plan.teams, "same-id")}, by name ${count(plan.teams, "name")}, override ${count(plan.teams, "override")}, copied ${count(plan.teams, "copy")})`,
    `Users: ${plan.users.length} (same id ${count(plan.users, "same-id")}, by NEAR account ${count(plan.users, "near-account")}, by email ${count(plan.users, "email")}, copied ${count(plan.users, "copy")})`,
    `Rows to insert: ${plan.inserts.users.length} users, ${plan.inserts.nearAccounts.length} NEAR accounts, ${plan.inserts.accounts.length} accounts, ${plan.inserts.organizations.length} orgs, ${plan.inserts.teams.length} teams, ${plan.inserts.members.length} members, ${plan.inserts.teamMembers.length} team members, ${plan.inserts.invitations.length} pending invitations`,
    `Role differences (shared role kept): ${plan.roleDifferences.length}`,
    ...plan.roleDifferences.map(
      (d) =>
        `  org ${d.organizationId} user ${d.userId}: nostr ${d.sourceRole}, shared ${d.targetRole}`,
    ),
    `API keys to re-issue: ${plan.apiKeysToReissue.length}`,
    ...plan.apiKeysToReissue.map(
      (k) => `  ${k.name ?? "(unnamed)"} [${k.id}] for ${k.referenceId}`,
    ),
    `Sessions dropped (users sign in again): ${plan.sessionsDropped}`,
    `Conflicts: ${plan.conflicts.length}`,
    ...plan.conflicts.map((c) => `  ! ${c}`),
  ];
  return lines.join("\n");
}
