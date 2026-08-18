import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Uploaded images live in Supabase Storage when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set (Vercel), else on local disk under
 * data/uploads/<area> — same local-only lifecycle as the SQLite file.
 * The bucket must exist and can stay private: all reads go through the
 * service key, and the /files routes enforce campaign permissions.
 *
 * Two areas share the bucket: maps keep their historical keys at the root,
 * portraits are namespaced under "portraits/".
 */
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "maps";

/** Where one kind of upload lives: bucket key prefix + local subdirectory. */
type Area = { prefix: string; dir: string };
const MAPS: Area = { prefix: "", dir: "maps" };
const PORTRAITS: Area = { prefix: "portraits/", dir: "portraits" };

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Works with both legacy JWT service_role keys and new sb_secret_ keys. */
function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

/** basename() everywhere: a stored name never escapes its own area. */
function objectKey(area: Area, name: string) {
  return `${area.prefix}${path.basename(name)}`;
}

function localPath(area: Area, name: string) {
  return path.join(process.cwd(), "data", "uploads", area.dir, path.basename(name));
}

async function putFile(
  area: Area,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string
) {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${objectKey(area, name)}`, {
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
  await fs.mkdir(path.dirname(localPath(area, name)), { recursive: true });
  await fs.writeFile(localPath(area, name), bytes);
}

export type MapFile = {
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
  contentLength: string | null;
};

/**
 * Streams from Supabase (no in-memory buffering of multi-MB maps);
 * local files are read whole — they're on the same disk anyway.
 */
async function readFile(area: Area, name: string): Promise<MapFile | null> {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${objectKey(area, name)}`, {
      headers: authHeaders(sb.key),
    });
    if (!res.ok || !res.body) return null;
    return { body: res.body, contentLength: res.headers.get("content-length") };
  }
  try {
    const bytes = new Uint8Array(await fs.readFile(localPath(area, name)));
    return { body: bytes, contentLength: String(bytes.byteLength) };
  } catch {
    return null;
  }
}

async function deleteFile(area: Area, name: string) {
  const sb = supabase();
  if (sb) {
    await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${objectKey(area, name)}`, {
      method: "DELETE",
      headers: authHeaders(sb.key),
    });
    return;
  }
  await fs.unlink(localPath(area, name)).catch(() => {});
}

export function putMapFile(name: string, bytes: Uint8Array<ArrayBuffer>, contentType: string) {
  return putFile(MAPS, name, bytes, contentType);
}

export function readMapFile(name: string): Promise<MapFile | null> {
  return readFile(MAPS, name);
}

export function deleteMapFile(name: string) {
  return deleteFile(MAPS, name);
}

export function putPortraitFile(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string
) {
  return putFile(PORTRAITS, name, bytes, contentType);
}

export function readPortraitFile(name: string): Promise<MapFile | null> {
  return readFile(PORTRAITS, name);
}

export function deletePortraitFile(name: string) {
  return deleteFile(PORTRAITS, name);
}
