// One-time data migration: local SQLite (data/dnd-hub.db) -> Supabase
// Postgres, plus data/uploads/maps/* -> Supabase Storage.
// Idempotent: rows use ON CONFLICT DO NOTHING, files use x-upsert.
// Usage: npm run db:migrate-local
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
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
  console.error("DATABASE_URL yok.");
  process.exit(1);
}
const dbPath = path.join(process.cwd(), "data", "dnd-hub.db");
if (!existsSync(dbPath)) {
  console.error("data/dnd-hub.db yok — taşınacak lokal veri bulunamadı.");
  process.exit(1);
}

// FK-safe insert order.
const TABLES = [
  "users",
  "worlds",
  "world_members",
  "campaigns",
  "campaign_members",
  "codex_entries",
  "sessions",
  "combatants",
  "session_events",
  "characters",
  "character_items",
  "character_abilities",
  "story_beats",
  "quests",
  "party_ledger",
  "party_items",
  "encounters",
  "encounter_monsters",
  "campaign_maps",
];

const sqlite = new Database(dbPath, { readonly: true });
const sql = postgres(url, { prepare: false, connect_timeout: 15 });

try {
  for (const table of TABLES) {
    const exists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) {
      console.log(`${table}: lokal tablo yok, atlandı`);
      continue;
    }
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) {
      console.log(`${table}: 0 satır`);
      continue;
    }
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await sql`INSERT INTO ${sql(table)} ${sql(chunk)} ON CONFLICT DO NOTHING`;
    }
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(table)}`;
    console.log(`${table}: ${rows.length} lokal satır -> Postgres'te ${n}`);
  }

  // Upload local map files to Supabase Storage.
  const sb = {
    url: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    bucket: process.env.SUPABASE_STORAGE_BUCKET || "maps",
  };
  const mapsDir = path.join(process.cwd(), "data", "uploads", "maps");
  if (sb.url && sb.key && existsSync(mapsDir)) {
    const mimeByExt = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    for (const file of readdirSync(mapsDir)) {
      const ext = file.split(".").pop().toLowerCase();
      const mime = mimeByExt[ext];
      if (!mime) continue;
      const bytes = readFileSync(path.join(mapsDir, file));
      const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${file}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb.key}`,
          apikey: sb.key,
          "Content-Type": mime,
          "x-upsert": "true",
        },
        body: bytes,
      });
      console.log(`storage: ${file} -> ${res.ok ? "OK" : `HATA ${res.status}`}`);
    }
  }
  console.log("\nMigration tamam.");
} finally {
  sqlite.close();
  await sql.end({ timeout: 3 });
}
