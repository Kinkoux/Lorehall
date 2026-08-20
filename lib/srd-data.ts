import type { WorldItemSlot } from "@/lib/db/schema";
import spellsJson from "@/lib/data/spells.json";
import monstersJson from "@/lib/data/monsters.json";
import monsterImagesJson from "@/lib/data/monster-images.json";
import monsterArtJson from "@/lib/data/monster-art.json";
import itemsJson from "@/lib/data/items.json";

export type SrdSpell = {
  index: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  subclasses: string[];
  desc: string;
  higherLevel: string | null;
};

export type SrdMonsterAction = { name: string; desc: string };

export type SrdMonster = {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number | null;
  acType: string | null;
  hp: number;
  hitDice: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  intel: number;
  wis: number;
  cha: number;
  dexMod: number;
  saves: string | null;
  skills: string | null;
  vulnerabilities: string | null;
  resistances: string | null;
  immunities: string | null;
  conditionImmunities: string | null;
  senses: string;
  languages: string;
  cr: number;
  crLabel: string;
  xp: number;
  traits: SrdMonsterAction[];
  actions: SrdMonsterAction[];
  legendary: SrdMonsterAction[];
};

/** The six filter buckets `scripts/fetch-srd-items.mjs` sorts SRD gear into. */
export const ITEM_CATEGORIES = ["weapon", "armor", "gear", "tool", "vehicle", "magic"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export type SrdItem = {
  index: string;
  name: string;
  category: ItemCategory;
  /** Finer SRD grouping: "Martial Melee", "Heavy", "Artisan's Tools", "Potion"… */
  sub: string | null;
  cost: string | null;
  /** Pounds. */
  weight: number | null;
  ac: string | null;
  strMin: number | null;
  stealth: boolean;
  damage: string | null;
  twoHanded: string | null;
  range: string | null;
  thrown: string | null;
  properties: string | null;
  rarity: string | null;
  attunement: boolean;
  speed: string | null;
  capacity: string | null;
  contents: string | null;
  desc: string;
};

export const SPELLS = spellsJson as SrdSpell[];
export const MONSTERS = monstersJson as SrdMonster[];
export const ITEMS = itemsJson as SrdItem[];

/** Freely-licensed artwork (Wikimedia Commons only), matched at fetch time. */
export type MonsterImage = { img: string; page: string; title: string };
export const MONSTER_IMAGES = monsterImagesJson as Record<string, MonsterImage>;
export const getMonsterImage = (index: string): MonsterImage | undefined =>
  MONSTER_IMAGES[index];

/**
 * Monsters with a local engraving plate under `public/monsters/`, written by
 * `scripts/convert-monster-art.mjs`.
 */
export const MONSTER_ART = new Set(monsterArtJson as string[]);

/**
 * The picture to show for a monster: the local plate when we have one, else the
 * Wikimedia photo we matched at fetch time. `credit` is set only in the second
 * case — the local art is ours, so it carries no attribution line.
 */
export type MonsterArt = { src: string; thumb: string; credit: MonsterImage | null };

export function getMonsterArt(index: string): MonsterArt | undefined {
  if (MONSTER_ART.has(index))
    return {
      src: `/monsters/${index}.webp`,
      thumb: `/monsters/t/${index}.webp`,
      credit: null,
    };
  const fallback = getMonsterImage(index);
  // Wikimedia URLs are already thumbnail-sized; the same file serves both roles.
  return fallback ? { src: fallback.img, thumb: fallback.img, credit: fallback } : undefined;
}

export const SPELL_CLASSES = [...new Set(SPELLS.flatMap((s) => s.classes))].sort();
export const SPELL_SCHOOLS = [...new Set(SPELLS.map((s) => s.school))].sort();

/**
 * Subclass spell-list filters. SRD entries come straight from the data
 * (spells tagged with the subclass); the rest are rule-based presets — the
 * subclass casts from a class list restricted to certain schools, which is a
 * game mechanic we can express without reproducing non-SRD text.
 */
export type SubclassFilter = {
  key: string;
  label: string;
  kind: "srd" | "rule";
  test: (spell: SrdSpell) => boolean;
};

const SRD_SUBCLASS_PARENT: Record<string, string> = {
  Lore: "Bard",
  Life: "Cleric",
  Devotion: "Paladin",
  Fiend: "Warlock",
  Land: "Druid",
};

export const SUBCLASS_FILTERS: SubclassFilter[] = [
  ...Object.entries(SRD_SUBCLASS_PARENT).map(
    ([name, parent]): SubclassFilter => ({
      key: name.toLowerCase(),
      label: `${name} (${parent})`,
      kind: "srd",
      test: (spell) => spell.subclasses.includes(name),
    })
  ),
  {
    key: "arcane-trickster",
    label: "Arcane Trickster (Rogue)",
    kind: "rule",
    test: (spell: SrdSpell) =>
      spell.classes.includes("Wizard") &&
      (spell.level === 0 || ["Enchantment", "Illusion"].includes(spell.school)),
  } satisfies SubclassFilter,
  {
    key: "eldritch-knight",
    label: "Eldritch Knight (Fighter)",
    kind: "rule",
    test: (spell: SrdSpell) =>
      spell.classes.includes("Wizard") &&
      (spell.level === 0 || ["Abjuration", "Evocation"].includes(spell.school)),
  } satisfies SubclassFilter,
].sort((a, b) => a.label.localeCompare(b.label));
export const CR_LABELS = [...new Set(MONSTERS.map((m) => m.crLabel))].sort(
  (a, b) => crValue(a) - crValue(b)
);

function crValue(label: string) {
  if (label.includes("/")) {
    const [n, d] = label.split("/").map(Number);
    return n / d;
  }
  return Number(label);
}

export const getSpell = (index: string) => SPELLS.find((s) => s.index === index);
export const getMonster = (index: string) => MONSTERS.find((m) => m.index === index);
export const getItem = (index: string) => ITEMS.find((i) => i.index === index);

export function searchSpells(
  q: string,
  level: string,
  klass: string,
  school = "",
  subclass = ""
) {
  const needle = q.trim().toLowerCase();
  const subclassFilter = SUBCLASS_FILTERS.find((f) => f.key === subclass);
  return SPELLS.filter(
    (s) =>
      (!needle || s.name.toLowerCase().includes(needle)) &&
      (!level || s.level === Number(level)) &&
      (!klass || s.classes.includes(klass)) &&
      (!school || s.school === school) &&
      (!subclassFilter || subclassFilter.test(s))
  );
}

export function searchItems(q: string, category: string) {
  const needle = q.trim().toLowerCase();
  return ITEMS.filter(
    (i) =>
      (!needle || i.name.toLowerCase().includes(needle)) &&
      (!category || i.category === category)
  );
}

export function searchMonsters(q: string, cr: string) {
  const needle = q.trim().toLowerCase();
  return MONSTERS.filter(
    (m) =>
      (!needle || m.name.toLowerCase().includes(needle)) &&
      (!cr || m.crLabel === cr)
  );
}

export const spellLevelLabel = (level: number) =>
  level === 0 ? "Cantrip" : `Level ${level}`;

/**
 * English fallback labels for the item buckets. The UI translates categories
 * through the dictionary; this map is for `itemSummary`, whose text is written
 * into the database next to the (English) SRD item name.
 */
const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: "Weapon",
  armor: "Armor",
  gear: "Adventuring gear",
  tool: "Tool",
  vehicle: "Mount or vehicle",
  magic: "Magic item",
};

/**
 * Which equipment slot an SRD entry obviously belongs in — and only where it
 * is obvious. The SRD has no slot field, so this reads the two groupings that
 * leave no room for argument (a weapon is held, body armor is worn) plus the
 * two sub-buckets that are equally plain: a shield goes in a hand, a ring on a
 * finger. A potion, a coil of rope, a wondrous item: no guess, NULL, and the
 * player names the slot themselves when they equip it.
 */
export function srdItemSlot(item: SrdItem): WorldItemSlot | null {
  if (item.category === "weapon") return "weapon";
  if (item.category === "armor") return item.sub === "Shield" ? "hands" : "armor";
  if (item.category === "magic" && item.sub === "Ring") return "ring";
  return null;
}

/** One-line summary used when adding an SRD item to a character's inventory. */
export function itemSummary(item: SrdItem) {
  const rarity = item.rarity && (item.attunement ? `${item.rarity} (attunement)` : item.rarity);
  const parts = [
    item.sub ?? ITEM_CATEGORY_LABELS[item.category],
    rarity,
    item.damage && (item.twoHanded ? `${item.damage} (${item.twoHanded})` : item.damage),
    item.ac && `AC ${item.ac}`,
    item.properties,
    item.cost,
    item.weight != null && `${item.weight} lb.`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** One-line summary used when adding an SRD spell to a character sheet. */
export function spellSummary(spell: SrdSpell) {
  const parts = [
    `${spellLevelLabel(spell.level)} ${spell.school.toLowerCase()}`,
    spell.castingTime,
    spell.range,
    spell.duration + (spell.concentration ? " (conc.)" : ""),
  ];
  return parts.join(" · ");
}
