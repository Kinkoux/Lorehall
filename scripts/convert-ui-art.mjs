// Converts the locally generated engraving-style interface plates (1024x1024
// PNG) into web-sized WebP files under public/art/. Unlike the monster plates
// these have no manifest: every name is known up front (the ALLOWED list
// below), and lib/ui-art.ts builds the URLs from that same fixed vocabulary.
//
// Usage:
//   node scripts/convert-ui-art.mjs [sourceDir] [--quality=80] [--size=512] [--force]
//
// Idempotent: a destination that already exists and is newer than its source is
// left alone (pass --force to re-encode everything, e.g. after a quality
// change). The source folder is only ever read from.
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = "C:/Users/Burak/Desktop/Lorehall UI Images";

// The full vocabulary lib/ui-art.ts can ask for. A source file outside this
// list is reported and skipped rather than silently published under a name
// nothing links to.
const CLASSES = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];
const SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
];
const CATEGORIES = ["weapon", "armor", "gear", "tool", "vehicle", "magic"];
const EMPTIES = [
  "codex",
  "inventory",
  "quests",
  "journal",
  "maps",
  "party",
  "spells",
  "library",
  "encounters",
  "treasury",
];
const ALLOWED = new Set([
  ...CLASSES.map((c) => `class-${c}`),
  ...SCHOOLS.map((s) => `school-${s}`),
  ...CATEGORIES.map((c) => `cat-${c}`),
  ...EMPTIES.map((e) => `empty-${e}`),
]);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const sourceDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE);
const quality = Number(flag("quality", "80"));
const size = Number(flag("size", "512"));
const force = args.includes("--force");

if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
  console.error(`Invalid --quality: ${flag("quality", "")}`);
  process.exit(1);
}
if (!Number.isFinite(size) || size < 1) {
  console.error(`Invalid --size: ${flag("size", "")}`);
  process.exit(1);
}

const outDir = path.join(root, "public", "art");

let entries;
try {
  entries = await readdir(sourceDir);
} catch (err) {
  console.error(`Cannot read source directory ${sourceDir}: ${err.message}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const sources = entries.filter((f) => f.toLowerCase().endsWith(".png")).sort();
const errors = [];
const skippedUnknown = [];
const done = [];
let written = 0;
let upToDate = 0;

for (const file of sources) {
  const slug = file.slice(0, -4);
  if (!ALLOWED.has(slug)) {
    // Nothing in lib/ui-art.ts would ever request this name — report it, never
    // guess at what it was meant to be.
    skippedUnknown.push(file);
    continue;
  }
  const src = path.join(sourceDir, file);
  const dest = path.join(outDir, `${slug}.webp`);
  try {
    const [srcStat, destStat] = await Promise.all([stat(src), stat(dest).catch(() => null)]);
    if (!force && destStat && destStat.mtimeMs >= srcStat.mtimeMs) {
      upToDate += 1;
      done.push(slug);
      continue;
    }
    await sharp(src)
      .resize(size, size, { fit: "cover", position: "centre" })
      .webp({ quality })
      .toFile(dest);
    written += 1;
    done.push(slug);
  } catch (err) {
    errors.push({ file, message: err.message });
  }
}

const missing = [...ALLOWED].filter((slug) => !done.includes(slug)).sort();

const outFiles = (await readdir(outDir)).filter((f) => f.endsWith(".webp"));
const sizes = await Promise.all(
  outFiles.map(async (f) => (await stat(path.join(outDir, f))).size)
);
const totalBytes = sizes.reduce((a, b) => a + b, 0);
const kb = (n) => `${Math.round(n / 1024)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

console.log(`source        ${sourceDir}`);
console.log(`output        ${path.relative(root, outDir)}  (${size}x${size} webp q${quality})`);
console.log(`png found     ${sources.length}`);
console.log(`converted     ${written}`);
console.log(`up to date    ${upToDate}`);
console.log(`files on disk ${outFiles.length} of ${ALLOWED.size} known names`);
console.log(`total size    ${mb(totalBytes)}`);
if (outFiles.length) {
  console.log(`per file      avg ${kb(totalBytes / outFiles.length)}, max ${kb(Math.max(...sizes))}`);
}
if (missing.length) {
  console.log(`\nno source plate: ${missing.length}`);
  for (const slug of missing) console.log(`  ${slug}.png`);
}
if (skippedUnknown.length) {
  console.log(`\nskipped (not a known plate name): ${skippedUnknown.length}`);
  for (const f of skippedUnknown) console.log(`  ${f}`);
}
if (errors.length) {
  console.log(`\nerrors: ${errors.length}`);
  for (const e of errors) console.log(`  ${e.file}: ${e.message}`);
  process.exitCode = 1;
}
