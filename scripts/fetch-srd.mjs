// One-time fetch of SRD 5.1 spell + monster data (CC-BY-4.0) from the
// 5e-bits/5e-database repo, trimmed to the fields Lorehall displays.
// Usage: node scripts/fetch-srd.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/5e-bits/5e-database/main";
const CANDIDATES = {
  spells: [`${BASE}/src/2014/en/5e-SRD-Spells.json`],
  monsters: [`${BASE}/src/2014/en/5e-SRD-Monsters.json`],
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

const mod = (score) => Math.floor((score - 10) / 2);

function crLabel(cr) {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

function trimSpell(s) {
  return {
    index: s.index,
    name: s.name,
    level: s.level,
    school: s.school?.name ?? "",
    castingTime: s.casting_time,
    range: s.range,
    components:
      (s.components ?? []).join(", ") + (s.material ? ` (${s.material})` : ""),
    duration: s.duration,
    concentration: Boolean(s.concentration),
    ritual: Boolean(s.ritual),
    classes: (s.classes ?? []).map((c) => c.name),
    subclasses: (s.subclasses ?? []).map((c) => c.name),
    desc: (s.desc ?? []).join("\n\n"),
    higherLevel: (s.higher_level ?? []).join("\n\n") || null,
  };
}

function trimMonster(m) {
  const saves = [];
  const skills = [];
  for (const p of m.proficiencies ?? []) {
    const idx = p.proficiency?.index ?? "";
    const name = p.proficiency?.name ?? "";
    if (idx.startsWith("saving-throw-")) {
      saves.push(`${name.replace("Saving Throw: ", "")} +${p.value}`);
    } else if (idx.startsWith("skill-")) {
      skills.push(`${name.replace("Skill: ", "")} +${p.value}`);
    }
  }
  const speed = Object.entries(m.speed ?? {})
    .map(([k, v]) => (k === "walk" ? v : `${k} ${v}`))
    .join(", ");
  const senses = Object.entries(m.senses ?? {})
    .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
    .join(", ");
  const acEntry = Array.isArray(m.armor_class) ? m.armor_class[0] : null;
  const strip = (list) => (list ?? []).map((x) => ({ name: x.name, desc: x.desc }));
  return {
    index: m.index,
    name: m.name,
    size: m.size,
    type: m.type + (m.subtype ? ` (${m.subtype})` : ""),
    alignment: m.alignment,
    ac: acEntry?.value ?? null,
    acType: acEntry?.type ?? null,
    hp: m.hit_points,
    hitDice: m.hit_points_roll ?? m.hit_dice,
    speed,
    str: m.strength,
    dex: m.dexterity,
    con: m.constitution,
    intel: m.intelligence,
    wis: m.wisdom,
    cha: m.charisma,
    dexMod: mod(m.dexterity),
    saves: saves.join(", ") || null,
    skills: skills.join(", ") || null,
    vulnerabilities: (m.damage_vulnerabilities ?? []).join(", ") || null,
    resistances: (m.damage_resistances ?? []).join(", ") || null,
    immunities: (m.damage_immunities ?? []).join(", ") || null,
    conditionImmunities:
      (m.condition_immunities ?? []).map((c) => c.name).join(", ") || null,
    senses,
    languages: m.languages || "—",
    cr: m.challenge_rating,
    crLabel: crLabel(m.challenge_rating),
    xp: m.xp,
    traits: strip(m.special_abilities),
    actions: strip(m.actions),
    legendary: strip(m.legendary_actions),
  };
}

const outDir = path.resolve(import.meta.dirname, "..", "lib", "data");
await mkdir(outDir, { recursive: true });

const spells = (await fetchFirst(CANDIDATES.spells)).map(trimSpell);
spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
await writeFile(path.join(outDir, "spells.json"), JSON.stringify(spells));
console.log(`spells: ${spells.length}`);

const monsters = (await fetchFirst(CANDIDATES.monsters)).map(trimMonster);
monsters.sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
await writeFile(path.join(outDir, "monsters.json"), JSON.stringify(monsters));
console.log(`monsters: ${monsters.length}`);
