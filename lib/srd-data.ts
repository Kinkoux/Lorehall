import type { WorldItemSlot } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n";
import {
  categorySlot,
  stringifyStatBonuses,
  type AbilityFloors,
  type StatBonuses,
} from "@/lib/world-items";
import spellsJson from "@/lib/data/spells.json";
import spellsExtraJson from "@/lib/data/spells-extra.json";
import spellAliasesJson from "@/lib/data/spell-aliases.json";
import monstersJson from "@/lib/data/monsters.json";
import monsterImagesJson from "@/lib/data/monster-images.json";
import monsterArtJson from "@/lib/data/monster-art.json";
import itemsJson from "@/lib/data/items.json";
import itemsTrJson from "@/lib/data/items-tr.json";
import monstersTrJson from "@/lib/data/monsters-tr.json";
import itemEffectsJson from "@/lib/data/item-effects.json";
import itemArtJson from "@/lib/data/item-art.json";
import itemKindsJson from "@/lib/data/item-kinds.json";
import { categoryArt, kindArt, kindArtMid, kindArtThumb } from "@/lib/ui-art";

/**
 * The header of a spell — the block a player reads off the top of the entry
 * before the prose starts. Every field here is a plain mechanical fact, and
 * that is precisely why it is its own type: the SRD's entries carry the prose
 * as well, and the entries in `spells-extra.json` carry nothing but this.
 */
export type SpellFacts = {
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
};

export type SrdSpell = SpellFacts & {
  subclasses: string[];
  desc: string;
  higherLevel: string | null;
};

/** The books an out-of-SRD entry can name. Expanded for readers in the dict. */
export const SPELL_SOURCES = ["XGE", "TCE", "SCAG", "SCC", "AI"] as const;
export type SpellSource = (typeof SPELL_SOURCES)[number];

/**
 * A spell this library knows *of* but may not print: the header facts and the
 * book they were printed in, and deliberately not one word more.
 *
 * The compendium's licence covers the SRD and only the SRD (see /legal), so
 * the rules text of a spell from Xanathar's or Tasha's cannot live here. What
 * can is the header — a name, a level, a school, a casting time, a range, the
 * component letters, a duration, a class list, a book. None of that is
 * expression anyone owns; all of it is what a player at a table actually needs
 * from a compendium at the moment they need it, which is "does this fit in the
 * slot I have left, and which book do I open?"
 *
 * So an entry is a signpost, never a substitute. There is no `desc` field and
 * no summary field either, because a paraphrase of a spell's effect is still
 * the spell's effect; the card and the page both say plainly that the text
 * lives in the reader's own copy, and the sheet lets them write their own note
 * beside it — which is the one legitimate way the full text ever reaches a
 * screen here, typed by the person who owns the book.
 */
export type ExtraSpell = SpellFacts & { source: SpellSource };

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
export const EXTRA_SPELLS = spellsExtraJson as ExtraSpell[];
export const MONSTERS = monstersJson as SrdMonster[];
export const ITEMS = itemsJson as SrdItem[];

/**
 * The mark that tells the two shelves apart wherever only an index survives —
 * a stored `srd_index` on a sheet's ability row, a URL, a hidden form field.
 * No SRD index begins with it, so a prefix is the whole of the distinction and
 * nothing had to be migrated to gain it.
 */
export const EXTRA_PREFIX = "x-";

/** One spell entry from either shelf, when a caller wants the union. */
export type SpellEntry = SrdSpell | ExtraSpell;

/** Which shelf an entry came off, asked of the entry rather than of an index. */
export const isExtraSpell = (spell: SpellEntry): spell is ExtraSpell => "source" in spell;

const EXTRA_SPELL_BY_INDEX = new Map(EXTRA_SPELLS.map((s) => [s.index, s] as const));

export const getExtraSpell = (index: string) => EXTRA_SPELL_BY_INDEX.get(index);

/**
 * A spell named by index, from whichever shelf holds it, and *labelled* with
 * the shelf so no caller has to guess from the string.
 *
 * This exists because the alternative was a scattering of `index.startsWith`
 * checks in five files — the sheet's preview card, the compendium page, the
 * two actions that stock a row, the lookahead — and the fifth one would have
 * been the one written wrong. A caller asks once and is told everything: what
 * the entry is, and whether it may print the text.
 */
export type SpellRef = { kind: "srd"; spell: SrdSpell } | { kind: "extra"; spell: ExtraSpell };

export function spellRef(index: string): SpellRef | undefined {
  if (index.startsWith(EXTRA_PREFIX)) {
    const extra = EXTRA_SPELL_BY_INDEX.get(index);
    return extra && { kind: "extra", spell: extra };
  }
  const srd = SPELL_BY_INDEX.get(index);
  return srd && { kind: "srd", spell: srd };
}

/**
 * The names a printed book gives an SRD spell — "Bigby's Hand" for the entry
 * the SRD publishes as "Arcane Hand". The SRD strips the wizards' names out of
 * the titles (they are the one part of those spells anybody owns), which means
 * a player reading a character sheet built off a Player's Handbook types a
 * name this library has never heard of and is told there is no such spell.
 *
 * The map answers that, and it answers it *into the SRD entry*: an alias is a
 * second spelling of a spell we do have in full, not a stub. Keyed by the
 * printed name and folded on the way in, so lookups are case-insensitive.
 */
export const SPELL_ALIASES = spellAliasesJson as Record<string, string>;

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

/**
 * Items with an engraving of their very own under `public/items/`, written by
 * `scripts/convert-item-art.mjs`.
 */
export const ITEM_ART = new Set(itemArtJson as string[]);

/**
 * What *shape* of thing each SRD entry is — an axe, a flask, a coil of rope —
 * so an entry with no plate of its own can still be drawn as the thing it is
 * rather than as the filter bucket it files under. One plate serves the whole
 * kind, which is why forty of them cover six hundred entries.
 */
const ITEM_KINDS = new Map(Object.entries(itemKindsJson as Record<string, string>));

/**
 * One plate at the three sizes it is published in: the full engraving, the
 * 256px cut the sheet's inventory squares read (they are never wider than
 * about 100 CSS px, so 256 satisfies a retina screen and nothing more), and
 * the 96px cut the 40px list rows read.
 */
export type SrdItemArt = { src: string; thumb: string; mid: string };

/**
 * The picture for an SRD entry: its own plate first, its kind's plate second,
 * and nothing at all when the compendium has never heard of it — at which
 * point the caller falls back to the category plate, which is the one picture
 * every item is guaranteed. `srdItemArt` below walks all three and is what
 * most callers want.
 *
 * The kind step is a safety net that is not currently load-bearing, and that
 * is the point of it: the manifest covers all 599 entries today, so the branch
 * never fires. It exists for the two days it will — the day an entry is added
 * to items.json before anyone has drawn it, and the day the manifest is
 * rebuilt over a partial source folder. Deleting it as dead code would mean
 * discovering on one of those days that a dagger is drawn as "a weapon".
 *
 * Each kind plate is cut to the same three sizes an item plate is (see
 * scripts/convert-item-art.mjs): forty extra files, against a 512px download
 * for every 40px row on the day the net catches something.
 */
export function getItemArt(index: string): SrdItemArt | undefined {
  if (ITEM_ART.has(index))
    return {
      src: `/items/${index}.webp`,
      thumb: `/items/t/${index}.webp`,
      mid: `/items/m/${index}.webp`,
    };
  const kind = ITEM_KINDS.get(index);
  return kind
    ? { src: kindArt(kind), thumb: kindArtThumb(kind), mid: kindArtMid(kind) }
    : undefined;
}

/**
 * The same question with a guaranteed answer, the way `getMonsterArt` carries
 * its own floor: the category plate stands in where the two steps above have
 * nothing, so a caller holding an SRD entry never has to write the chain out
 * again. Three pages had written it out, and a fourth would have got it wrong.
 *
 * `getItemArt` stays exported because the character sheet needs the undefined:
 * a line there may carry a photograph of the actual piece, and the category it
 * infers from an equipment slot must not out-rank that photograph. Only a
 * caller that can see the *whole* chain may decide what a nothing means.
 */
export function srdItemArt(item: SrdItem): SrdItemArt {
  const art = getItemArt(item.index);
  if (art) return art;
  const src = categoryArt(item.category);
  return { src, thumb: src, mid: src };
}

/**
 * The dropdowns, read off both shelves together — because the list underneath
 * them is both shelves together. Artificer reaches this list only through the
 * fact stubs (the SRD has no artificer), and offering the filter is the honest
 * move: the entries are there, the rows say which book they come from, and a
 * filter that hid them would be lying about what the page holds.
 */
export const SPELL_CLASSES = [
  ...new Set([...SPELLS, ...EXTRA_SPELLS].flatMap((s) => s.classes)),
].sort();
export const SPELL_SCHOOLS = [
  ...new Set([...SPELLS, ...EXTRA_SPELLS].map((s) => s.school)),
].sort();

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
  test: (spell: SpellEntry) => boolean;
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
      // The subclass tags are an SRD field; a fact stub carries no such tag,
      // and answering "no" for one is the truth rather than an omission.
      test: (spell) => !isExtraSpell(spell) && spell.subclasses.includes(name),
    })
  ),
  {
    key: "arcane-trickster",
    label: "Arcane Trickster (Rogue)",
    kind: "rule",
    test: (spell: SpellEntry) =>
      spell.classes.includes("Wizard") &&
      (spell.level === 0 || ["Enchantment", "Illusion"].includes(spell.school)),
  } satisfies SubclassFilter,
  {
    key: "eldritch-knight",
    label: "Eldritch Knight (Fighter)",
    kind: "rule",
    test: (spell: SpellEntry) =>
      spell.classes.includes("Wizard") &&
      (spell.level === 0 || ["Abjuration", "Evocation"].includes(spell.school)),
  } satisfies SubclassFilter,
].sort((a, b) => a.label.localeCompare(b.label));
export const CR_LABELS = [...new Set(MONSTERS.map((m) => m.crLabel))].sort(
  (a, b) => crValue(a) - crValue(b)
);

/**
 * The creature type an SRD line reduces to, for filtering. The data writes its
 * types out in full — "fiend (devil)", "humanoid (any race)", "swarm of Tiny
 * beasts" — which is thirty-three distinct strings, far more than a dropdown
 * can usefully hold. The parenthetical is the sub-race, so it comes off; a
 * swarm files under one bucket of its own rather than under the beast it is
 * made of, because "show me the swarms" is the question people actually ask.
 */
export function monsterBaseType(type: string): string {
  const text = type.trim().toLowerCase();
  if (text.startsWith("swarm")) return "swarm";
  const paren = text.indexOf("(");
  return (paren === -1 ? text : text.slice(0, paren)).trim();
}

/** The buckets the rule above leaves, alphabetically: the type dropdown. */
export const MONSTER_TYPES = [
  ...new Set(MONSTERS.map((m) => monsterBaseType(m.type))),
].sort();

/** Sizes in the order the game lists them, narrowed to those in the data. */
const SIZE_ORDER = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
export const MONSTER_SIZES = SIZE_ORDER.filter((size) =>
  MONSTERS.some((m) => m.size === size)
);

function crValue(label: string) {
  if (label.includes("/")) {
    const [n, d] = label.split("/").map(Number);
    return n / d;
  }
  return Number(label);
}

// Indexed once at module load rather than scanned per lookup: a character
// sheet asks `getItem` for every line in the backpack and again for every worn
// piece, and a linear walk of a few hundred entries per question is a cost
// paid on the server for no reason at all.
const SPELL_BY_INDEX = new Map(SPELLS.map((s) => [s.index, s] as const));
const MONSTER_BY_INDEX = new Map(MONSTERS.map((m) => [m.index, m] as const));
const ITEM_BY_INDEX = new Map(ITEMS.map((i) => [i.index, i] as const));

export const getSpell = (index: string) => SPELL_BY_INDEX.get(index);
export const getMonster = (index: string) => MONSTER_BY_INDEX.get(index);
export const getItem = (index: string) => ITEM_BY_INDEX.get(index);

/**
 * Turkish *names* for the SRD's own entries, keyed by index — and names only.
 *
 * The rest of an entry (its description, its stat block, the prose its
 * mechanics live in) stays in the English the SRD publishes it in, because
 * that is the text the licence covers and the text every table already reads
 * off a phone. What a Turkish player actually needs translated is the label
 * they hunt by: the thing is called a hançer, and the list should say so.
 *
 * The English name remains canonical everywhere it is *stored* — an inventory
 * row, a combatant, a campaign log line — so the name-resolution in
 * `character-actions` keeps working off one spelling. These maps are for
 * rendering and for searching, never for writing.
 *
 * Spells have no such map: none was translated, and half a list in Turkish
 * would read worse than all of it in English.
 */
const ITEM_NAMES_TR = itemsTrJson as Record<string, string>;
const MONSTER_NAMES_TR = monstersTrJson as Record<string, string>;

/** The Turkish name held for an index, or undefined where we have none. */
export const itemNameTr = (index: string): string | undefined => ITEM_NAMES_TR[index];
export const monsterNameTr = (index: string): string | undefined => MONSTER_NAMES_TR[index];

/**
 * What to call an entry on screen: the Turkish name in the Turkish locale
 * whenever one exists, and the SRD's own name in every other case — including
 * a Turkish reader looking at one of the entries no one has translated yet.
 *
 * Takes the entry or just its index, because half the callers are holding a
 * row that remembers only the index.
 */
export function localizedItemName(item: SrdItem | string, locale: Locale): string {
  const index = typeof item === "string" ? item : item.index;
  if (locale === "tr") {
    const turkish = ITEM_NAMES_TR[index];
    if (turkish) return turkish;
  }
  return (typeof item === "string" ? getItem(index)?.name : item.name) ?? index;
}

export function localizedMonsterName(monster: SrdMonster | string, locale: Locale): string {
  const index = typeof monster === "string" ? monster : monster.index;
  if (locale === "tr") {
    const turkish = MONSTER_NAMES_TR[index];
    if (turkish) return turkish;
  }
  return (typeof monster === "string" ? getMonster(index)?.name : monster.name) ?? index;
}

/**
 * Case folding for the name search.
 *
 * `toLowerCase()` on a Turkish dotted capital — "İksir" — leaves the dot
 * behind as a combining mark ("i̇ksir"), so a plain `includes` would refuse
 * the "iksir" a keyboard actually produces. Dropping U+0307 costs nothing in
 * English (no English word carries one) and repairs 63 of the item names.
 * Deliberately *not* a full diacritic fold: "hancer" still does not find the
 * hançer, which is the same bargain the English side already makes.
 */
const COMBINING_DOT = /\u0307/g;
const fold = (text: string) => text.toLowerCase().replace(COMBINING_DOT, "");

/**
 * Does this entry answer to what was typed, in either language? Both names are
 * always searched, whatever the locale: an English name is no burden to a
 * Turkish reader, and a Turkish one is how a Turkish reader finds the entry
 * even when the interface around it is in English.
 */
function matchesEither(needle: string, english: string, turkish: string | undefined) {
  const q = fold(needle);
  return fold(english).includes(q) || (turkish !== undefined && fold(turkish).includes(q));
}

export const itemMatchesName = (item: SrdItem, needle: string) =>
  matchesEither(needle, item.name, ITEM_NAMES_TR[item.index]);

/**
 * An exact whole-name lookup in either language, for stocking a line from a
 * hand-typed name. Built once; the Turkish side is duplicate-free by data
 * validation, so a fold can only ever name one entry.
 */
let ITEM_BY_ANY_NAME: Map<string, SrdItem> | null = null;

export function findItemByAnyName(raw: string): SrdItem | undefined {
  if (!ITEM_BY_ANY_NAME) {
    ITEM_BY_ANY_NAME = new Map();
    for (const item of ITEMS) {
      ITEM_BY_ANY_NAME.set(fold(item.name.trim()), item);
      const tr = ITEM_NAMES_TR[item.index];
      if (tr) ITEM_BY_ANY_NAME.set(fold(tr.trim()), item);
    }
  }
  return ITEM_BY_ANY_NAME.get(fold(raw.trim()));
}

export const monsterMatchesName = (monster: SrdMonster, needle: string) =>
  matchesEither(needle, monster.name, MONSTER_NAMES_TR[monster.index]);

/**
 * Every printed name that points at one SRD index, built once. Reversed from
 * the alias map rather than stored that way round, because the question a
 * reader asks is "what else is this called?" and the question a search asks is
 * "who answers to this?" — and one file cannot be keyed for both.
 */
let ALIASES_BY_INDEX: Map<string, string[]> | null = null;

function aliasIndex(): Map<string, string[]> {
  if (!ALIASES_BY_INDEX) {
    ALIASES_BY_INDEX = new Map();
    for (const [name, index] of Object.entries(SPELL_ALIASES)) {
      const held = ALIASES_BY_INDEX.get(index);
      if (held) held.push(name);
      else ALIASES_BY_INDEX.set(index, [name]);
    }
  }
  return ALIASES_BY_INDEX;
}

/** The printed names for an SRD spell, or nothing for one that was never renamed. */
export const spellAliases = (index: string): string[] => aliasIndex().get(index) ?? [];

/**
 * The printed name that answered this search, so a row found by typing
 * "Bigby's Hand" can say so instead of silently calling itself Arcane Hand and
 * leaving the reader to wonder whether they found the right spell.
 */
export function spellAliasHit(index: string, q: string): string | null {
  const needle = fold(q.trim());
  if (!needle) return null;
  return spellAliases(index).find((alias) => fold(alias).includes(needle)) ?? null;
}

/** Does this entry answer to what was typed — under its own name or a printed one? */
function spellMatchesName(spell: SpellEntry, needle: string) {
  if (fold(spell.name).includes(needle)) return true;
  return spellAliases(spell.index).some((alias) => fold(alias).includes(needle));
}

/**
 * The compendium's spell list: the SRD and the fact stubs, filtered together
 * and handed back in one sequence.
 *
 * Merged rather than appended. The SRD file is already ordered by level and
 * then by name, and a stub belongs where its level puts it — a cantrip the
 * reader can actually take should not be exiled to the bottom of the page
 * behind the 9th-level spells. The sort is a no-op on the SRD half by
 * construction (asserted in test/spells-extra.test.ts), so what it really does
 * is thread forty-odd rows into their places.
 */
export function searchSpells(
  q: string,
  level: string,
  klass: string,
  school = "",
  subclass = ""
): SpellEntry[] {
  const needle = fold(q.trim());
  const subclassFilter = SUBCLASS_FILTERS.find((f) => f.key === subclass);
  const entries: SpellEntry[] = [...SPELLS, ...EXTRA_SPELLS];
  return entries
    .filter(
      (s) =>
        (!needle || spellMatchesName(s, needle)) &&
        (!level || s.level === Number(level)) &&
        (!klass || s.classes.includes(klass)) &&
        (!school || s.school === school) &&
        (!subclassFilter || subclassFilter.test(s))
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * An exact whole-name lookup across everything a spell can be called: the
 * SRD's own name, a fact stub's name, or the printed name of a renamed SRD
 * entry. This is what stands behind the "add a spell" field when the hidden
 * reference never arrived — a player who types "Tasha's Hideous Laughter" gets
 * the SRD entry, and one who types "Booming Blade" gets the stub, and neither
 * is left with a bare line of text that links to nothing.
 *
 * Built once and case-folded, the same bargain `findItemByAnyName` makes.
 */
let SPELL_BY_ANY_NAME: Map<string, SpellRef> | null = null;

export function findSpellByAnyName(raw: string): SpellRef | undefined {
  if (!SPELL_BY_ANY_NAME) {
    SPELL_BY_ANY_NAME = new Map();
    for (const spell of SPELLS) SPELL_BY_ANY_NAME.set(fold(spell.name.trim()), { kind: "srd", spell });
    for (const spell of EXTRA_SPELLS)
      SPELL_BY_ANY_NAME.set(fold(spell.name.trim()), { kind: "extra", spell });
    // Last, and never over an entry's own name: an alias is a second door into
    // a spell, not a way to rename one out from under the book that has it.
    for (const [alias, index] of Object.entries(SPELL_ALIASES)) {
      const key = fold(alias.trim());
      const spell = SPELL_BY_INDEX.get(index);
      if (spell && !SPELL_BY_ANY_NAME.has(key)) SPELL_BY_ANY_NAME.set(key, { kind: "srd", spell });
    }
  }
  return SPELL_BY_ANY_NAME.get(fold(raw.trim()));
}

export function searchItems(q: string, category: string) {
  const needle = q.trim();
  return ITEMS.filter(
    (i) => (!needle || itemMatchesName(i, needle)) && (!category || i.category === category)
  );
}

/**
 * `type` matches the base type (see monsterBaseType), so "fiend" catches the
 * devils and the demons; `size` matches the SRD word, case-insensitively, so a
 * URL may carry either "Medium" or "medium".
 */
export function searchMonsters(q: string, cr: string, type = "", size = "") {
  const needle = q.trim();
  const wantedType = type.trim().toLowerCase();
  const wantedSize = size.trim().toLowerCase();
  return MONSTERS.filter(
    (m) =>
      (!needle || monsterMatchesName(m, needle)) &&
      (!cr || m.crLabel === cr) &&
      (!wantedType || monsterBaseType(m.type) === wantedType) &&
      (!wantedSize || m.size.toLowerCase() === wantedSize)
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
  const byCategory = categorySlot(item.category, item.sub);
  if (byCategory) return byCategory;
  if (item.category === "magic") {
    if (item.sub === "Ring") return "ring";
    if (item.sub === "Weapon") return "weapon";
    // The SRD files magic shields under the "Armor" sub-bucket; the name is
    // the only thing left that says which limb the piece belongs to.
    if (item.sub === "Armor")
      return item.name.toLowerCase().includes("shield") ? "hands" : "armor";
  }
  return null;
}

/**
 * What a piece of armour is worth, read off the SRD's own wording.
 *
 * The `ac` field is prose, not a number — the eleven shapes in items.json are
 * "11 + Dex" (light), "14 + Dex (max 2)" (medium), "16" (heavy) and "2" (the
 * shield's bonus, which is not an armour class at all). This turns those into
 * the three ways 5e folds DEX in, so effectiveAc() can do arithmetic instead
 * of string-matching.
 *
 * Deliberately narrow: a shape the SRD does not use — a cap other than 2, a
 * range, a sentence — answers null, and the sheet falls back to the armour
 * class the player typed in by hand. Guessing at unknown wording would be a
 * worse answer than admitting we cannot read it.
 */
export type ArmorAc =
  | {
      kind: "armor";
      base: number;
      /** How the wearer's DEX modifier joins in: all of it, at most +2, none. */
      dex: "full" | "capped2" | "none";
    }
  | { kind: "shield"; shieldBonus: number };

/** "16" — heavy armour, or (on a shield) the bonus it grants. */
const AC_FLAT = /^(\d{1,2})$/;
/** "11 + Dex", tolerating case, spacing and the fuller spellings. */
const AC_DEX = /^(\d{1,2})\s*\+\s*dex(?:terity)?(?:\s*(?:mod|modifier))?$/;
/** "14 + Dex (max 2)". */
const AC_DEX_CAPPED =
  /^(\d{1,2})\s*\+\s*dex(?:terity)?(?:\s*(?:mod|modifier))?\s*\(\s*max(?:imum)?\.?\s*(\d{1,2})\s*\)$/;

export function parseArmorAc(item: SrdItem): ArmorAc | null {
  if (item.category !== "armor" || !item.ac) return null;
  const text = item.ac.trim().toLowerCase().replace(/\.$/, "");

  const flat = AC_FLAT.exec(text);
  if (flat) {
    const n = Number(flat[1]);
    // A shield's "2" is a bonus on top of whatever else is worn; every other
    // flat number is heavy armour, which ignores DEX entirely.
    return item.sub === "Shield"
      ? { kind: "shield", shieldBonus: n }
      : { kind: "armor", base: n, dex: "none" };
  }

  const capped = AC_DEX_CAPPED.exec(text);
  // The SRD's only cap is +2 (medium armour). Anything else is wording we do
  // not understand, and we say so rather than quietly rounding it to 2.
  if (capped) {
    return Number(capped[2]) === 2
      ? { kind: "armor", base: Number(capped[1]), dex: "capped2" }
      : null;
  }

  const open = AC_DEX.exec(text);
  if (open) return { kind: "armor", base: Number(open[1]), dex: "full" };
  return null;
}

/** The same reading, straight from an index on an inventory line. */
export function armorAcFor(index: string | null | undefined): ArmorAc | null {
  if (!index) return null;
  const item = getItem(index);
  return item ? parseArmorAc(item) : null;
}

/**
 * Magic items keep their mechanics in prose. The one pattern that is both
 * common and unambiguous — "+N bonus to AC" — is read out so protective gear
 * actually protects; everything else stays prose.
 *
 * This is the *fallback* now, not the rule: it cannot see the words around the
 * number, so it reads "a +2 bonus to AC against ranged attacks" as flatly as
 * it reads "+2 bonus to AC". Any entry the curated table below has an opinion
 * about is answered by that opinion instead — including the entries it
 * deliberately grants nothing for.
 */
const MAGIC_AC = /\+([123])\s+bonus\s+to\s+(?:AC|Armor\s*Class)/i;

export function magicAcBonus(item: SrdItem): number | null {
  const m = MAGIC_AC.exec(item.desc || "");
  return m ? Number(m[1]) : null;
}

/**
 * What one SRD entry's prose grants, read once by hand and written down.
 *
 * `lib/data/item-effects.json` is the whole of it: all 599 descriptions were
 * swept for mechanics this model can actually hold — flat bonuses and the
 * scores an item sets — and only the *unconditional* ones were kept. An entry
 * with no `bonuses` and no `floors` is not an oversight: it is the record of a
 * description that was read and found to state something conditional ("while
 * you are wearing no armor"), momentary ("for 1 hour"), or outside the model
 * (resistances, saving throws, advantage), and it stands as an explicit "this
 * grants nothing" so the prose parser above cannot answer for it.
 *
 * `note` is a maintainer's line, not UI copy — it says which sentence the
 * numbers came from, or why there are none.
 */
export type ItemEffect = {
  bonuses?: StatBonuses;
  floors?: AbilityFloors;
  note?: string;
};

export const ITEM_EFFECTS = itemEffectsJson as Record<string, ItemEffect>;

export const itemEffect = (index: string | null | undefined): ItemEffect | undefined =>
  index ? ITEM_EFFECTS[index] : undefined;

/**
 * The `stat_bonuses` snapshot an SRD line is stocked with — the single answer
 * every write path takes, so the sheet, the compendium button and the backfill
 * script cannot disagree about what a longsword or an amulet of health grants.
 *
 * The curated table wins wherever it has an entry, and NULL is a real answer
 * from it; only an entry it says nothing at all about falls through to the
 * prose parser. That ordering is what keeps a ring of protection at +1 rather
 * than +2: the table states the bonus, and the regex never gets a turn.
 */
export function srdItemBonuses(item: SrdItem): string | null {
  const effect = ITEM_EFFECTS[item.index];
  if (effect) return stringifyStatBonuses(effect.bonuses, effect.floors);
  const ac = magicAcBonus(item);
  return ac ? stringifyStatBonuses({ ac }) : null;
}

/**
 * Where a line whose source is known *must* be worn — the discipline the
 * equip form is held to, and the button the sheet offers instead of a
 * dropdown. A sword cannot be strapped to a head just because a select box
 * offered the option.
 *
 * The source has the last word in both halves: an SRD entry answers through
 * srdItemSlot() above, and a library entry answers with the slot its author
 * chose, falling back to what its category dictates only when they left it
 * blank. A line with neither source — a hand-typed heirloom — answers null,
 * and the player is free to name any slot they like, which is the deliberate
 * design (docs/design-economy.md phase 3), not an oversight.
 */
export function requiredSlot(
  srdIndex: string | null | undefined,
  source: { slot: WorldItemSlot | null; category: string } | null | undefined
): WorldItemSlot | null {
  if (srdIndex) {
    const item = getItem(srdIndex);
    if (item) return srdItemSlot(item);
  }
  if (source) return source.slot ?? categorySlot(source.category);
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

/**
 * One-line summary used when adding a spell to a character sheet. Takes the
 * header facts and nothing else, which is why it serves both shelves: the
 * line it writes is the same line for an SRD spell and for a fact stub,
 * because the header is all a fact stub has and all this line ever read.
 */
export function spellSummary(spell: SpellFacts) {
  const parts = [
    `${spellLevelLabel(spell.level)} ${spell.school.toLowerCase()}`,
    spell.castingTime,
    spell.range,
    spell.duration + (spell.concentration ? " (conc.)" : ""),
  ];
  return parts.join(" · ");
}
