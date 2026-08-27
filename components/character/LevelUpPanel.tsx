import type { Character } from "@/lib/db";
import { ABILITIES, ABILITY_LABELS, mod, type AbilityKey } from "@/lib/dnd";
import { asiLevelsFor, classInfo } from "@/lib/srd-classes";
import { FEATS } from "@/lib/srd-feats";
import { levelUpCharacter } from "@/lib/character-actions";
import type { T } from "@/lib/i18n";
import { Button, Input, Label, Select } from "@/components/ui";

/**
 * Where the game stops. The action's number as well; it is written twice
 * because a "use server" module may export nothing but functions, and a
 * constant smuggled through one would be a worse seam than this sentence.
 *
 * The improvement levels used to be written twice the same way, and are not
 * any more: they differ per class — a fighter gets seven of them, a rogue six
 * — so they are a fact about the class and live in lib/srd-classes.ts, which
 * is an ordinary module both sides may read.
 */
const MAX_CHARACTER_LEVEL = 20;

/** The book's ceiling on what an improvement may raise a score to. */
const ASI_SCORE_MAX = 20;

/**
 * The end of a session, in one fold.
 *
 * Everything this panel writes is already a field on the sheet below it — the
 * level, the maximum, the path, the six scores — so nothing here is a
 * capability the player did not have. What it is, is the *order* those fields
 * are filled in: a level-up is several edits that belong together, and several
 * separate boxes in a long form is how a table ends an evening two hit points
 * and a spell slot short. The fold stays shut until it is wanted, and opens
 * onto three questions at most.
 *
 * A server component on purpose, like the sheet around it: the class is known
 * on the server, so the list of paths and the list of feats can both be drawn
 * there, and the whole thing is a form posting a server action — no script,
 * and it works before one has loaded. The price is the one thing a script
 * would have bought: every branch of every question is on the page at once,
 * rather than the builder's arrangement where picking one answer swaps the
 * fields for another's. So the improvement question is a radio group with all
 * three of its branches drawn, and the action reads only the branch the radio
 * named. The hint under it says so, because a form that quietly ignores a box
 * somebody filled in owes them a sentence.
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

  // And the improvement, at the levels this class is given one — its own list
  // where the book has an opinion, the common five where it has none.
  const offersAdvance = asiLevelsFor(character.klass).includes(newLevel);

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
        {offersAdvance && <AdvanceBlock character={character} newLevel={newLevel} t={t} />}
        <Button type="submit" className="min-h-11">
          {t("character.sheet.levelUp.submit")}
        </Button>
      </form>
    </details>
  );
}

/**
 * Two points, or a feat, or neither — the question the fours (and the
 * fighter's sixes, and the rogue's tenth) ask.
 *
 * "Neither" is where it starts, and that is the important default: a player
 * who opened this fold to record six hit points at the end of a long evening
 * should be able to press the button without having accidentally spent a
 * decision they had not made yet. The two boxes that spend one are both a
 * deliberate tick away.
 */
function AdvanceBlock({
  character,
  newLevel,
  t,
}: {
  character: Character;
  newLevel: number;
  t: T;
}) {
  return (
    <fieldset className="space-y-2 rounded-sm border border-ink-700 px-3 pb-3 pt-1">
      <legend className="px-1 font-display text-xs uppercase tracking-wide text-gold-300">
        {t("character.sheet.levelUp.advanceTitle", { n: newLevel })}
      </legend>
      <p className="text-xs leading-relaxed text-parchment-500">
        {t("character.sheet.levelUp.advanceHint")}
      </p>

      <AdvanceChoice value="asi" label={t("character.sheet.levelUp.advanceAsi")} />
      {/* Indented under the tick that turns them on, which is the only cue a
          scriptless page can give that these two belong to that answer. */}
      <div className="ml-7 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <AbilityPick
            name="asiA"
            label={t("character.sheet.levelUp.asiFirst")}
            character={character}
            t={t}
          />
          <AbilityPick
            name="asiB"
            label={t("character.sheet.levelUp.asiSecond")}
            character={character}
            t={t}
          />
        </div>
        <p className="text-xs leading-relaxed text-parchment-500">
          {t("character.sheet.levelUp.asiHint")}
        </p>
      </div>

      <AdvanceChoice value="feat" label={t("character.sheet.levelUp.advanceFeat")} />
      <div className="ml-7 space-y-2">
        <Select
          name="feat"
          aria-label={t("character.sheet.levelUp.featLabel")}
          className="min-h-11"
        >
          <option value="">{t("character.sheet.levelUp.featNone")}</option>
          {FEATS.map((feat) => (
            <option key={feat.index} value={feat.index}>
              {feat.prerequisite ? `${feat.name} — ${feat.prerequisite}` : feat.name}
            </option>
          ))}
        </Select>
        {/* The same arrangement the subclass question uses, and settled the
            same way: two live fields with one name would hand the action an
            argument, so they are given two names and what was typed wins. */}
        <Input
          name="featCustom"
          maxLength={80}
          aria-label={t("character.sheet.levelUp.featCustomPh")}
          placeholder={t("character.sheet.levelUp.featCustomPh")}
          className="min-h-11"
        />
        <AbilityPick
          name="featAsi"
          label={t("character.sheet.levelUp.featAsiLabel")}
          character={character}
          t={t}
        />
        <p className="text-xs leading-relaxed text-parchment-500">
          {t("character.sheet.levelUp.featAsiHint")}
        </p>
        <p className="text-xs leading-relaxed text-parchment-500">
          {t("character.sheet.levelUp.featTextHint")}
        </p>
      </div>

      <AdvanceChoice value="skip" label={t("character.sheet.levelUp.advanceSkip")} defaultChecked />
    </fieldset>
  );
}

/** One of the three ticks, at a thumb's size. */
function AdvanceChoice({
  value,
  label,
  defaultChecked,
}: {
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-parchment-200">
      <input
        type="radio"
        name="advance"
        value={value}
        defaultChecked={defaultChecked}
        className="h-5 w-5 accent-[#8a6516]"
      />
      {label}
    </label>
  );
}

/**
 * One of the six, with the score it currently reads — because "put a point in
 * Dexterity" is a decision made against the number, and the number is up at
 * the top of a sheet the fold is covering.
 *
 * A score already at twenty is marked and left selectable. Disabling it would
 * be the sheet telling a player they are wrong about their own character, and
 * the sheet is not the arbiter here: the *action* declines to raise it, quietly
 * and per point, so the level still happens and the feed names only what
 * actually landed.
 */
function AbilityPick({
  name,
  label,
  character,
  t,
}: {
  name: string;
  label: string;
  character: Character;
  t: T;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <Select name={name} aria-label={label} className="min-h-11">
        <option value="">—</option>
        {ABILITIES.map((key) => (
          <option key={key} value={key}>
            {optionLabel(key, character[key], t)}
          </option>
        ))}
      </Select>
    </label>
  );
}

function optionLabel(key: AbilityKey, score: number | null, t: T): string {
  if (score === null) return ABILITY_LABELS[key];
  const capped = score >= ASI_SCORE_MAX ? ` ${t("character.sheet.levelUp.asiCapMark")}` : "";
  return `${ABILITY_LABELS[key]} ${score}${capped}`;
}
