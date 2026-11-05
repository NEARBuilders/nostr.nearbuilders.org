/**
 * Moves nostr's auth data onto the shared nearbuilders.org auth database (#380).
 *
 *   pnpm run auth:cutover [--apply] [--overrides overrides.json] [--report plan.json]
 *
 * Environment:
 *   NOSTR_AUTH_DATABASE_URL   nostr's current auth DB (read only)
 *   SHARED_AUTH_DATABASE_URL  the nearbuilders.org auth DB nostr moves onto
 *
 * Without `--apply` this is a dry run: every write is executed inside a transaction,
 * verified, and rolled back. See README.md next to this file for the full runbook.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connect, requireEnv } from "./connect";
import { executePlan, loadAuthSnapshot } from "./db";
import { type MergeOverrides, planMerge, summarizePlan } from "./plan";
import { checkAuthSchema, formatSchemaReport } from "./schema-check";

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const apply = process.argv.includes("--apply");
const overridesPath = flagValue("--overrides");
const reportPath = flagValue("--report");
const overrides: MergeOverrides = overridesPath
  ? JSON.parse(readFileSync(overridesPath, "utf8"))
  : {};

const source = await connect(requireEnv("NOSTR_AUTH_DATABASE_URL"));
const shared = await connect(requireEnv("SHARED_AUTH_DATABASE_URL"));

let exitCode = 0;
try {
  const sharedSchema = await checkAuthSchema(shared);
  console.log(formatSchemaReport("Shared auth DB", sharedSchema));
  if (!sharedSchema.upToDate) {
    throw new Error(
      "The shared auth DB is behind the auth plugin; migrate it first (runbook step 2)",
    );
  }
  const sourceSchema = await checkAuthSchema(source);
  console.log(formatSchemaReport("Nostr auth DB", sourceSchema));
  const teamMigrations = ["0002_third_captain_stacy", "0003_teams_workspaces"];
  if (sourceSchema.pending.some((m) => teamMigrations.includes(m.tag))) {
    throw new Error("The nostr auth DB has no teams schema; it is not the DB nostr runs on");
  }

  const plan = planMerge(await loadAuthSnapshot(source), await loadAuthSnapshot(shared), overrides);
  console.log(`\n${summarizePlan(plan)}\n`);
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify(plan, null, 2));
    console.log(`Plan written to ${reportPath}`);
  }
  if (plan.conflicts.length > 0) {
    throw new Error("Resolve the conflicts above (overrides file or manual fixes) and re-run");
  }

  await executePlan(shared, plan, { apply });
  console.log(
    apply
      ? "Cutover applied and verified."
      : "Dry run passed: all writes succeeded and verified, then rolled back.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await Promise.all([source.end(), shared.end()]);
}
process.exit(exitCode);
