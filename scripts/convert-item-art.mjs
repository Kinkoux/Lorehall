// Converts the locally generated engraving-style item plates (1024x1024 PNG)
// into web-sized WebP files, and writes the manifest lib/data/item-art.json
// that the compendium reads to decide whether an item has its own plate.
//
// The source folder holds two kinds of file:
//   kind-<slug>.png  a plate for one of the 40 item kinds in
//                    lib/data/item-kinds.json (that file maps every item index
//                    to its kind slug). These land in public/art/ next to the
//                    other interface plates written by convert-ui-art.mjs, at
//                    the same fixed 512px/q80 those use — they are shared by
//                    every row of a kind, so the browser caches one copy and
//                    the encode settings must not drift with the flags below.
//                    A kind plate stands in for an item that never got its own
//                    engraving, so it is cut down to the same three sizes an
//                    item plate is (public/art/t/ and public/art/m/): the day
//                    the kind branch fires, a 40px list row must not be paying
//                    for a 512px file.
//   <index>.png      a plate for one specific item, filename = the item's
//                    `index` in lib/data/items.json. These land in
//                    public/items/, with a thumb in public/items/t/ and a
//                    middle size in public/items/m/, and are the ones listed in
//                    the manifest.
//
// The manifest records what is actually published on disk, not what this run
// happened to touch: it is read back from public/items/ after the encoding, so
// a run over a partial source folder — or one file that sharp choked on —
// cannot delete a perfectly good plate from the list the compendium reads.
//
// Usage:
//   node scripts/convert-item-art.mjs [sourceDir] [--quality=82] [--size=640] [--force]
//
// Idempotent: a destination that already exists and is newer than its source is
// left alone (pass --force to re-encode everything, e.g. after a quality
// change). Each size is judged on its own, so adding a size below re-encodes
// only the missing one. The source folder is only ever read from.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = "C:/Users/Burak/Desktop/Lorehall Item Images";

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

const itemDir = path.join(root, "public", "items");
// 40px CSS boxes on the compendium list read from here — a fraction of the
// full plate's bytes across the rows a list page can show.
const thumbDir = path.join(itemDir, "t");
const THUMB_SIZE = 96;
const THUMB_QUALITY = 75;
// The character sheet's inventory squares sit between the two: never wider
// than about 100 CSS px, which a 256px file covers even on a retina screen.
// Fixed like the thumb, because the size answers to a layout rather than to a
// taste for detail, and a flag has no business moving it.
const midDir = path.join(itemDir, "m");
const MID_SIZE = 256;
const MID_QUALITY = 80;
// Kind plates share public/art/ with the interface plates, so they share those
// encode settings too and ignore --size/--quality on purpose. Their two
// smaller cuts live in subfolders of the same directory and match the item
// thumb and mid exactly — the same layouts ask for them.
const kindDir = path.join(root, "public", "art");
const kindThumbDir = path.join(kindDir, "t");
const kindMidDir = path.join(kindDir, "m");
const KIND_SIZE = 512;
const KIND_QUALITY = 80;
const KIND_PREFIX = "kind-";
const manifestPath = path.join(root, "lib", "data", "item-art.json");

const items = JSON.parse(await readFile(path.join(root, "lib", "data", "items.json"), "utf8"));
const knownItems = new Set(items.map((i) => i.index));
const itemKinds = JSON.parse(
  await readFile(path.join(root, "lib", "data", "item-kinds.json"), "utf8")
);
// item-kinds.json is a flat index -> kind map; the kind vocabulary is its set
// of values.
const knownKinds = new Set(Object.values(itemKinds));

let entries;
try {
  entries = await readdir(sourceDir);
} catch (err) {
  console.error(`Cannot read source directory ${sourceDir}: ${err.message}`);
  process.exit(1);
}

await mkdir(itemDir, { recursive: true });
await mkdir(thumbDir, { recursive: true });
await mkdir(midDir, { recursive: true });
await mkdir(kindDir, { recursive: true });
await mkdir(kindThumbDir, { recursive: true });
await mkdir(kindMidDir, { recursive: true });

const sources = entries.filter((f) => f.toLowerCase().endsWith(".png")).sort();
const errors = [];
const skippedUnknown = [];
const kindsDone = [];
let written = 0;
let upToDate = 0;
let kindWritten = 0;
let kindUpToDate = 0;

for (const file of sources) {
  const slug = file.slice(0, -4);
  const src = path.join(sourceDir, file);

  if (slug.startsWith(KIND_PREFIX)) {
    const kind = slug.slice(KIND_PREFIX.length);
    if (!knownKinds.has(kind)) {
      // No item in item-kinds.json carries this kind — report it, never guess.
      skippedUnknown.push(file);
      continue;
    }
    const dest = path.join(kindDir, `${slug}.webp`);
    const kindThumbDest = path.join(kindThumbDir, `${slug}.webp`);
    const kindMidDest = path.join(kindMidDir, `${slug}.webp`);
    try {
      const [srcStat, destStat, kindMidStat, kindThumbStat] = await Promise.all([
        stat(src),
        stat(dest).catch(() => null),
        stat(kindMidDest).catch(() => null),
        stat(kindThumbDest).catch(() => null),
      ]);
      const fresh = (s) => Boolean(!force && s && s.mtimeMs >= srcStat.mtimeMs);
      const destFresh = fresh(destStat);
      const midFresh = fresh(kindMidStat);
      const thumbFresh = fresh(kindThumbStat);
      if (destFresh && midFresh && thumbFresh) {
        kindUpToDate += 1;
        kindsDone.push(kind);
        continue;
      }
      if (!destFresh) {
        await sharp(src)
          .resize(KIND_SIZE, KIND_SIZE, { fit: "cover", position: "centre" })
          .webp({ quality: KIND_QUALITY })
          .toFile(dest);
      }
      if (!midFresh) {
        await sharp(src)
          .resize(MID_SIZE, MID_SIZE, { fit: "cover", position: "centre" })
          .webp({ quality: MID_QUALITY })
          .toFile(kindMidDest);
      }
      if (!thumbFresh) {
        await sharp(src)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
          .webp({ quality: THUMB_QUALITY })
          .toFile(kindThumbDest);
      }
      kindWritten += 1;
      kindsDone.push(kind);
    } catch (err) {
      errors.push({ file, message: err.message });
    }
    continue;
  }

  if (!knownItems.has(slug)) {
    // No items.json entry to hang this plate on — report it, never guess.
    skippedUnknown.push(file);
    continue;
  }
  const dest = path.join(itemDir, `${slug}.webp`);
  const midDest = path.join(midDir, `${slug}.webp`);
  const thumbDest = path.join(thumbDir, `${slug}.webp`);
  try {
    const [srcStat, destStat, midStat, thumbStat] = await Promise.all([
      stat(src),
      stat(dest).catch(() => null),
      stat(midDest).catch(() => null),
      stat(thumbDest).catch(() => null),
    ]);
    const fresh = (s) => Boolean(!force && s && s.mtimeMs >= srcStat.mtimeMs);
    const destFresh = fresh(destStat);
    const midFresh = fresh(midStat);
    const thumbFresh = fresh(thumbStat);
    if (destFresh && midFresh && thumbFresh) {
      upToDate += 1;
      continue;
    }
    if (!destFresh) {
      await sharp(src)
        .resize(size, size, { fit: "cover", position: "centre" })
        .webp({ quality })
        .toFile(dest);
    }
    if (!midFresh) {
      await sharp(src)
        .resize(MID_SIZE, MID_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: MID_QUALITY })
        .toFile(midDest);
    }
    if (!thumbFresh) {
      await sharp(src)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: THUMB_QUALITY })
        .toFile(thumbDest);
    }
    written += 1;
  } catch (err) {
    errors.push({ file, message: err.message });
  }
}

const bytesIn = async (dir, names) =>
  (await Promise.all(names.map(async (f) => (await stat(path.join(dir, f))).size))).reduce(
    (a, b) => a + b,
    0
  );
const webpIn = async (dir) => (await readdir(dir)).filter((f) => f.endsWith(".webp"));

const itemFiles = await webpIn(itemDir);

/**
 * The manifest is a reading of the shelf, not a log of the run: every plate
 * standing in public/items/ whose name is an index items.json knows. Deriving
 * it from disk is what makes the script safe to run against half a source
 * folder — the plates it did not see this time are still there, still listed —
 * and what stops a single file sharp refused from quietly unpublishing the
 * good copy an earlier run left behind. Kind plates are not in it: lib/ builds
 * their names from item-kinds.json, so nothing has to look them up.
 */
const manifest = itemFiles
  .map((f) => f.slice(0, -".webp".length))
  .filter((slug) => knownItems.has(slug))
  .sort();
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const covered = new Set(manifest);
const missingItems = items.map((i) => i.index).filter((index) => !covered.has(index));
const coveredKinds = new Set(kindsDone);
const missingKinds = [...knownKinds].filter((kind) => !coveredKinds.has(kind)).sort();

const itemSizes = await Promise.all(
  itemFiles.map(async (f) => (await stat(path.join(itemDir, f))).size)
);
const itemBytes = itemSizes.reduce((a, b) => a + b, 0);
const midFiles = await webpIn(midDir);
const midBytes = await bytesIn(midDir, midFiles);
const thumbFiles = await webpIn(thumbDir);
const thumbBytes = await bytesIn(thumbDir, thumbFiles);
// public/art also holds the interface plates, so count only the kind- ones.
// The t/ and m/ subfolders hold nothing else, but the filter stays for symmetry.
const kindFiles = (await webpIn(kindDir)).filter((f) => f.startsWith(KIND_PREFIX));
const kindBytes = await bytesIn(kindDir, kindFiles);
const kindMidFiles = (await webpIn(kindMidDir)).filter((f) => f.startsWith(KIND_PREFIX));
const kindMidBytes = await bytesIn(kindMidDir, kindMidFiles);
const kindThumbFiles = (await webpIn(kindThumbDir)).filter((f) => f.startsWith(KIND_PREFIX));
const kindThumbBytes = await bytesIn(kindThumbDir, kindThumbFiles);
const mb = (n) => (n / 1024 / 1024).toFixed(2);

console.log(`source        ${sourceDir}`);
console.log(
  `items out     ${path.relative(root, itemDir)}  (${size}x${size} webp q${quality}, +${MID_SIZE}px q${MID_QUALITY} m/, +${THUMB_SIZE}px q${THUMB_QUALITY} t/)`
);
console.log(
  `kinds out     ${path.relative(root, kindDir)}  (${KIND_SIZE}x${KIND_SIZE} webp q${KIND_QUALITY}, fixed, same m/ and t/ cuts)`
);
console.log(`png found     ${sources.length}`);
console.log(`items         ${written} converted, ${upToDate} up to date`);
console.log(`kinds         ${kindWritten} converted, ${kindUpToDate} up to date`);
console.log(`manifest      ${manifest.length} indexes -> ${path.relative(root, manifestPath)}`);
console.log(
  `files on disk ${itemFiles.length} plates + ${midFiles.length} mids + ${thumbFiles.length} thumbs`
);
console.log(
  `              ${kindFiles.length} kinds + ${kindMidFiles.length} kind mids + ${kindThumbFiles.length} kind thumbs`
);
console.log(
  `total size    ${mb(itemBytes)} MB plates + ${mb(midBytes)} MB mids + ${mb(thumbBytes)} MB thumbs`
);
console.log(
  `              ${mb(kindBytes)} MB kinds + ${mb(kindMidBytes)} MB kind mids + ${mb(kindThumbBytes)} MB kind thumbs`
);
if (itemFiles.length) {
  console.log(
    `per plate     avg ${mb(itemBytes / itemFiles.length)} MB, max ${mb(Math.max(...itemSizes))} MB`
  );
}
if (missingKinds.length) {
  console.log(`\nno source plate (kind): ${missingKinds.length} of ${knownKinds.size}`);
  for (const kind of missingKinds) console.log(`  ${KIND_PREFIX}${kind}.png`);
}
if (missingItems.length) {
  // 599 items — show a sample rather than a wall of names.
  const sample = missingItems.slice(0, 20);
  console.log(`\nno source plate (item): ${missingItems.length} of ${items.length}`);
  for (const index of sample) console.log(`  ${index}.png`);
  if (missingItems.length > sample.length) {
    console.log(`  ... and ${missingItems.length - sample.length} more`);
  }
}
if (skippedUnknown.length) {
  console.log(`\nskipped (no items.json index / unknown kind): ${skippedUnknown.length}`);
  for (const f of skippedUnknown) console.log(`  ${f}`);
}
if (errors.length) {
  console.log(`\nerrors: ${errors.length}`);
  for (const e of errors) console.log(`  ${e.file}: ${e.message}`);
  process.exitCode = 1;
}
