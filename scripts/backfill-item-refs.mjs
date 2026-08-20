// Gives old inventory lines the source they were stocked without.
//
// Sheet items only started carrying a reference (srd_index / world_item_id) on
// 2026-08-19; every line typed before that is a bare name, so it draws the
// generic backpack plate, links nowhere, and — since the armour rules read the
// SRD entry — grants no armour class even when the name says "Leather Armor".
// This walks those rows and re-attaches the source their name obviously means.
//
// Matching is exact, on lower(name), and in this order:
//   1. an SRD item of the same name  → srd_index (+ slot, when the SRD places it)
//   2. otherwise, a world_items entry of the same name in *this character's own
//      world* → world_item_id (+ slot + a snapshot of its bonuses)
// Anything the name does not match exactly is left alone. A fuzzy match here
// would quietly restat somebody's character, which is worse than doing nothing.
//
// Never overwrites a column that already has a value, and never touches
// `equipped` — a sheet must not change what it is wearing because a script ran.
//
// Usage:
//   node scripts/backfill-item-refs.mjs            # dry run (default)
//   node scripts/backfill-item-refs.mjs --apply    # actually writes
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL yok — .env.local doldurulmalı.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
console.log(apply ? "MOD: --apply (yazacak)" : "MOD: dry-run (hiçbir şey yazılmaz)");

// The compendium's own copy of the SRD, read straight off disk: this is a
// plain script and cannot import the TypeScript module that normally serves it.
const items = JSON.parse(
  readFileSync(path.join(process.cwd(), "lib", "data", "items.json"), "utf8")
);

/**
 * Mirror of srdItemSlot() in lib/srd-data.ts — kept deliberately short so the
 * duplication is obvious and checkable: a weapon is held, body armour is worn,
 * a shield goes in a hand, a ring on a finger, and nothing else is guessed.
 */
function srdItemSlot(item) {
  if (item.category === "weapon") return "weapon";
  if (item.category === "armor") return item.sub === "Shield" ? "hands" : "armor";
  if (item.category === "magic" && item.sub === "Ring") return "ring";
  return null;
}

const srdByName = new Map();
for (const item of items) {
  // First entry wins; SRD names are unique, and a duplicate would be a data bug
  // rather than a choice this script should be making.
  const key = item.name.trim().toLowerCase();
  if (!srdByName.has(key)) srdByName.set(key, item);
}

const sql = postgres(url, { prepare: false, connect_timeout: 15 });
const stats = { rows: 0, srd: 0, world: 0, unmatched: 0 };

try {
  // Every unreferenced line, with the world its sheet is played in — that is
  // the only library it may borrow from.
  const rows = await sql`
    SELECT ci.id,
           ci.name,
           ci.slot,
           ci.stat_bonuses,
           ci.equipped,
           c.name AS character_name,
           cp.world_id
      FROM character_items ci
      JOIN characters c  ON c.id = ci.character_id
      JOIN campaigns  cp ON cp.id = c.campaign_id
     WHERE ci.srd_index IS NULL
       AND ci.world_item_id IS NULL
     ORDER BY ci.created_at`;

  stats.rows = rows.length;
  console.log(`referanssız satır: ${rows.length}\n`);

  for (const row of rows) {
    const key = String(row.name).trim().toLowerCase();
    const where = `${row.character_name} · "${row.name}"`;

    const srd = srdByName.get(key);
    if (srd) {
      // The slot only fills a hole; a row that already knows where it is worn
      // keeps its answer, even when the SRD would have said something else.
      const slot = row.slot ?? srdItemSlot(srd);
      const setsSlot = row.slot === null && slot !== null;
      console.log(
        `SRD   ${where} → srd_index=${srd.index}${setsSlot ? `, slot=${slot}` : ""}`
      );
      if (apply) {
        await sql`
          UPDATE character_items
             SET srd_index = ${srd.index},
                 slot = COALESCE(slot, ${slot})
           WHERE id = ${row.id}
             AND srd_index IS NULL
             AND world_item_id IS NULL`;
      }
      stats.srd += 1;
      continue;
    }

    const [entry] = await sql`
      SELECT id, slot, stat_bonuses
        FROM world_items
       WHERE world_id = ${row.world_id}
         AND lower(name) = ${key}
       LIMIT 1`;
    if (entry) {
      const slot = row.slot ?? entry.slot ?? null;
      const setsSlot = row.slot === null && slot !== null;
      // The snapshot is what the entry grants *now*; a line that already has
      // one keeps it, because that one was taken when it was stocked.
      const setsBonuses = row.stat_bonuses === null && entry.stat_bonuses !== null;
      console.log(
        `LIB   ${where} → world_item_id=${entry.id}` +
          `${setsSlot ? `, slot=${slot}` : ""}${setsBonuses ? ", stat_bonuses=snapshot" : ""}`
      );
      if (apply) {
        await sql`
          UPDATE character_items
             SET world_item_id = ${entry.id},
                 slot = COALESCE(slot, ${slot}),
                 stat_bonuses = COALESCE(stat_bonuses, ${entry.stat_bonuses})
           WHERE id = ${row.id}
             AND srd_index IS NULL
             AND world_item_id IS NULL`;
      }
      stats.world += 1;
      continue;
    }

    console.log(`—     ${where} → eşleşme yok, dokunulmadı`);
    stats.unmatched += 1;
  }

  console.log(
    `\nÖZET: ${stats.rows} satır · SRD ${stats.srd} · kütüphane ${stats.world} · eşleşmeyen ${stats.unmatched}`
  );
  if (!apply && stats.srd + stats.world > 0) {
    console.log("Yazmak için: node scripts/backfill-item-refs.mjs --apply");
  }
} finally {
  await sql.end({ timeout: 3 });
}
