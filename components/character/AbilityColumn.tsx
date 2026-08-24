import { fmt, statBlock } from "@/lib/dnd";
import type { T } from "@/lib/i18n";
import { Card, SectionTitle } from "@/components/ui";
import { Plate } from "@/components/character/SheetVitals";

/**
 * The left rail of a character sheet, in the order every printed sheet has put
 * it since 1978: the six scores, the bonus the rest of the page is built from,
 * the six saving throws, the eighteen skills, and the one number a DM reads
 * without asking anybody to roll.
 *
 * The arithmetic is not done here — `statBlock` in lib/dnd.ts has already
 * folded worn gear into every one of those numbers, and this file's whole job
 * is to draw what it answered. Passing the computed block in rather than the
 * character is deliberate: two places on this page need the same modifiers,
 * and computing them twice is how two halves of one sheet start disagreeing.
 */
export type SheetStats = ReturnType<typeof statBlock>;

/**
 * A score, drawn the way the book draws it: the modifier large, because that
 * is the number that goes into a roll, and the score itself small in a token
 * hung off the bottom edge, because that is the number a rule occasionally
 * asks for by name. What the gear added rides beside the score in gilt — the
 * modifier above it has already swallowed it, and a player who cannot see the
 * difference cannot tell a magic belt from a typo.
 */
export function AbilityScoresCard({ stats, t }: { stats: SheetStats; t: T }) {
  return (
    <Card>
      <div className="grid grid-cols-3 gap-x-2 gap-y-7 pb-3 sm:grid-cols-6 lg:grid-cols-3">
        {stats.abilities.map((ability) => (
          <div
            key={ability.key}
            className={`relative rounded-sm border bg-ink-950/60 px-1 pb-4 pt-2 text-center ${
              ability.bonus !== 0 ? "border-gold-500/50" : "border-ink-700"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-parchment-500">
              {ability.label}
            </p>
            <p className="font-display text-2xl font-bold leading-tight text-parchment-100">
              {fmt(ability.mod)}
            </p>
            <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-ink-600 bg-ink-900 px-2 py-0.5 font-mono text-[11px] font-bold text-parchment-300">
              {ability.score}
              {ability.bonus !== 0 && (
                <span className="text-gold-300" title={t("character.equipment.bonusTitle")}>
                  {fmt(ability.bonus)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <Plate label={t("character.sheet.proficiencyBonus")} value={fmt(stats.profBonus)} gilt />
    </Card>
  );
}

/** Passive Perception — the sentence the dictionary already writes whole. */
export function PassivePerceptionPlate({ stats, t }: { stats: SheetStats; t: T }) {
  return (
    <p className="rounded-sm border border-ink-600/80 bg-ink-900/85 px-4 py-2.5 text-center text-sm font-bold text-gold-300 outline outline-1 outline-ink-700/45 outline-offset-[-4px]">
      {t("character.sheet.passivePerception", { n: stats.passivePerception })}
    </p>
  );
}

/**
 * The two ruled lists, which on the printed sheet run down the whole left
 * margin and here have to survive a phone.
 *
 * Twenty-four rows is a screen and a half of scrolling between the hit points
 * and the backpack, and a player reaching for their sword does not want to
 * walk past Animal Handling to get there — so on a narrow screen the pair sits
 * folded behind one summary, and from `lg` up it is simply open, the way a
 * printed sheet is always open.
 *
 * Two renderings rather than one: `open` is an attribute, not a style, and no
 * media query can reach it. The folded copy is `display:none` above `lg` and
 * the flat copy below it, and a hidden subtree is out of the accessibility
 * tree entirely, so nothing is ever announced twice.
 */
export function SavesAndSkills({ stats, t }: { stats: SheetStats; t: T }) {
  return (
    <>
      <section className="space-y-3">
        <SectionTitle>{t("character.sheet.savingThrows")}</SectionTitle>
        <Card className="!p-4">
          <ul>
            {stats.saves.map((save) => (
              <Row
                key={save.label}
                proficient={save.proficient}
                name={save.label}
                bonus={save.bonus}
                t={t}
              />
            ))}
          </ul>
        </Card>
      </section>
      <section className="space-y-3">
        <SectionTitle>{t("character.sheet.skills")}</SectionTitle>
        <Card className="!p-4">
          <ul>
            {stats.skills.map((skill) => (
              <Row
                key={skill.name}
                proficient={skill.proficient}
                name={skill.name}
                governedBy={skill.ability}
                bonus={skill.bonus}
                t={t}
              />
            ))}
          </ul>
        </Card>
      </section>
    </>
  );
}

/** One ruled line: the trained mark, what it is called, and what it comes to. */
function Row({
  proficient,
  name,
  governedBy,
  bonus,
  t,
}: {
  proficient: boolean;
  name: string;
  /** The ability the line is read off — skills say so, saves *are* one. */
  governedBy?: string;
  bonus: number;
  t: T;
}) {
  return (
    <li className="flex items-center gap-2 border-b border-ink-700/70 py-1.5 last:border-0 text-xs">
      {/*
        The mark is a filled ring or an empty one, which says nothing out loud
        — so it is given a voice. Both states are spoken rather than only the
        filled one: "not proficient" is the answer to the question a reader is
        asking of the line, and silence would be indistinguishable from a mark
        that failed to render.
      */}
      <span
        role="img"
        aria-label={t(
          proficient ? "character.sheet.proficient" : "character.sheet.notProficient"
        )}
        className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
          proficient ? "border-gold-500 bg-gold-500" : "border-ink-600"
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate ${
          proficient ? "font-bold text-parchment-100" : "text-parchment-300"
        }`}
      >
        {name}
      </span>
      {governedBy && (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-parchment-500">
          {governedBy}
        </span>
      )}
      <span className="shrink-0 font-mono font-bold text-parchment-100">{fmt(bonus)}</span>
    </li>
  );
}
