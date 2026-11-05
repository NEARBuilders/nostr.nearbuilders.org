import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { applyAuthInserts, executePlan, loadAuthSnapshot } from "../../scripts/shared-auth/db";
import { planMerge, summarizePlan } from "../../scripts/shared-auth/plan";
import { checkAuthSchema } from "../../scripts/shared-auth/schema-check";

// Copied verbatim from NEARBuilders/everything-dev plugins/auth/src/db/migrations
// at v2.0.0-rc.39 (the release this repo pins).
const AUTH_MIGRATIONS_DIR = join(import.meta.dirname, "../fixtures/auth-migrations");

async function applySqlFile(db: PGlite, path: string) {
  const sql = readFileSync(path, "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

function authMigrations(from?: string, through?: string): string[] {
  return readdirSync(AUTH_MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (!from || f > from) && (!through || f <= `${through}.sql`))
    .sort();
}

async function authDb(through?: string) {
  const db = new PGlite();
  for (const file of authMigrations(undefined, through)) {
    await applySqlFile(db, join(AUTH_MIGRATIONS_DIR, file));
  }
  return db;
}

async function addUser(
  db: PGlite,
  id: string,
  nearAccountId: string,
  options: { emailVerified?: boolean; phoneNumber?: string } = {},
) {
  await db.query(
    `INSERT INTO "user" (id, name, email, email_verified, phone_number) VALUES ($1, $1, $2, $3, $4)`,
    [id, `${id}@example.com`, options.emailVerified ?? true, options.phoneNumber ?? null],
  );
  await db.query(
    `INSERT INTO near_account (id, user_id, account_id, network, public_key, is_primary, created_at)
     VALUES ($1, $2, $3, 'mainnet', 'ed25519:x', true, now())`,
    [`na_${id}`, id, nearAccountId],
  );
}

async function addOrg(db: PGlite, id: string, slug: string) {
  await db.query(
    `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $2, now())`,
    [id, slug],
  );
}

async function addMember(db: PGlite, id: string, orgId: string, userId: string, role: string) {
  await db.query(
    `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())`,
    [id, orgId, userId, role],
  );
}

async function addTeam(db: PGlite, id: string, orgId: string, name: string, members: string[]) {
  await db.query(`INSERT INTO team (id, name, organization_id) VALUES ($1, $2, $3)`, [
    id,
    name,
    orgId,
  ]);
  for (const userId of members) {
    await db.query(`INSERT INTO team_member (id, team_id, user_id) VALUES ($1, $2, $3)`, [
      `tm_${id}_${userId}`,
      id,
      userId,
    ]);
  }
}

/**
 * Nostr's auth DB: acme (also on nearbuilders) has an Ops team; solo exists only on nostr;
 * dave only ever signed in on nostr with his NEAR account.
 */
async function seedNostrAuth() {
  const db = await authDb();
  await addUser(db, "no_alice", "alice.near");
  await addUser(db, "no_bob", "bob.near");
  await addUser(db, "no_carol", "carol.near");
  await addUser(db, "no_dave", "dave.near");
  await addOrg(db, "no_acme", "acme");
  await addOrg(db, "no_solo", "solo");
  await addMember(db, "nm_alice", "no_acme", "no_alice", "owner");
  await addMember(db, "nm_bob", "no_acme", "no_bob", "member");
  await addMember(db, "nm_carol", "no_solo", "no_carol", "owner");
  await addTeam(db, "no_ops", "no_acme", "Ops", ["no_bob"]);
  await addTeam(db, "no_qa", "no_solo", "QA", ["no_carol"]);
  await db.query(
    `INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id, team_id)
     VALUES ('inv_dave', 'no_solo', 'dave@example.com', 'admin', 'pending', now() + interval '7 days', 'no_carol', NULL)`,
  );
  await db.query(
    `INSERT INTO apikey (id, name, reference_id, key, created_at, updated_at)
     VALUES ('key_acme', 'ci', 'no_acme', 'hashed', now(), now())`,
  );
  await db.query(
    `INSERT INTO session (id, expires_at, token, user_id) VALUES ('s1', now() + interval '1 day', 't1', 'no_alice')`,
  );
  return db;
}

/** nearbuilders.org's auth DB: alice and bob under other ids, acme with an "ops" team. */
async function seedSharedAuth(db: PGlite) {
  await addUser(db, "nb_alice", "alice.near");
  await addUser(db, "nb_bob", "bob.near");
  await addOrg(db, "nb_acme", "acme");
  await addMember(db, "sm_alice", "nb_acme", "nb_alice", "owner");
}

async function sharedAuthAtLatest() {
  const db = await authDb("0000_sturdy_lady_vermin");
  await seedSharedAuth(db);
  for (const file of authMigrations("0000_sturdy_lady_vermin.sql")) {
    await applySqlFile(db, join(AUTH_MIGRATIONS_DIR, file));
  }
  await addTeam(db, "nb_ops", "nb_acme", "ops", []);
  return db;
}

async function setup() {
  const source = await seedNostrAuth();
  const shared = await sharedAuthAtLatest();
  const plan = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared));
  return { source, shared, plan };
}

describe("shared auth schema check", () => {
  it("reports a 0000 database as behind and lists what each migration still adds", async () => {
    const report = await checkAuthSchema(await authDb("0000_sturdy_lady_vermin"));
    expect(report.upToDate).toBe(false);
    expect(report.appliedThrough).toBe("0000_sturdy_lady_vermin");
    expect(report.pending.length).toBe(17);
    expect(report.pending[0]!.tag).toBe("0002_third_captain_stacy");
    expect(report.pending.at(-1)!.tag).toBe("0018_icy_thunderbolts");
  });

  it("tells 0010 from 0011 by the team_member role column", async () => {
    const report = await checkAuthSchema(await authDb("0010_preserve-approved-organizations"));
    expect(report.appliedThrough).toBe("0010_preserve-approved-organizations");
    expect(report.pending.map((m) => m.tag)).toEqual([
      "0011_team-member-role",
      "0012_gifted_nicolaos",
      "0013_sleepy_komodo",
      "0014_deep_toad",
      "0015_careful_jasper_sitwell",
      "0016_ordinary_baron_zemo",
      "0017_loving_dorian_gray",
      "0018_icy_thunderbolts",
    ]);
  });

  it("migrates a populated 0000 database forward to the latest without losing rows", async () => {
    const db = await authDb("0000_sturdy_lady_vermin");
    await seedSharedAuth(db);
    const count = async (table: string) =>
      Number((await db.query<{ n: number }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0]!.n);
    const before = {
      user: await count("user"),
      near_account: await count("near_account"),
      organization: await count("organization"),
      member: await count("member"),
    };

    for (const file of authMigrations("0000_sturdy_lady_vermin.sql")) {
      await applySqlFile(db, join(AUTH_MIGRATIONS_DIR, file));
    }

    expect((await checkAuthSchema(db)).upToDate).toBe(true);
    for (const [table, n] of Object.entries(before)) expect(await count(table)).toBe(n);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM organization`);
    expect(rows).toEqual([{ status: "active" }]);
  });
});

describe("shared auth merge", () => {
  it("dry run executes and verifies every write, then leaves the shared DB untouched", async () => {
    const { shared, plan } = await setup();
    expect(plan.conflicts).toEqual([]);

    await executePlan(shared, plan, { apply: false });

    const { rows } = await shared.query(`SELECT id FROM organization WHERE id = 'no_solo'`);
    expect(rows).toHaveLength(0);
  });

  it("merges users by NEAR account, copies nostr-only identities and keeps access", async () => {
    const { source, shared, plan } = await setup();
    expect(plan.apiKeysToReissue.map((k) => k.id)).toEqual(["key_acme"]);
    expect(plan.sessionsDropped).toBe(1);

    const byKind = (kind: string) =>
      plan.users.filter((u) => u.resolution.kind === kind).map((u) => u.sourceId);
    expect(byKind("near-account")).toEqual(["no_alice", "no_bob"]);
    expect(byKind("copy")).toEqual(["no_carol", "no_dave"]);

    await executePlan(shared, plan, { apply: true });

    // alice and carol resolve onto their nearbuilders identities…
    const { rows: aliceRows } = await shared.query<{ user_id: string }>(
      `SELECT user_id FROM near_account WHERE account_id = 'alice.near'`,
    );
    expect(aliceRows).toEqual([{ user_id: "nb_alice" }]);

    // …while dave is copied with his own id, NEAR account and provider accounts.
    const { rows: daveRows } = await shared.query<{ id: string }>(
      `SELECT id FROM "user" WHERE id = 'no_dave'`,
    );
    expect(daveRows).toHaveLength(1);
    const { rows: daveNear } = await shared.query<{ user_id: string }>(
      `SELECT user_id FROM near_account WHERE account_id = 'dave.near'`,
    );
    expect(daveNear).toEqual([{ user_id: "no_dave" }]);

    // carol's org, team and membership were copied, so she still administers solo.
    const memberRole = await shared.query<{ role: string }>(
      `SELECT role FROM member WHERE organization_id = 'no_solo' AND user_id = 'no_carol'`,
    );
    expect(memberRole.rows[0]?.role).toBe("owner");
    const teamMembers = await shared.query<{ user_id: string }>(
      `SELECT user_id FROM team_member WHERE team_id = 'no_qa'`,
    );
    expect(teamMembers.rows.map((r) => r.user_id)).toEqual(["no_carol"]);

    // acme merged into the shared org; bob's Ops membership rides along.
    const acmeMembers = await shared.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM member WHERE organization_id = 'nb_acme' ORDER BY user_id`,
    );
    expect(acmeMembers.rows).toEqual([
      { user_id: "nb_alice", role: "owner" },
      { user_id: "nb_bob", role: "member" },
    ]);

    // The pending invitation survives with its inviter remapped onto the shared user.
    const invitations = await shared.query<{
      inviter_id: string;
      organization_id: string;
      status: string;
    }>(`SELECT inviter_id, organization_id, status FROM invitation WHERE id = 'inv_dave'`);
    expect(invitations.rows).toEqual([
      { inviter_id: "no_carol", organization_id: "no_solo", status: "pending" },
    ]);

    // Re-running against the merged state plans nothing more to insert.
    const again = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared));
    expect(again.conflicts).toEqual([]);
    expect(again.inserts.users).toEqual([]);
    expect(again.inserts.organizations).toEqual([]);
  });

  it("keeps the shared role when the same membership exists with a different one", async () => {
    const { source, shared, plan } = await setup();
    await shared.query(
      `UPDATE member SET role = 'admin' WHERE organization_id = 'nb_acme' AND user_id = 'nb_alice'`,
    );
    const relet = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared));
    expect(relet.roleDifferences).toEqual([
      { organizationId: "nb_acme", userId: "nb_alice", sourceRole: "owner", targetRole: "admin" },
    ]);
    await executePlan(shared, relet, { apply: true });
    const { rows } = await shared.query<{ role: string }>(
      `SELECT role FROM member WHERE organization_id = 'nb_acme' AND user_id = 'nb_alice'`,
    );
    expect(rows).toEqual([{ role: "admin" }]);
    expect(plan.conflicts).toEqual([]);
  });

  it("refuses two nostr users claiming the same NEAR account when it is not on nearbuilders", async () => {
    const near = (id: string, userId: string, accountId: string) => ({
      id,
      userId,
      accountId,
      network: "mainnet",
      publicKey: "ed25519:x",
      isPrimary: true,
      createdAt: new Date(0),
    });
    const user = (id: string) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      image: null,
      phoneNumber: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const source = {
      users: [user("no_frank"), user("no_gina")],
      nearAccounts: [
        near("na_f1", "no_frank", "shared.near"),
        near("na_g1", "no_gina", "shared.near"),
      ],
      accounts: [],
      organizations: [],
      teams: [],
      members: [],
      teamMembers: [],
      invitations: [],
      apiKeys: [],
      sessionCount: 0,
    };
    const shared = {
      users: [],
      nearAccounts: [],
      accounts: [],
      organizations: [],
      teams: [],
      members: [],
      teamMembers: [],
      invitations: [],
      apiKeys: [],
      sessionCount: 0,
    };

    const plan = planMerge(source, shared);
    expect(plan.conflicts.some((c) => c.includes("shared.near"))).toBe(true);

    // The same claim is fine when both users resolve to one shared identity.
    const merged = planMerge(source, {
      ...shared,
      users: [user("nb_shared")],
      nearAccounts: [near("na_shared", "nb_shared", "shared.near")],
    });
    expect(merged.conflicts).toEqual([]);
    expect(merged.users.map((u) => u.resolution.targetId)).toEqual(["nb_shared", "nb_shared"]);
  });

  it("refuses a phone number that already belongs to a shared user", async () => {
    const source = await authDb();
    await addUser(source, "no_hank", "hank.near", { phoneNumber: "+15550001111" });
    const shared = await sharedAuthAtLatest();
    await shared.query(`UPDATE "user" SET phone_number = '+15550001111' WHERE id = 'nb_alice'`);

    const plan = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared));
    expect(plan.conflicts.some((c) => c.includes("+15550001111"))).toBe(true);
  });

  it("refuses an unverified-email match instead of guessing the identity", async () => {
    const source = await authDb();
    await addUser(source, "no_iris", "iris.near", { emailVerified: false });
    await source.query(`UPDATE "user" SET email = 'iris@example.com' WHERE id = 'no_iris'`);

    const shared = await sharedAuthAtLatest();
    await addUser(shared, "nb_iris", "other.near", { emailVerified: true });
    await shared.query(`UPDATE "user" SET email = 'iris@example.com' WHERE id = 'nb_iris'`);

    const plan = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared));
    expect(plan.conflicts.some((c) => c.includes("no_iris") && c.includes("nb_iris"))).toBe(true);
  });

  it("merge inserts are idempotent, so a failed apply can simply be re-run", async () => {
    const { shared, plan } = await setup();
    await executePlan(shared, plan, { apply: true });
    await applyAuthInserts(shared, plan);
    const { rows } = await shared.query<{ n: number | string }>(
      `SELECT count(*) AS n FROM "user" WHERE id = 'no_dave'`,
    );
    expect(Number(rows[0]!.n)).toBe(1);
    expect(summarizePlan(plan)).toContain("Users: 4");
  });
});
