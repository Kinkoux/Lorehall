import spellsJson from "@/lib/data/spells.json";
import monstersJson from "@/lib/data/monsters.json";
import monsterImagesJson from "@/lib/data/monster-images.json";

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

export const SPELLS = spellsJson as SrdSpell[];
export const MONSTERS = monstersJson as SrdMonster[];

/** Freely-licensed artwork (Wikimedia Commons only), matched at fetch time. */
export type MonsterImage = { img: string; page: string; title: string };
export const MONSTER_IMAGES = monsterImagesJson as Record<string, MonsterImage>;
export const getMonsterImage = (index: string): MonsterImage | undefined =>
  MONSTER_IMAGES[index];

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
