import type { CharacterSpellSlot } from "@/lib/db/schema";
import {
  restoreSpellSlot,
  setSpellSlots,
  spendSpellSlot,
  suggestFromClass,
} from "@/lib/character-actions";
import { MAX_SPELL_LEVEL, MIN_SPELL_LEVEL } from "@/lib/spell-slots";
import type { T } from "@/lib/i18n";
import { Button, GhostButton, Input } from "@/components/ui";

/**
 * Spell slots, drawn the way every table already tracks them: a row per spell
 * level, one pip per slot, and you cross one off when you cast. A spent pip is
 * filled and sealed, an unspent one is an open ring — the row is readable from
 * across the table at a glance, which is the entire job.
 *
 * Every pip is its own one-button form, so this stays a server component and
 * works with the page's script switched off. Clicking an open pip spends a
 * slot; clicking a sealed one gives it back, because the misclick happens
 * constantly and an undo that needs the edit form would not be one.
 *
 * Which pip is not a question the database is asked — slots of a level are
 * interchangeable, so the row keeps a count and the pips are that count drawn.
 * A player only ever sees "three of four spent"; which three is not a fact.
 *
 * The table itself is nine numbers a player types, folded away in a
 * <details> — including the button that fills them in from the sheet's class.
 * The sheet does not police the numbers: half the tables in the world are
 * running something the book never printed.
 */

const LEVELS = Array.from(
  { length: MAX_SPELL_LEVEL - MIN_SPELL_LEVEL + 1 },
  (_, index) => MIN_SPELL_LEVEL + index
);

export function SpellSlotTracker({
  characterId,
  slots,
  editable,
  t,
}: {
  characterId: string;
  /** The character's rows, already ordered by level. */
  slots: CharacterSpellSlot[];
  editable: boolean;
  t: T;
}) {
  // A watcher looking at a sheet with no slot table has nothing to be shown —
  // no heading, no empty state, no gap where a caster's rows would be.
  if (!editable && slots.length === 0) return null;

  return (
    <div className="mb-4 border-b border-ink-700 pb-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-parchment-500">
        {t("character.spellSlots.title")}
      </p>
      {slots.length === 0 ? (
        <p className="text-xs text-parchment-500">{t("character.spellSlots.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {slots.map((row) => (
            <SlotRow key={row.level} characterId={characterId} row={row} editable={editable} t={t} />
          ))}
        </ul>
      )}
      {editable && <SlotEditor characterId={characterId} slots={slots} t={t} />}
    </div>
  );
}

function SlotRow({
  characterId,
  row,
  editable,
  t,
}: {
  characterId: string;
  row: CharacterSpellSlot;
  editable: boolean;
  t: T;
}) {
  const left = Math.max(row.total - row.used, 0);
  return (
    <li className="flex items-center gap-2">
      <span className="w-6 shrink-0 font-mono text-xs font-bold text-parchment-500">
        {t("character.spellSlots.levelShort", { n: row.level })}
      </span>
      {/*
        A pip a finger can actually hit is 44px square, and a pip that reads as
        a wax seal is 20px — so the button is the former and the mark inside it
        the latter. The gap goes away when the pips are buttons: the boxes are
        already spaced by the air around each mark, and adding more would push
        a nine-slot row onto a second line for nothing.
      */}
      <span className={`flex flex-wrap items-center ${editable ? "" : "gap-1"}`}>
        {Array.from({ length: row.total }, (_, index) => index + 1).map((pip) => (
          <Pip
            key={pip}
            characterId={characterId}
            level={row.level}
            index={pip}
            spent={pip <= row.used}
            editable={editable}
            t={t}
          />
        ))}
      </span>
      <span
        title={t("character.spellSlots.remaining", { left, total: row.total })}
        className="ml-auto shrink-0 font-mono text-[11px] text-parchment-500"
      >
        {left}/{row.total}
      </span>
    </li>
  );
}

/** Sealed wax or an open ring — and, for whoever owns the sheet, a button. */
function Pip({
  characterId,
  level,
  index,
  spent,
  editable,
  t,
}: {
  characterId: string;
  level: number;
  index: number;
  spent: boolean;
  editable: boolean;
  t: T;
}) {
  const label = t(spent ? "character.spellSlots.pipSpent" : "character.spellSlots.pipOpen", {
    level,
    n: index,
  });
  const face = spent
    ? "border-parchment-500 bg-parchment-500"
    : "border-gold-500 bg-transparent";

  if (!editable) {
    return <span role="img" aria-label={label} title={label} className={`h-4 w-4 rounded-full border ${face}`} />;
  }
  return (
    <form action={(spent ? restoreSpellSlot : spendSpellSlot).bind(null, characterId, level)}>
      <button
        type="submit"
        title={label}
        aria-label={label}
        className="group flex h-11 w-11 items-center justify-center cursor-pointer"
      >
        <span
          aria-hidden
          className={`block h-5 w-5 rounded-full border transition group-hover:border-gold-400 group-hover:ring-2 group-hover:ring-gold-500/30 ${face}`}
        />
      </button>
    </form>
  );
}

/**
 * The table behind the pips. Nine boxes, blank meaning "no slots of that
 * level", plus the shortcut that fills them in from the class the sheet
 * already names. The save button sits outside the form it submits (`form=`)
 * so it can stand beside the suggestion button without nesting two forms,
 * which HTML does not allow.
 */
function SlotEditor({
  characterId,
  slots,
  t,
}: {
  characterId: string;
  slots: CharacterSpellSlot[];
  t: T;
}) {
  const totals = new Map(slots.map((row) => [row.level, row.total]));
  const formId = `spell-slots-${characterId}`;
  return (
    <details className="mt-3">
      <summary className="inline-block cursor-pointer text-xs font-bold text-parchment-500 transition hover:text-gold-300">
        {slots.length === 0
          ? t("character.spellSlots.setUp")
          : t("character.spellSlots.edit")}
      </summary>
      <form id={formId} action={setSpellSlots.bind(null, characterId)} className="mt-2">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
          {LEVELS.map((level) => (
            <label key={level} className="block">
              <span className="mb-0.5 block text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500">
                {t("character.spellSlots.levelShort", { n: level })}
              </span>
              <Input
                name={`level${level}`}
                type="number"
                min={0}
                max={9}
                defaultValue={totals.get(level) ?? ""}
                aria-label={t("character.spellSlots.levelLabel", { n: level })}
                className="!px-1 text-center"
              />
            </label>
          ))}
        </div>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" form={formId} className="!px-3 !py-1.5 text-xs">
          {t("character.spellSlots.save")}
        </Button>
        <form action={suggestFromClass.bind(null, characterId)}>
          <GhostButton type="submit" className="!px-3 !py-1.5 text-xs">
            {t("character.spellSlots.suggest")}
          </GhostButton>
        </form>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-parchment-500">
        {t("character.spellSlots.hint")}
      </p>
    </details>
  );
}
