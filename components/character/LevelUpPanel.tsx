import type { Character } from "@/lib/db";
import { mod } from "@/lib/dnd";
import { classInfo } from "@/lib/srd-classes";
import { levelUpCharacter } from "@/lib/character-actions";
import type { T } from "@/lib/i18n";
import { Button, Input, Label, Select } from "@/components/ui";

/**
 * Where the game stops, and the four levels it hands out ability points at.
 * Both are the action's numbers as well; they are written twice because a
 * "use server" module may export nothing but functions, and a constant
 * smuggled through one would be a worse seam than this sentence.
 */
const MAX_CHARACTER_LEVEL = 20;
const ASI_LEVELS = [4, 8, 12, 16, 19];

/**
 * The end of a session, in one fold.
 *
 * Everything this panel writes is already a field on the sheet below it — the
 * level, the maximum, the path — so nothing here is a capability the player
 * did not have. What it is, is the *order* those fields are filled in: a
 * level-up is four edits that belong together, and four separate boxes in a
 * long form is how a table ends an evening two hit points and a spell slot
 * short. The fold stays shut until it is wanted, and opens onto three
 * questions at most.
 *
 * A server component on purpose, like the sheet around it: the class is known
 * on the server, so the list of paths can be drawn there, and the whole thing
 * is a form posting a server action — no script, and it works before one has
 * loaded. The price is the one thing a script would have bought: the subclass
 * list and the "or write your own" box are both on the page at once, rather
 * than the builder's arrangement where picking "write your own" swaps the
 * select for a text field. Two live fields with one name would hand the action
 * an argument to settle, so they are given two names instead and the action
 * prefers what was typed.
 *
 * No confirmation, and none wanted: the level box in the sheet form undoes
 * this in one edit, which is a cheaper apology than a second press every time.
 */
export function LevelUpPanel({ character, t }: { character: Character; t: T }) {
  if (character.level >= MAX_CHARACTER_LEVEL) return null;
  const newLevel = character.level + 1;
  const info = classInfo(character.klass);

  /**
   * What the blank box will do, spelled out in it. The *stored* Constitution,
   * because that is the score the action banks the hit points from — worn gear
   * lifts the modifier for as long as it is worn, and hit points gained on
   * levelling are kept when it comes off.
   */
  const average =
    info && character.con !== null
      ? Math.max(0, Math.floor(info.hitDie / 2) + 1 + mod(character.con))
      : null;

  // The path is asked for exactly once: at the level the class chooses one,
  // and only while the sheet has none written. A homebrew class has no list to
  // offer and no ruling to hold it to, so the question is left to the form.
  const offersSubclass =
    info !== null && !character.subclass && newLevel >= info.subclassLevel;

  return (
    <details className="rounded-sm border border-ink-600/80 bg-ink-900/85 px-4 py-1">
      <summary className="flex min-h-11 cursor-pointer items-center py-3 font-display text-sm uppercase tracking-wide text-gold-300 hover:text-gold-400">
        {t("character.sheet.levelUp.summary")}
      </summary>
      <form
        action={levelUpCharacter.bind(null, character.id)}
        className="space-y-3 pb-3"
      >
        <p className="font-mono text-lg font-bold text-parchment-100">
          {t("character.sheet.levelUp.step", { from: character.level, to: newLevel })}
        </p>
        <label className="block">
          <Label>{t("character.sheet.levelUp.hpLabel")}</Label>
          <Input
            name="hpGain"
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            className="min-h-11"
            placeholder={average === null ? "" : String(average)}
          />
          <span className="mt-1 block text-xs leading-relaxed text-parchment-500">
            {t("character.sheet.levelUp.hpHint")}
          </span>
        </label>
        {offersSubclass && (
          <div>
            <Label>{t("character.builder.subclassLabel")}</Label>
            <Select
              name="subclass"
              aria-label={t("character.builder.subclassLabel")}
              className="min-h-11"
            >
              <option value="">{t("character.builder.subclassNone")}</option>
              {info.subclasses.map((path) => (
                <option key={path} value={path}>
                  {path === info.srdSubclass
                    ? `${path} ${t("character.builder.subclassSrdMark")}`
                    : path}
                </option>
              ))}
            </Select>
            <Input
              name="subclassCustom"
              maxLength={80}
              aria-label={t("character.builder.subclassCustomLabel")}
              placeholder={t("character.builder.subclassCustomPh")}
              className="mt-2 min-h-11"
            />
          </div>
        )}
        {/* One line, because the two points are not this panel's to spend:
            the six boxes live in the sheet form, and a second grid of them
            here would be a second place they could be edited from. */}
        {ASI_LEVELS.includes(newLevel) && (
          <p className="text-xs leading-relaxed text-parchment-500">
            {t("character.sheet.levelUp.asiHint", { n: newLevel })}
          </p>
        )}
        <Button type="submit" className="min-h-11">
          {t("character.sheet.levelUp.submit")}
        </Button>
      </form>
    </details>
  );
}
