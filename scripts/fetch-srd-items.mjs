// One-time fetch of SRD 5.1 equipment + magic items (CC-BY-4.0) from the
// 5e-bits/5e-database repo — same source as scripts/fetch-srd.mjs — trimmed to
// the fields the /compendium/items pages display. Output: lib/data/items.json
// Usage: node scripts/fetch-srd-items.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/5e-bits/5e-database/main";
const CANDIDATES = {
  equipment: [`${BASE}/src/2014/en/5e-SRD-Equipment.json`],
  magicItems: [`${BASE}/src/2014/en/5e-SRD-Magic-Items.json`],
};

async function fetchFirst(urls) {
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`fetched ${url}`);
      return res.json();
    }
    console.log(`miss ${url} (${res.status})`);
  }
  throw new Error(`none of the candidate URLs worked: ${urls.join(", ")}`);
}

/** Our six filter buckets, keyed off the API's equipment_category index. */
const CATEGORY_OF = {
  weapon: "weapon",
  armor: "armor",
  "adventuring-gear": "gear",
  tools: "tool",
  "mounts-and-vehicles": "vehicle",
};
const CATEGORY_ORDER = ["weapon", "armor", "gear", "tool", "vehicle", "magic"];

const money = (cost) => (cost ? `${cost.quantity} ${cost.unit}` : null);

const dmg = (d) =>
  d?.damage_dice ? `${d.damage_dice} ${(d.damage_type?.name ?? "").toLowerCase()}`.trim() : null;

function reach(range) {
  if (!range?.normal) return null;
  return range.long ? `${range.normal}/${range.long} ft.` : `${range.normal} ft.`;
}

function armorClass(ac) {
  if (!ac || typeof ac.base !== "number") return null;
  if (!ac.dex_bonus) return String(ac.base);
  return ac.max_bonus ? `${ac.base} + Dex (max ${ac.max_bonus})` : `${ac.base} + Dex`;
}

/** Equipment packs list their contents; render them as one compact line. */
function contentsLine(contents) {
  if (!contents?.length) return null;
  return contents
    .map((c) => `${c.item?.name ?? ""}${c.quantity > 1 ? ` ×${c.quantity}` : ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

const RARITY_RE = /\b(common|uncommon|very rare|rare|legendary|artifact|varies)\b/i;
// A type word opening a period-less line ("Wondrous item, rarity by figurine").
const TYPE_LINE_RE =
  /^(wondrous items?|wondous item|weapon|armor|potion|ring|rod|scroll|staff|wand|ammunition)\b[^.]*$/i;

/**
 * Magic item descriptions open with a redundant header line —
 * "Wondrous item, uncommon (requires attunement)" — that repeats the category
 * and rarity we already store as fields. Detect it, keep the attunement bit,
 * drop the line. (A few SRD entries misspell the type or skip the rarity,
 * hence the two loose tests.)
 */
function splitHeader(desc) {
  const first = (desc[0] ?? "").trim();
  const isHeader = first.length <= 140 && (RARITY_RE.test(first) || TYPE_LINE_RE.test(first));
  return {
    attunement: /requires attunement/i.test(first),
    body: isHeader ? desc.slice(1) : desc,
  };
}

const base = (item) => ({
  index: item.index,
  name: item.name,
  cost: null,
  weight: null,
  sub: null,
  ac: null,
  strMin: null,
  stealth: false,
  damage: null,
  twoHanded: null,
  range: null,
  thrown: null,
  properties: null,
  rarity: null,
  attunement: false,
  speed: null,
  capacity: null,
  contents: null,
  desc: "",
});

function trimEquipment(e) {
  const category = CATEGORY_OF[e.equipment_category?.index] ?? "gear";
  const sub =
    e.category_range ??
    e.armor_category ??
    e.tool_category ??
    e.vehicle_category ??
    e.gear_category?.name ??
    e.equipment_category?.name ??
    null;
  return {
    ...base(e),
    category,
    sub,
    cost: money(e.cost),
    weight: typeof e.weight === "number" ? e.weight : null,
    ac: armorClass(e.armor_class),
    strMin: e.str_minimum > 0 ? e.str_minimum : null,
    stealth: Boolean(e.stealth_disadvantage),
    damage: dmg(e.damage),
    twoHanded: dmg(e.two_handed_damage),
    range: e.weapon_range === "Ranged" ? reach(e.range) : null,
    thrown: reach(e.throw_range),
    properties: (e.properties ?? []).map((p) => p.name).join(", ") || null,
    speed: e.speed ? `${e.speed.quantity} ${e.speed.unit}` : null,
    capacity: e.capacity ?? null,
    contents: contentsLine(e.contents),
    desc: [...(e.desc ?? []), ...(e.special ?? [])].join("\n\n"),
  };
}

function trimMagicItem(m) {
  const { attunement, body } = splitHeader(m.desc ?? []);
  return {
    ...base(m),
    category: "magic",
    sub: m.equipment_category?.name ?? null,
    rarity: m.rarity?.name ?? null,
    attunement,
    desc: body.join("\n\n"),
  };
}

const outDir = path.resolve(import.meta.dirname, "..", "lib", "data");
await mkdir(outDir, { recursive: true });

const equipment = (await fetchFirst(CANDIDATES.equipment)).map(trimEquipment);
const magicItems = (await fetchFirst(CANDIDATES.magicItems)).map(trimMagicItem);

const items = [...equipment, ...magicItems].sort(
  (a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    a.name.localeCompare(b.name)
);
await writeFile(path.join(outDir, "items.json"), JSON.stringify(items));

const perCategory = Object.fromEntries(
  CATEGORY_ORDER.map((c) => [c, items.filter((i) => i.category === c).length])
);
console.log(`items: ${items.length}`, perCategory);
