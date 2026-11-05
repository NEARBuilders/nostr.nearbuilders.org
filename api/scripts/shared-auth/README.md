# Runbook: moving nostr onto the shared nearbuilders.org auth database

Tracks the shared-auth cutover line in [nearbuilders.org#380](https://github.com/NEARBuilders/nearbuilders.org/issues/380) (epic: [feedback#210](https://github.com/NEARBuilders/feedback.nearbuilders.org/issues/210)). The tooling follows [feedback's #166](https://github.com/NEARBuilders/feedback.nearbuilders.org/pull/166) pattern; this repo's variant is simpler because nostr stores **no app data keyed on auth ids** — the nsec vault keys on `near_account` in its own `VAULT_DATABASE_URL`, and bindings live on Nostr relays plus the FastNear KV. There is nothing to remap; the cutover merges nostr's identity graph into the shared database.

After the cutover nostr.nearbuilders.org and nearbuilders.org read the same auth database: same users, NEAR accounts, organizations and teams.

## What the tooling does

All commands run from the repo root. Every database is addressed by an environment variable:

| Variable | Database |
| --- | --- |
| `NOSTR_AUTH_DATABASE_URL` | nostr's current auth DB (only read) |
| `SHARED_AUTH_DATABASE_URL` | nearbuilders.org's auth DB, which nostr moves onto |

- `pnpm run auth:check-schema <VAR> [<VAR> ...]` reports how far each auth DB is through the auth plugin's migrations (`0000` … `0018`), by checking the tables, columns and constraints each migration leaves behind. It exits non-zero when a DB is behind.
- `pnpm run auth:cutover [--overrides overrides.json] [--report plan.json] [--apply]` plans and performs the merge:
  - **Orgs** map to the shared org with the same id, else the same slug when the two orgs share at least one member (matched by NEAR account), else they are copied with their id. A slug match with no shared members is a conflict.
  - **Teams** of those orgs map to the shared team with the same id, else the same name (case-insensitive) in the mapped org, else they are copied with their id.
  - **Users** map to the shared user with the same id, else the one owning the same NEAR account, else the same verified email (both sides `emailVerified`), else they are copied (user, NEAR accounts, provider accounts) with their ids. An unverified email match is a conflict, and so is a phone number already on a shared user (`user_phone_number_unique`).
  - A NEAR account claimed by two nostr users merges only if both resolve to the same shared user (the shared DB keeps `(account_id, network)` unique since migration `0017`).
  - **Memberships** missing from the shared DB are added. Where a membership already exists the shared role is kept and the difference is reported.
  - **Pending invitations** carry over with their inviter, org and team remapped, so `accept-invitation` links keep working.
  - Site roles (`user.role`) are never copied; the shared DB's global admin role wins.
  - Sessions and API keys are **not** merged: sessions are dropped (everyone signs in again) and the dry run lists every key to re-issue.
  - Without `--apply` it is a dry run: all writes are executed inside one transaction on a copy of the shared DB, verified, and rolled back. With `--apply` the transaction commits. The inserts are idempotent (existing ids are left alone), so a failed apply is recovered by re-running the command. Re-running after a successful cutover plans nothing.

  Anything it cannot decide safely is reported as a conflict, and nothing is written until the conflicts are gone. Typical fixes are an overrides file for orgs/teams whose slug or name differs between the apps:

  ```json
  {
    "organizations": { "<nostr org id>": "<shared org id>" },
    "teams": { "<nostr team id>": "<shared team id>" }
  }
  ```

## Steps

### 1. Make copies

Take `pg_dump` snapshots of both databases and restore them into scratch databases. Every step up to 5 runs against the copies only.

```sh
pg_dump --no-owner --format=custom "$PROD_SHARED_AUTH_URL" > shared-auth.dump
pg_dump --no-owner --format=custom "$PROD_NOSTR_AUTH_URL" > nostr-auth.dump
pg_restore --no-owner --dbname "$SHARED_AUTH_DATABASE_URL" shared-auth.dump
pg_restore --no-owner --dbname "$NOSTR_AUTH_DATABASE_URL" nostr-auth.dump
```

Record row counts of `user`, `near_account`, `organization`, `member`, `team`, `invitation` and `apikey` on both copies before anything else.

### 2. Migrate the copies forward

`auth:check-schema` both copies. Bring a copy forward by booting this repo locally against it (`AUTH_DATABASE_URL` set to the copy, `pnpm run dev`) and waiting for the auth plugin to finish starting — the runtime tracks applied migrations by hash, and replaying an `ALTER`-only migration it has not recorded fails on the next boot. Do not apply the SQL by hand. Then re-run `auth:check-schema`; it must report `applied through 0018_icy_thunderbolts`, and the row counts from step 1 must hold (the forward path only adds tables and columns).

`api/tests/unit/shared-auth-cutover.test.ts` replays exactly this path on a populated `0000` database, using the upstream migrations copied into `api/tests/fixtures/auth-migrations/`.

In production the shared DB is already at the level nearbuilders.org's runtime applies on boot (platform lockstep, `2.0.0-rc.39`); do that upgrade before step 6 if it is behind. The cutover refuses to run against a shared DB that is behind.

### 3. Dry-run the merge on the copies

```sh
pnpm run auth:cutover --report plan.json
```

Review the summary and `plan.json`:

- every org/team resolution (same id, slug/name match, override, copy) is what you expect;
- role differences: the shared role wins, so fix them in the shared DB if nostr's should;
- the API keys listed must be re-issued (step 7).

Resolve conflicts with an overrides file and repeat until the dry run passes. Then run it once with `--apply` against the copies and point a local nostr instance at them (`AUTH_DATABASE_URL` = shared copy) to check by hand: sign in with a NEAR account that existed on both apps, open the organizations page, and walk the nostr-link binding flow.

### 4. Secrets

- `BETTER_AUTH_SECRET` must be identical on the nostr and nearbuilders.org deployments. Use nearbuilders.org's value, because its sessions already live in the shared DB.
- `AUTH_DATABASE_URL` on the nostr Railway service points at the shared DB.
- Provider tokens (GitHub/Google/phone) copied for nostr-only users were written under nostr's old secret; Better Auth refreshes them on the user's next sign-in.
- `VAULT_DATABASE_URL`/`VAULT_SECRET` and `BUZZ_NSEC` are unaffected.

### 5. Cookies, origins and SSO

Same conclusion as feedback's runbook: the auth plugin sets `sameSite: "lax"` session cookies without a `domain`, and trusts only its own origin. Sharing the database works without any cookie change: users sign in to each app separately, as the same identity. No cross-subdomain SSO for this migration (epic decision #9); if wanted later, it is an upstream auth-plugin change (optional `crossSubDomainCookies`), tracked on NEARBuilders/everything-dev.

### 6. Cut over production

1. Announce a short maintenance window; say that everyone must sign in again.
2. Confirm the shared DB is current: `pnpm run auth:check-schema SHARED_AUTH_DATABASE_URL`.
3. With the production URLs exported, dry-run: `pnpm run auth:cutover --report plan.json`.
4. Back up the shared auth DB: `pg_dump --no-owner --format=custom "$SHARED_AUTH_DATABASE_URL" > shared-auth-before-nostr-cutover.dump`.
5. Apply: `pnpm run auth:cutover --apply`.
6. Update the nostr Railway service: `AUTH_DATABASE_URL` → shared DB, `BETTER_AUTH_SECRET` → the shared value. Redeploy.
7. Smoke test: SIWN sign-in, nostr-link binding, vault put/get/delete, organizations page, an admin page (remember `user.role` is shared — a nearbuilders admin is a nostr admin now), and an API-key-authenticated RPC call.

Rollback: revert `AUTH_DATABASE_URL` and `BETTER_AUTH_SECRET` on the nostr service and redeploy. Rows added to the shared DB can stay; they are ordinary users, orgs, teams and memberships. Restore from the step-4 dump only if the merged rows must be removed.

### 7. Sessions and API keys

Nostr's sessions and API keys stay in nostr's old auth DB and do not exist in the shared one.

- Everyone signs in to nostr again after the cutover — say so in the announcement.
- API keys must be re-issued in the shared DB. The dry-run summary lists every key with its owning org/user. Contact those owners and ask them to create new keys after the cutover.

### Caveats

- Users with **no linked NEAR account** and an email/phone that matches nothing on nearbuilders are simply copied, which is safe — but a user whose identity cannot be resolved cleanly shows up as a conflict and blocks the run until fixed.
- Keep nostr's old auth DB read-only for a few weeks as a reference, then decommission it.
- Platform lockstep: whoever deploys a newer runtime migrates the shared DB forward; never roll nostr back below the shared DB's journal level (epic decision #12).
