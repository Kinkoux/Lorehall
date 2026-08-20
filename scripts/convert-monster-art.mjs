// Converts the locally generated engraving-style monster plates (1024x1024 PNG,
// one per SRD monster, filename = the monster's `index` in lib/data/monsters.json)
// into web-sized WebP files under public/monsters/, and writes the manifest
// lib/data/monster-art.json that the compendium reads to decide whether a
// monster has local art (and can therefore skip the Wikimedia fallback).
//
// Usage:
//   node scripts/convert-monster-art.mjs [sourceDir] [--quality=82] [--size=640] [--force]
//
// Idempotent: a destination that already exists and is newer than its source is
// left alone (pass --force to re-encode everything, e.g. after a quality change).
// The source folder is only ever read from.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = "C:/Users/Burak/Desktop/Lorehall Images Complete";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const sourceDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE);
const quality = Number(flag("quality", "82"));
const size = Number(flag("size", "640"));
const force = args.includes("--force");

if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
  console.error(`Invalid --quality: ${flag("quality", "")}`);
  process.exit(1);
}
if (!Number.isFinite(size) || size < 1) {
  console.error(`Invalid --size: ${flag("size", "")}`);
  process.exit(1);
}

const outDir = path.join(root, "public", "monsters");
// 40px CSS boxes on the compendium list read from here — a fraction of the
// full plate's bytes across the sixty rows a list page can show.
const thumbDir = path.join(outDir, "t");
const THUMB_SIZE = 96;
const THUMB_QUALITY = 75;
const manifestPath = path.join(root, "lib", "data", "monster-art.json");

const monsters = JSON.parse(await readFile(path.join(root, "lib", "data", "monsters.json"), "utf8"));
const known = new Set(monsters.map((m) => m.index));

let entries;
try {
  entries = await readdir(sourceDir);
} catch (err) {
  console.error(`Cannot read source directory ${sourceDir}: ${err.message}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
await mkdir(thumbDir, { recursive: true });

const sources = entries.filter((f) => f.toLowerCase().endsWith(".png")).sort();
const errors = [];
const skippedUnknown = [];
const done = [];
let written = 0;
let upToDate = 0;

for (const file of sources) {
  const slug = file.slice(0, -4);
  if (!known.has(slug)) {
    // No monsters.json entry to hang this plate on — report it, never guess.
    skippedUnknown.push(file);
    continue;
  }
  const src = path.join(sourceDir, file);
  const dest = path.join(outDir, `${slug}.webp`);
  const thumbDest = path.join(thumbDir, `${slug}.webp`);
  try {
    const [srcStat, destStat, thumbStat] = await Promise.all([
      stat(src),
      stat(dest).catch(() => null),
      stat(thumbDest).catch(() => null),
    ]);
    const destFresh = !force && destStat && destStat.mtimeMs >= srcStat.mtimeMs;
    const thumbFresh = !force && thumbStat && thumbStat.mtimeMs >= srcStat.mtimeMs;
    if (destFresh && thumbFresh) {
      upToDate += 1;
      done.push(slug);
      continue;
    }
    if (!destFresh) {
      await sharp(src)
        .resize(size, size, { fit: "cover", position: "centre" })
        .webp({ quality })
        .toFile(dest);
    }
    if (!thumbFresh) {
      await sharp(src)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: THUMB_QUALITY })
        .toFile(thumbDest);
    }
    written += 1;
    done.push(slug);
  } catch (err) {
    errors.push({ file, message: err.message });
  }
}

const manifest = [...new Set(done)].sort();
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const outFiles = (await readdir(outDir)).filter((f) => f.endsWith(".webp"));
const sizes = await Promise.all(
  outFiles.map(async (f) => (await stat(path.join(outDir, f))).size)
);
const totalBytes = sizes.reduce((a, b) => a + b, 0);
const thumbFiles = (await readdir(thumbDir)).filter((f) => f.endsWith(".webp"));
const thumbBytes = (
  await Promise.all(thumbFiles.map(async (f) => (await stat(path.join(thumbDir, f))).size))
).reduce((a, b) => a + b, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(2);

console.log(`source        ${sourceDir}`);
console.log(`output        ${path.relative(root, outDir)}  (${size}x${size} webp q${quality})`);
console.log(`png found     ${sources.length}`);
console.log(`converted     ${written}`);
console.log(`up to date    ${upToDate}`);
console.log(`manifest      ${manifest.length} slugs -> ${path.relative(root, manifestPath)}`);
console.log(`files on disk ${outFiles.length} plates + ${thumbFiles.length} thumbs (${THUMB_SIZE}px q${THUMB_QUALITY})`);
console.log(`total size    ${mb(totalBytes)} MB plates + ${mb(thumbBytes)} MB thumbs`);
if (outFiles.length) {
  console.log(
    `per file      avg ${mb(totalBytes / outFiles.length)} MB, max ${mb(Math.max(...sizes))} MB`
  );
}
if (skippedUnknown.length) {
  console.log(`\nskipped (no monsters.json index): ${skippedUnknown.length}`);
  for (const f of skippedUnknown) console.log(`  ${f}`);
}
if (errors.length) {
  console.log(`\nerrors: ${errors.length}`);
  for (const e of errors) console.log(`  ${e.file}: ${e.message}`);
  process.exitCode = 1;
}
