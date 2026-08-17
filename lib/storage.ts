import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Map images live in Supabase Storage when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set (Vercel), else on local disk under
 * data/uploads/maps — same local-only lifecycle as the SQLite file.
 * The bucket must exist and can stay private: all reads go through the
 * service key, and the /files/maps route enforces campaign permissions.
 */
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "maps";

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Works with both legacy JWT service_role keys and new sb_secret_ keys. */
function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

function localPath(name: string) {
  return path.join(process.cwd(), "data", "uploads", "maps", path.basename(name));
}

export async function putMapFile(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string
) {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: {
        ...authHeaders(sb.key),
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!res.ok) {
      throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
    }
    return;
  }
  await fs.mkdir(path.dirname(localPath(name)), { recursive: true });
  await fs.writeFile(localPath(name), bytes);
}

export type MapFile = {
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
  contentLength: string | null;
};

/**
 * Streams from Supabase (no in-memory buffering of multi-MB maps);
 * local files are read whole — they're on the same disk anyway.
 */
export async function readMapFile(name: string): Promise<MapFile | null> {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${name}`, {
      headers: authHeaders(sb.key),
    });
    if (!res.ok || !res.body) return null;
    return { body: res.body, contentLength: res.headers.get("content-length") };
  }
  try {
    const bytes = new Uint8Array(await fs.readFile(localPath(name)));
    return { body: bytes, contentLength: String(bytes.byteLength) };
  } catch {
    return null;
  }
}

export async function deleteMapFile(name: string) {
  const sb = supabase();
  if (sb) {
    await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${name}`, {
      method: "DELETE",
      headers: authHeaders(sb.key),
    });
    return;
  }
  await fs.unlink(localPath(name)).catch(() => {});
}
