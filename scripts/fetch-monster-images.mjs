// Match SRD monsters to freely-licensed artwork via the English Wikipedia
// REST summary API. We accept a thumbnail ONLY when it is hosted under
// upload.wikimedia.org/wikipedia/commons/ — Wikimedia Commons hosts free
// (PD/CC) media exclusively, while fair-use copyrighted images live under
// /wikipedia/en/ and are rejected. Output: lib/data/monster-images.json
//   { [monsterIndex]: { img, page, title } }
// Usage: node scripts/fetch-monster-images.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "lib", "data");
const monsters = JSON.parse(await readFile(path.join(dataDir, "monsters.json"), "utf8"));

const HEADERS = {
  "User-Agent": "Lorehall-hobby-app/1.0 (personal D&D companion; contact: local)",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function summary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.type === "disambiguation") return null;
    const img = json.thumbnail?.source ?? json.originalimage?.source ?? null;
    if (!img || !img.includes("/wikipedia/commons/")) return null; // free media only
    return {
      // Keep the size the API actually served — upscaled thumb URLs 400 when
      // the source image is smaller than the requested width.
      img,
      page: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      title: json.title,
    };
  } catch {
    return null;
  }
}

/** Candidate article titles, most specific first. */
function candidates(name) {
  const out = [name];
  // "Adult Red Dragon" → "Red Dragon"? No such folklore article — go generic.
  const stripped = name
    .replace(/^(Adult|Ancient|Young|Greater|Lesser|Giant|Swarm of|Half-)\s+/i, "")
    .replace(/,.*$/, "");
  if (stripped !== name) out.push(stripped);
  if (/dragon$/i.test(name)) out.push("European dragon");
  if (/^Swarm of (.+)$/i.test(name)) out.push(name.replace(/^Swarm of\s+/i, "").replace(/s$/, ""));
  const last = name.split(" ").pop();
  if (last && last !== name && last.length > 3) out.push(last);
  // Mythology-first disambiguation for heavily overloaded names.
  const MYTH = {
    Medusa: "Medusa", Kraken: "Kraken", Ghost: "Ghost", Vampire: "Vampire",
    Werewolf: "Werewolf", Unicorn: "Unicorn", Basilisk: "Basilisk (mythology)",
    Chimera: "Chimera (mythology)", Cyclops: "Cyclops", Griffon: "Griffin",
    Harpy: "Harpy", Hydra: "Lernaean Hydra", Minotaur: "Minotaur",
    Pegasus: "Pegasus", Sphinx: "Sphinx", Wight: "Wight", Zombie: "Zombie",
    Lich: "Lich", Goblin: "Goblin", Ogre: "Ogre", Troll: "Troll",
    Gnoll: "Gnoll", Kobold: "Kobold", Imp: "Imp", Ghoul: "Ghoul",
    Banshee: "Banshee", Doppelganger: "Doppelgänger", Salamander: "Salamander (folklore)",
    Djinni: "Jinn", Efreeti: "Ifrit", Roc: "Roc (mythology)", Wyvern: "Wyvern",
    Satyr: "Satyr", Dryad: "Dryad", Gorgon: "Gorgon", Mummy: "Mummy",
    Skeleton: "Skeleton (undead)", Treant: "Ent", Manticore: "Manticore",
    Centaur: "Centaur", Behir: null, Bulette: null,
  };
  for (const key of Object.keys(MYTH)) {
    if (name.toLowerCase().includes(key.toLowerCase()) && MYTH[key]) out.unshift(MYTH[key]);
  }
  return [...new Set(out)];
}

// Merge mode: keep previous matches, only retry monsters without one.
let result = {};
try {
  result = JSON.parse(await readFile(path.join(dataDir, "monster-images.json"), "utf8"));
} catch {}
let hits = Object.keys(result).length;
for (const m of monsters) {
  if (result[m.index]) continue;
  for (const title of candidates(m.name)) {
    let found = await summary(title);
    if (!found) {
      await sleep(300);
      found = await summary(title); // one retry per candidate for transient failures
    }
    if (found) {
      result[m.index] = found;
      hits++;
      break;
    }
    await sleep(80);
  }
  await sleep(80);
}

await writeFile(path.join(dataDir, "monster-images.json"), JSON.stringify(result));
console.log(`matched ${hits}/${monsters.length} monsters to free Commons images`);
