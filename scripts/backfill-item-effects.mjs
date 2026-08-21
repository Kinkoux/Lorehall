// Gives already-stocked SRD lines the mechanics their description states.
//
// Until now an SRD item arrived on a sheet with no `stat_bonuses` at all (the
// compendium button wrote the one "+N bonus to AC" a regex could see, and the
// sheet's own add form wrote nothing), so a ring of protection protected
// nobody and an amulet of health was a necklace. `lib/data/item-effects.json`
// is the hand-read answer for every entry whose prose states something this
// model can hold; this walks the rows stocked before it existed and stamps it
// on.
//
// Touched: rows with an `srd_index` whose entry the table grants something
// for, and whose `stat_bonuses` is still NULL.
//
// Never touched: a row that already carries bonuses. That column is where the
// line editor writes what a player typed, and a script that overwrote it would
// silently restat somebody's character — the one outcome worse than a missing
// bonus. Nothing about `equipped`, `slot`, `ac_base` or `ac_dex` is written
// either: what a character is wearing must not change because a script ran.
//
// Usage:
//   node scripts/backfill-item-effects.mjs            # dry run (default)
//   node scripts/backfill-item-effects.mjs --apply    # actually writes
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Resolved from this file, not from the shell's cwd: a data file the script
 * cannot run without should not depend on where it was started. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EFFECTS = JSON.parse(
  readFileSync(path.join(root, "lib", "data", "item-effects.json"), "utf8")
);

/** Mirrors WORLD_ITEM_STATS / ABILITY_STATS in lib/db/schema.ts. */
const STATS = ["ac", "str", "dex", "con", "int", "wis", "cha", "hp"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Mirror of stringifyStatBonuses() in lib/world-items.ts — kept short so the
 * duplication is obvious and checkable: the same keys, the same ±10 clamp on a
 * flat bonus and 1–30 on a floor, and NULL rather than `{}` for an entry that
 * grants nothing. A plain script cannot import the TypeScript module that
 * normally serves this, so a test asserts the two agree.
 */
export function snapshotFor(index) {
  const effect = EFFECTS[index];
  if (!effect) return null;
  const out = {};
  for (const stat of STATS) {
    const value = effect.bonuses?.[stat];
    if (!Number.isInteger(value) || value === 0) continue;
    out[stat] = Math.min(Math.max(value, -10), 10);
  }
  const floors = {};
  let floored = false;
  for (const stat of ABILITIES) {
    const value = effect.floors?.[stat];
    if (!Number.isInteger(value)) continue;
    floors[stat] = Math.min(Math.max(value, 1), 30);
    floored = true;
  }
  if (floored) out.floors = floors;
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
}

/**
 * What this script would do to one row, as a value rather than as a side
 * effect — which is what makes the dry run and the real run the same decision
 * made twice rather than two pieces of code that have to be kept in step.
 *
 * NULL means "leave it alone", and there are three ways to earn that: no SRD
 * entry behind the line, a player's own numbers already on it, or an entry the
 * curated table grants nothing for.
 */
export function planRow(row) {
  if (!row.srd_index) return null;
  if (row.stat_bonuses !== null && row.stat_bonuses !== undefined) return null;
  const statBonuses = snapshotFor(row.srd_index);
  return statBonuses ? { id: row.id, srdIndex: row.srd_index, statBonuses } : null;
}

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL yok — .env.local doldurulmalı.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  console.log(apply ? "MOD: --apply (yazacak)" : "MOD: dry-run (hiçbir şey yazılmaz)");

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, connect_timeout: 15 });
  const stats = { rows: 0, written: 0, skippedOwn: 0, nothing: 0 };

  try {
    const rows = await sql`
      SELECT ci.id,
             ci.name,
             ci.srd_index,
             ci.stat_bonuses,
             c.name AS character_name
        FROM character_items ci
        JOIN characters c ON c.id = ci.character_id
       WHERE ci.srd_index IS NOT NULL
       ORDER BY ci.created_at`;

    stats.rows = rows.length;
    console.log(`SRD referanslı satır: ${rows.length}\n`);

    for (const row of rows) {
      const plan = planRow(row);
      if (!plan) {
        if (row.stat_bonuses !== null) stats.skippedOwn += 1;
        else stats.nothing += 1;
        continue;
      }
      console.log(
        `${row.character_name} · "${row.name}" (${plan.srdIndex}) → ${plan.statBonuses}`
      );
      if (apply) {
        // The NULL check rides along into the UPDATE: between the read above
        // and this write a player may have typed their own numbers onto the
        // line, and theirs win.
        await sql`
          UPDATE character_items
             SET stat_bonuses = ${plan.statBonuses}
           WHERE id = ${plan.id}
             AND stat_bonuses IS NULL`;
      }
      stats.written += 1;
    }

    console.log(
      `\nözet: ${stats.written} satır ${apply ? "yazıldı" : "yazılacaktı"}, ` +
        `${stats.skippedOwn} satırda zaten bonus var (dokunulmadı), ` +
        `${stats.nothing} satırın SRD girdisi bir şey vermiyor.`
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Importable for tests, runnable for the DM: the query only happens when this
// file is the thing that was started.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
