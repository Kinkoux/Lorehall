import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import type { SQLWrapper } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

/**
 * A real Postgres — compiled to WASM, living in memory, thrown away with the
 * process. The schema is not re-declared here: the DDL is lifted straight out
 * of `scripts/bootstrap-db.mjs`, so the tables, the guarded ALTERs and the
 * partial unique indexes (`campaign_maps_one_active`, `story_beats_one_current`,
 * `uniq_live_session`, `uniq_combatant_player`) are the ones production runs.
 * A schema change that the tests would otherwise sail past shows up here.
 *
 * Vitest isolates module state per test file, so each file gets its own
 * database and they never see each other's rows.
 */
function bootstrapDdl(): string {
  const source = readFileSync(new URL("../../scripts/bootstrap-db.mjs", import.meta.url), "utf8");
  const match = source.match(/const DDL = `([\s\S]*?)`;\n/);
  if (!match) {
    throw new Error("Could not find the DDL template literal in scripts/bootstrap-db.mjs");
  }
  return match[1];
}

// `username` is CITEXT in production; PGlite ships the extension as an opt-in
// module, so it has to be handed to the instance before the DDL asks for it.
export const client = new PGlite({ extensions: { citext } });

const base = drizzle(client, { schema });

function hasRows(value: unknown): value is { rows: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { rows?: unknown }).rows)
  );
}

/**
 * The double has to answer in the *production driver's* shape, not PGlite's.
 * postgres-js resolves `db.execute()` to the row array itself; PGlite resolves
 * it to a `{ rows, fields, affectedRows }` result object. `lib/rate-limit.ts`
 * reads `rows[0].count` off the return value, so without this the counter
 * would silently read `undefined` and the limiter would look infinitely
 * permissive under test. Everything else is forwarded untouched.
 */
export const db = new Proxy(base, {
  get(target, prop) {
    if (prop === "execute") {
      return async (query: SQLWrapper | string) => {
        const result: unknown = await target.execute(query);
        return hasRows(result) ? result.rows : result;
      };
    }
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as PgliteDatabase<typeof schema>;

let applied: Promise<void> | null = null;

/** Apply the bootstrap schema once per test file. */
export function applySchema(): Promise<void> {
  applied ??= client.exec(bootstrapDdl()).then(() => undefined);
  return applied;
}

/** Empty every table between tests without paying for a second boot. */
export async function truncateAll(): Promise<void> {
  await applySchema();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  if (rows.length === 0) return;
  const list = rows.map((row) => `"${row.tablename}"`).join(", ");
  await client.exec(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * drizzle wraps every driver error in a `DrizzleQueryError` and hangs the
 * original off `cause`, so the SQLSTATE is one level down. Walks the chain so
 * a test can assert on "23505" regardless of which layer threw.
 */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
