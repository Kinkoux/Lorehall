// Validates .env.local Supabase values and tests connectivity.
// Prints only pass/fail + hostnames — never secrets.
import { readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const issues = [];
const url = env.SUPABASE_URL ?? "";
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = env.DATABASE_URL ?? "";
const bucket = env.SUPABASE_STORAGE_BUCKET || "maps";

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))
  issues.push("SUPABASE_URL formatı beklenen gibi değil (https://xxxx.supabase.co)");
if (!(key.startsWith("sb_secret_") || key.startsWith("eyJ")))
  issues.push("SUPABASE_SERVICE_ROLE_KEY sb_secret_... ya da eyJ... ile başlamalı");
if (key.startsWith("sb_publishable_") || key.includes("anon"))
  issues.push("Bu publishable/anon key gibi görünüyor — secret key lazım");
if (!dbUrl) issues.push("DATABASE_URL boş");
if (dbUrl.includes("[YOUR-PASSWORD]") || dbUrl.includes("YOUR-PASSWORD"))
  issues.push("DATABASE_URL içindeki [YOUR-PASSWORD] hâlâ değiştirilmemiş");

let parsedDb = null;
try {
  parsedDb = new URL(dbUrl);
  console.log("DB host:", parsedDb.hostname, "port:", parsedDb.port || "(default)");
  if (parsedDb.port !== "6543")
    console.log("  not: port 6543 değil — transaction pooler önerilir, ama devam edilebilir");
} catch {
  if (dbUrl) issues.push("DATABASE_URL geçerli bir URI olarak parse edilemedi");
}

if (issues.length) {
  console.log("\nSORUNLAR:");
  for (const i of issues) console.log(" -", i);
  process.exit(1);
}

// Storage: bucket var mı?
const headers = { Authorization: `Bearer ${key}`, apikey: key };
const bRes = await fetch(`${url.replace(/\/$/, "")}/storage/v1/bucket/${bucket}`, { headers });
if (bRes.ok) {
  const info = await bRes.json();
  console.log(`Storage OK — bucket '${bucket}' mevcut, public=${info.public}`);
  if (info.public) console.log("  UYARI: bucket public — private olması önerilir");
} else {
  console.log(`Storage HATA — bucket '${bucket}' erişilemedi: HTTP ${bRes.status} ${await bRes.text()}`);
  process.exit(1);
}

// DB: select 1
const { default: postgres } = await import("postgres");
const sql = postgres(dbUrl, { prepare: false, connect_timeout: 15 });
try {
  const r = await sql`select 1 as ok, current_database() as db, version() as v`;
  console.log("Postgres OK —", r[0].db, "|", String(r[0].v).split(" on ")[0]);
} catch (e) {
  console.log("Postgres HATA —", e.code ?? "", e.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 3 });
}
console.log("\nHEPSİ TAMAM ✓");
