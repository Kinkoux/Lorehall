import type { Character } from "@/lib/db";
import { acGearBonus, acTitle, fmt, type AcBreakdown } from "@/lib/dnd";
import { STAT_LABELS } from "@/lib/world-items";
import { adjustCharacterHp } from "@/lib/character-actions";
import type { T } from "@/lib/i18n";
import { Input } from "@/components/ui";

/**
 * The three numbers a printed sheet sets in a row across the top of its middle
 * column, and the two blocks under them.
 *
 * They are together because they are asked together: a round begins with
 * initiative, an attack ends at armour class, and how far a character got
 * before either happened is the speed. Splitting them into three plates
 * scattered down a page is how a player ends up hunting for the same three
 * numbers every combat.
 */
export function VitalsStrip({
  ac,
  initiative,
  speed,
  t,
}: {
  ac: AcBreakdown;
  /** The worn DEX modifier, or null on a sheet with no scores yet. */
  initiative: number | null;
  /** Feet, from the sheet's own field or from the race that filled it in. */
  speed: number | null;
  t: T;
}) {
  const bonus = acGearBonus(ac);
  return (
    <div className="grid grid-cols-3 divide-x divide-ink-700 rounded-sm border border-ink-600/80 bg-ink-900/85 outline outline-1 outline-ink-700/45 outline-offset-[-5px]">
      {/* The breakdown stays on the badge: "11 + DEX 3 + Shield 2" is the only
          way a player tells a working armour class from a wrong one. */}
      <VitalCell
        label={STAT_LABELS.ac}
        value={ac.value === null ? "—" : String(ac.value)}
        bonus={ac.value !== null && bonus !== 0 ? bonus : null}
        title={ac.value === null ? undefined : acTitle(ac)}
        t={t}
      />
      <VitalCell
        label={t("character.sheet.initiative")}
        value={initiative === null ? "—" : fmt(initiative)}
        t={t}
      />
      <VitalCell
        label={t("character.sheet.speed")}
        value={speed === null ? "—" : String(speed)}
        unit={speed === null ? undefined : t("character.sheet.speedUnit")}
        t={t}
      />
    </div>
  );
}

function VitalCell({
  label,
  value,
  unit,
  bonus,
  title,
  t,
}: {
  label: string;
  value: string;
  unit?: string;
  bonus?: number | null;
  title?: string;
  t: T;
}) {
  return (
    <p title={title} className="flex flex-col items-center gap-0.5 px-2 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {label}
      </span>
      <span className="flex items-baseline gap-1 font-display text-2xl font-bold leading-none text-parchment-100">
        {value}
        {unit && <span className="text-[10px] font-normal text-parchment-500">{unit}</span>}
        {bonus !== null && bonus !== undefined && (
          <span
            className="font-mono text-xs text-gold-300"
            title={t("character.equipment.bonusTitle")}
          >
            {fmt(bonus)}
          </span>
        )}
      </span>
    </p>
  );
}

/**
 * A ruled box with a word on the left and a number on the right — the shape
 * the printed sheet uses for every derived value it does not give a circle to.
 * `gilt` is for the ones a player quotes out loud.
 */
export function Plate({
  label,
  value,
  gilt = false,
  title,
}: {
  label: string;
  value: string;
  gilt?: boolean;
  title?: string;
}) {
  return (
    <p
      title={title}
      className={`flex items-center justify-between gap-2 rounded-sm border px-3 py-2 ${
        gilt ? "border-gold-500/60 bg-gold-500/10" : "border-ink-600 bg-ink-950/50"
      }`}
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-wide ${
          gilt ? "text-gold-300" : "text-parchment-500"
        }`}
      >
        {label}
      </span>
      <span className="font-display text-lg font-bold leading-none text-parchment-100">
        {value}
      </span>
    </p>
  );
}

/**
 * Hit points, and the two presses that move them.
 *
 * The pool reads "current / maximum", and the maximum is the sheet's own
 * field: `currentHp` is clamped to it, so pairing the pool with an
 * equipment-inflated number would show a character at full health as though
 * they were wounded. What the gear lent stays the parenthetical it always was.
 *
 * The amount box starts empty with a 1 written faintly in it: the common press
 * is a number typed over whatever was there, and a prefilled 1 is a digit to
 * clear before the real one can be typed — on a phone, a fiddly one. Blank
 * submits as 1 anyway (`adjustCharacterHp` reads a missing amount as one
 * point), so the hint is the truth rather than a placeholder's promise.
 */
export function HitPointsBlock({
  character,
  hpBonus,
  editable,
  t,
}: {
  character: Character;
  hpBonus: number;
  editable: boolean;
  t: T;
}) {
  if (character.maxHp === null) return null;
  return (
    <div className="rounded-sm border border-blood-500/50 bg-blood-500/10 px-4 py-3">
      <p className="flex items-baseline justify-center gap-2">
        <span
          title={t("character.hp.title")}
          className="font-display text-3xl font-bold leading-none text-blood-400"
        >
          {character.currentHp ?? character.maxHp} / {character.maxHp}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
          {t("character.hp.label")}
        </span>
        {hpBonus !== 0 && (
          <span
            className="font-mono text-xs font-bold text-gold-300"
            title={t("character.equipment.bonusTitle")}
          >
            ({fmt(hpBonus)})
          </span>
        )}
      </p>
      {editable && (
        <form
          action={adjustCharacterHp.bind(null, character.id)}
          className="mt-2 flex items-center justify-center gap-1"
        >
          <Input
            name="amount"
            type="number"
            min={0}
            max={999}
            placeholder="1"
            aria-label={t("character.hp.amount")}
            className="!w-16 min-h-11 !py-1"
          />
          <button
            type="submit"
            name="op"
            value="damage"
            className="inline-flex min-h-11 items-center rounded border border-blood-500 px-3 py-1 text-xs font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
          >
            {t("character.hp.damage")}
          </button>
          <button
            type="submit"
            name="op"
            value="heal"
            className="inline-flex min-h-11 items-center rounded border border-emerald-700/60 px-3 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
          >
            {t("character.hp.heal")}
          </button>
        </form>
      )}
    </div>
  );
}
