// One-shot: creates the private 'maps' storage bucket if missing.
import { readFileSync } from "node:fs";
import path from "node:path";

const env = {};
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.SUPABASE_URL.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = env.SUPABASE_STORAGE_BUCKET || "maps";
const headers = { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" };

const res = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST",
  headers,
  body: JSON.stringify({ id: bucket, name: bucket, public: false }),
});
console.log("create bucket:", res.status, await res.text());
