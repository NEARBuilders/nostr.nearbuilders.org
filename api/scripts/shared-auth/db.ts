import type {
  AuthAccount,
  AuthApiKey,
  AuthInvitation,
  AuthMember,
  AuthNearAccount,
  AuthOrganization,
  AuthSnapshot,
  AuthTeam,
  AuthTeamMember,
  AuthUser,
  MergePlan,
} from "./plan";

/** The slice of `pg.Client` / `PGlite` the cutover needs. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export async function loadAuthSnapshot(db: Queryable): Promise<AuthSnapshot> {
  const [
    users,
    nearAccounts,
    accounts,
    organizations,
    teams,
    members,
    teamMembers,
    invitations,
    apiKeys,
    sessions,
  ] = await Promise.all([
    db.query<AuthUser>(
      `SELECT id, name, email, email_verified AS "emailVerified", image,
              phone_number AS "phoneNumber", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM "user"`,
    ),
    db.query<AuthNearAccount>(
      `SELECT id, user_id AS "userId", account_id AS "accountId", network,
              public_key AS "publicKey", is_primary AS "isPrimary", created_at AS "createdAt"
       FROM near_account`,
    ),
    db.query<AuthAccount>(
      `SELECT id, account_id AS "accountId", provider_id AS "providerId", user_id AS "userId",
              access_token AS "accessToken", refresh_token AS "refreshToken", id_token AS "idToken",
              access_token_expires_at AS "accessTokenExpiresAt",
              refresh_token_expires_at AS "refreshTokenExpiresAt",
              scope, password, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM account`,
    ),
    db.query<AuthOrganization>(
      `SELECT id, name, slug, logo, metadata, created_at AS "createdAt" FROM organization`,
    ),
    db.query<AuthTeam>(
      `SELECT id, name, organization_id AS "organizationId", metadata,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM team`,
    ),
    db.query<AuthMember>(
      `SELECT id, organization_id AS "organizationId", user_id AS "userId", role,
              created_at AS "createdAt"
       FROM member`,
    ),
    db.query<AuthTeamMember>(
      `SELECT id, team_id AS "teamId", user_id AS "userId", created_at AS "createdAt"
       FROM team_member`,
    ),
    db.query<AuthInvitation>(
      `SELECT id, organization_id AS "organizationId", email, role, status,
              expires_at AS "expiresAt", created_at AS "createdAt", inviter_id AS "inviterId",
              team_id AS "teamId", near_account_id AS "nearAccountId", near_network AS "nearNetwork"
       FROM invitation`,
    ),
    db.query<AuthApiKey>(`SELECT id, name, reference_id AS "referenceId" FROM apikey`),
    db.query<{ count: number | string }>(
      `SELECT count(*) AS count FROM session WHERE expires_at > now()`,
    ),
  ]);
  return {
    users: users.rows,
    nearAccounts: nearAccounts.rows,
    accounts: accounts.rows,
    organizations: organizations.rows,
    teams: teams.rows,
    members: members.rows,
    teamMembers: teamMembers.rows,
    invitations: invitations.rows,
    apiKeys: apiKeys.rows,
    sessionCount: Number(sessions.rows[0]?.count ?? 0),
  };
}

async function insertRows<T>(
  db: Queryable,
  table: string,
  columns: string[],
  rows: T[],
  values: (row: T) => unknown[],
): Promise<void> {
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  for (const row of rows) {
    await db.query(
      `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values(row),
    );
  }
}

/** Inserts the plan's rows into the shared auth DB. Idempotent: existing ids are left alone. */
export async function applyAuthInserts(db: Queryable, plan: MergePlan): Promise<void> {
  const { inserts } = plan;
  await insertRows(
    db,
    "user",
    ["id", "name", "email", "email_verified", "image", "phone_number", "created_at", "updated_at"],
    inserts.users,
    (u) => [
      u.id,
      u.name,
      u.email,
      u.emailVerified,
      u.image,
      u.phoneNumber,
      u.createdAt,
      u.updatedAt,
    ],
  );
  await insertRows(
    db,
    "near_account",
    ["id", "user_id", "account_id", "network", "public_key", "is_primary", "created_at"],
    inserts.nearAccounts,
    (a) => [a.id, a.userId, a.accountId, a.network, a.publicKey, a.isPrimary, a.createdAt],
  );
  await insertRows(
    db,
    "account",
    [
      "id",
      "account_id",
      "provider_id",
      "user_id",
      "access_token",
      "refresh_token",
      "id_token",
      "access_token_expires_at",
      "refresh_token_expires_at",
      "scope",
      "password",
      "created_at",
      "updated_at",
    ],
    inserts.accounts,
    (a) => [
      a.id,
      a.accountId,
      a.providerId,
      a.userId,
      a.accessToken,
      a.refreshToken,
      a.idToken,
      a.accessTokenExpiresAt,
      a.refreshTokenExpiresAt,
      a.scope,
      a.password,
      a.createdAt,
      a.updatedAt,
    ],
  );
  await insertRows(
    db,
    "organization",
    ["id", "name", "slug", "logo", "metadata", "created_at", "status"],
    inserts.organizations,
    (o) => [o.id, o.name, o.slug, o.logo, o.metadata, o.createdAt, "active"],
  );
  await insertRows(
    db,
    "team",
    ["id", "name", "organization_id", "metadata", "created_at", "updated_at"],
    inserts.teams,
    (t) => [t.id, t.name, t.organizationId, t.metadata, t.createdAt, t.updatedAt],
  );
  await insertRows(
    db,
    "member",
    ["id", "organization_id", "user_id", "role", "created_at"],
    inserts.members,
    (m) => [m.id, m.organizationId, m.userId, m.role, m.createdAt],
  );
  await insertRows(
    db,
    "team_member",
    ["id", "team_id", "user_id", "created_at"],
    inserts.teamMembers,
    (m) => [m.id, m.teamId, m.userId, m.createdAt],
  );
  await insertRows(
    db,
    "invitation",
    [
      "id",
      "organization_id",
      "email",
      "role",
      "status",
      "expires_at",
      "created_at",
      "inviter_id",
      "team_id",
      "near_account_id",
      "near_network",
    ],
    inserts.invitations,
    (i) => [
      i.id,
      i.organizationId,
      i.email,
      i.role,
      i.status,
      i.expiresAt,
      i.createdAt,
      i.inviterId,
      i.teamId,
      i.nearAccountId,
      i.nearNetwork,
    ],
  );
}

/**
 * Runs the plan's writes in one transaction on the shared auth DB and verifies the result.
 * Without `apply` the transaction is rolled back, which makes this the dry run.
 */
export async function executePlan(
  shared: Queryable,
  plan: MergePlan,
  { apply }: { apply: boolean },
): Promise<void> {
  if (plan.conflicts.length > 0) throw new Error("The plan has conflicts; refusing to run it");
  await shared.query("BEGIN");
  try {
    await applyAuthInserts(shared, plan);
    const problems = await verifyCutover(shared, plan);
    if (problems.length > 0) throw new Error(`Verification failed:\n  ${problems.join("\n  ")}`);
  } catch (error) {
    await shared.query("ROLLBACK").catch(() => {});
    throw error;
  }
  if (!apply) {
    await shared.query("ROLLBACK");
    return;
  }
  await shared.query("COMMIT");
}

/**
 * Inside the transaction: everything the plan said it would insert is present, and every
 * inserted row's references resolve inside the shared DB, so nobody loses access.
 */
export async function verifyCutover(shared: Queryable, plan: MergePlan): Promise<string[]> {
  const problems: string[] = [];
  const count = async (table: string) =>
    Number(
      (await shared.query<{ n: number | string }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0]!
        .n,
    );

  const expected = {
    user: plan.inserts.users.length,
    near_account: plan.inserts.nearAccounts.length,
    account: plan.inserts.accounts.length,
    organization: plan.inserts.organizations.length,
    team: plan.inserts.teams.length,
    member: plan.inserts.members.length,
    team_member: plan.inserts.teamMembers.length,
    invitation: plan.inserts.invitations.length,
  };
  for (const [table, n] of Object.entries(expected)) {
    const actual = await count(table);
    if (actual < n) {
      problems.push(`Table ${table} holds ${actual} rows after inserting ${n}`);
    }
  }

  const sharedUsers = new Set(
    (await shared.query<{ id: string }>(`SELECT id FROM "user"`)).rows.map((r) => r.id),
  );
  const sharedOrgs = new Set(
    (await shared.query<{ id: string }>(`SELECT id FROM organization`)).rows.map((r) => r.id),
  );
  const sharedTeams = new Set(
    (await shared.query<{ id: string }>(`SELECT id FROM team`)).rows.map((r) => r.id),
  );
  const sharedNearIds = new Set(
    (await shared.query<{ id: string }>(`SELECT id FROM near_account`)).rows.map((r) => r.id),
  );

  for (const invitation of plan.inserts.invitations) {
    if (!sharedOrgs.has(invitation.organizationId)) {
      problems.push(
        `Invitation ${invitation.id} points at missing org ${invitation.organizationId}`,
      );
    }
    if (!sharedUsers.has(invitation.inviterId)) {
      problems.push(
        `Invitation ${invitation.id} points at missing inviter ${invitation.inviterId}`,
      );
    }
    if (invitation.teamId && !sharedTeams.has(invitation.teamId)) {
      problems.push(`Invitation ${invitation.id} points at missing team ${invitation.teamId}`);
    }
    if (invitation.nearAccountId && !sharedNearIds.has(invitation.nearAccountId)) {
      problems.push(
        `Invitation ${invitation.id} points at missing NEAR account ${invitation.nearAccountId}`,
      );
    }
  }

  for (const member of plan.inserts.members) {
    if (!sharedOrgs.has(member.organizationId) || !sharedUsers.has(member.userId)) {
      problems.push(`Member ${member.id} points at a missing org or user`);
    }
  }
  for (const teamMember of plan.inserts.teamMembers) {
    if (!sharedTeams.has(teamMember.teamId) || !sharedUsers.has(teamMember.userId)) {
      problems.push(`Team member ${teamMember.id} points at a missing team or user`);
    }
  }

  return problems;
}
