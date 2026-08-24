"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { buildCharacter } from "@/lib/character-actions";
import { CLASS_SLUGS, type ClassSlug } from "@/lib/class-match";
import { averageHp, CLASSES, spellcasting } from "@/lib/srd-classes";
import { BACKGROUNDS } from "@/lib/srd-backgrounds";
import { RACES, raceBySlug, type RaceInfo } from "@/lib/srd-races";
import { AlignmentWheel } from "@/components/character/AlignmentWheel";
import { ABILITIES, ABILITY_LABELS, fmt, mod, profBonus, type AbilityKey } from "@/lib/dnd";
// The leaf list, not lib/srd.ts: this island wants eighteen names and their
// abilities, and the compendium's entries carry two locales of description per
// skill that no bundler can shake off an object it is handed whole.
import { SKILL_INDEX } from "@/lib/skill-index";
import { makeT, type Locale, type T } from "@/lib/i18n";
import { Button, Card, Input, Label, SectionTitle, Select } from "@/components/ui";

/**
 * Making a whole character in one sitting, for someone who has never made one.
 *
 * The two older doors take a name and land the player on a blank sheet, which
 * is a fine door for a player who already knows what a saving throw
 * proficiency is and a locked one for a player meeting the game this evening.
 * This form asks the questions the book asks — class, path, people, six
 * scores, a handful of skills — and lets `buildCharacter` do the looking-up
 * behind it: the saves off the class, the speed off the race, the hit points
 * off the die, the spell slots off the table.
 *
 * Why this is an island at all: because the questions depend on each other,
 * and a dependency drawn on paper is a dependency the player has to hold in
 * their head. Picking Warlock should *show* the pact die, the two saves and
 * the casting ability; picking Half-Orc should show the +2 STR landing on the
 * score the player is about to write. None of that is a thing a server can do
 * without a round trip per keystroke.
 *
 * And why the island is only ever a help layer: every field below posts on its
 * own. The class, the race, the level, the six scores, the eighteen skill
 * boxes and the name are ordinary inputs inside an ordinary form whose action
 * is the server function itself, and every one of them is drawn as a plain
 * input in the very first byte of HTML.
 *
 * What that buys, precisely, is the window before the script lands: a player
 * on a train can read all seven questions and answer them, and a submission
 * made in that window is *queued* until the client bundle arrives to send it,
 * which is what a form whose action is a server function does inside a client
 * component. It is not the stronger claim, and this comment used to make the
 * stronger claim: with scripting switched off altogether there is no code left
 * to send the queued submission, and Next only promises a working form with no
 * script at all for a form that is a Server Component. This one is an island,
 * so the honest promise is the slow-connection window — every field readable,
 * answerable and preserved across hydration — and not the switched-off case.
 *
 * What the script adds, and only adds:
 *
 * - the class summary, the race's speed and increases, the preview strip;
 * - the standard-array helper, a second way of filling the same six boxes;
 * - the subclass *list*, which depends on a class chosen a moment ago, and the
 *   lock that holds it shut below 3rd level (a plain suggestion box takes its
 *   place, and the action drops an early path either way);
 * - the "something else…" race, which needs a text box to appear;
 * - the skill counter, and the fading of skills off the class's own list.
 *
 * The background list and the alignment grid are in neither list, because
 * neither depends on an answer given elsewhere on the form: thirteen fixed
 * suggestions and nine fixed radio buttons are ordinary markup, and they are
 * drawn once, on the server, working.
 *
 * Nothing in that list is a gate. The counter counts past the class's
 * allowance and says so rather than refusing the tick, because tables hand out
 * skills the class never offered — a background, a feat, a DM feeling
 * generous — and a builder that argues with the table is a builder nobody
 * opens twice. The server sieves the skill names against the compendium and
 * clamps the scores; it does not enforce a count either.
 */

/** The array the book offers a player who would rather not roll. */
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** The race select's escape hatch — deliberately not a slug any race owns. */
const CUSTOM_RACE = "__custom__";

/** The same hatch on the subclass list, and no path in any book is named it. */
const CUSTOM_SUBCLASS = "__custom__";

/** A store with nothing to subscribe to, as MapViewer's locale read has. */
const NEVER_CHANGES = () => () => {};

type ScoreMode = "array" | "manual";
export type ScoreDraft = Record<AbilityKey, string>;

const blankScores = (): ScoreDraft =>
  Object.fromEntries(ABILITIES.map((key) => [key, ""])) as ScoreDraft;

/**
 * Six written answers plus whatever is being added to them — the numbers this
 * form actually posts.
 *
 * Lifted out of the component because it is the one piece of arithmetic on the
 * page that can be wrong in a way nobody notices: a race's increase added
 * twice, or added to a grid that had already included it, is a sheet that
 * plays a whole campaign two points stronger than it should. `increases` is
 * null for "add nothing" — which is both the by-hand grid, where the player
 * has done the addition themselves, and the switch that turns the race's
 * bonuses off for a table whose peoples are their own.
 *
 * A box left blank stays blank rather than becoming a zero: the sheet is
 * allowed to have unanswered questions, and a Strength of 0 is not one.
 */
export function finalScores(
  written: ScoreDraft,
  increases: Partial<Record<AbilityKey, number>> | null
): Record<AbilityKey, number | null> {
  const out = {} as Record<AbilityKey, number | null>;
  for (const key of ABILITIES) {
    const raw = written[key];
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    out[key] = Number.isFinite(n) ? n + (increases?.[key] ?? 0) : null;
  }
  return out;
}

export function BuilderForm({
  campaigns,
  locale,
}: {
  /** Tables this player may sit a character at, loaded on the server. */
  campaigns: readonly { id: string; name: string }[];
  locale: Locale;
}) {
  const t = makeT(locale);

  /**
   * "Is there a script working this page?" — false through the server render
   * and through hydration, true immediately after.
   *
   * It is what keeps the script's additions from being drawn as dead controls
   * for a reader whose script has not arrived yet: a mode toggle that toggles
   * nothing, a "something else…" option that opens no box. Asked as an
   * external store rather than as a mounted flag set from an effect, the same
   * way MapViewer asks the document for its language: the server snapshot is
   * the honest answer for a page that has not hydrated, and there is nothing
   * to subscribe to because the answer only ever changes once.
   */
  const enhanced = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  );

  const [klassSlug, setKlassSlug] = useState<ClassSlug | "">("");
  const [subclassChoice, setSubclassChoice] = useState("");
  const [customSubclass, setCustomSubclass] = useState("");
  const [raceValue, setRaceValue] = useState("");
  const [customRace, setCustomRace] = useState("");
  const [levelText, setLevelText] = useState("1");
  /**
   * "Add my race's increases for me" — ticked, because that is what the array
   * helper has always quietly done and what a first-time player expects.
   *
   * Unticking it is for the table whose race is not this table's race: a
   * homebrew people with a +2 nobody wrote down, a game running the 2024
   * rules where the increases come off the background instead, a DM who has
   * handed out the six numbers already. The race's own line stays on the page
   * either way — it says what the book would have added, and then says that
   * it is not adding it.
   */
  const [applyRaceAsi, setApplyRaceAsi] = useState(true);
  /**
   * "By hand" through the server render *and* through hydration, and only
   * promoted to the array helper afterwards, by the effect below.
   *
   * The default used to be "array", and it was the most expensive line in the
   * file: the server has no script, so it draws the by-hand grid, and the
   * moment the script arrived React found a state saying "array", swapped the
   * six boxes for six selects, and took the answers written in that window
   * down with them. Six uncontrolled inputs unmounting is six answers gone,
   * and the player's only clue was that their scores had vanished.
   *
   * So the two renders now agree, nothing unmounts across hydration, and the
   * choice of helper is made afterwards from what the boxes actually hold.
   */
  const [mode, setMode] = useState<ScoreMode>("manual");
  const [array, setArray] = useState<ScoreDraft>(blankScores);
  const [manual, setManual] = useState<ScoreDraft>(blankScores);
  const [skills, setSkills] = useState<readonly string[]>([]);

  /**
   * The form itself, so the seeding pass below can ask it what it is holding.
   *
   * Every helper state in this component starts at a constant — no class, no
   * race, level 1, no skills, six blank scores — and until this ref existed
   * none of them was ever reconciled with the DOM. That is fine for a page
   * hydrated before anybody touched it and wrong in every other case: a skill
   * ticked in the pre-script window counted *backwards* afterwards, because
   * the tick's `onChange` toggled a list that had never heard of it, and a
   * "Half-Orc" restored by the back/forward cache was a race the preview could
   * not see, so the +2 STR simply never appeared.
   */
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Once, after hydration: read the form and believe it.
   *
   * `FormData` rather than a walk of refs, because what this needs is exactly
   * what the form would post — the same names, the same values, the checkboxes
   * that are actually ticked — and because it costs one line per field instead
   * of one ref per field. `mode` is still "manual" at this point by
   * construction, so the six boxes read here are the by-hand inputs the server
   * drew, not the array's hidden sums.
   *
   * An effect rather than a layout effect: `useLayoutEffect` warns when a
   * client component is rendered on the server, and the frame this costs is
   * the same frame the old code spent swapping the grid during hydration.
   */
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const read = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value.trim() : "";
    };

    const writtenKlass = read("klass");
    const slug = (CLASS_SLUGS as readonly string[]).includes(writtenKlass)
      ? (writtenKlass as ClassSlug)
      : "";
    setKlassSlug(slug);
    // The plain suggestion box the server drew is about to be replaced by a
    // list, and this is the moment its answer is carried across: a name the
    // class publishes becomes that row of the list, and anything else becomes
    // "write your own" with the words still in it. Read here rather than a
    // render later because the box itself does not survive the swap.
    const writtenSubclass = read("subclass");
    const published = slug ? CLASSES[slug].subclasses : [];
    if (!writtenSubclass) {
      setSubclassChoice("");
    } else if (published.includes(writtenSubclass)) {
      setSubclassChoice(writtenSubclass);
    } else {
      setSubclassChoice(CUSTOM_SUBCLASS);
      setCustomSubclass(writtenSubclass);
    }
    // An unticked box sends nothing at all, which is the whole signal — the
    // same reading the sheet's "custom" ticks get on the server.
    setApplyRaceAsi(data.get("raceAsi") !== null);
    setRaceValue(read("race"));
    setLevelText(read("level") || "1");
    setSkills(data.getAll("skills").filter((name) => typeof name === "string"));

    const written = Object.fromEntries(
      ABILITIES.map((key) => [key, read(key)])
    ) as ScoreDraft;
    setManual(written);
    // The standard array is the friendlier door, so it is opened for anyone
    // who has not already walked through the other one. Six boxes with
    // anything in them mean the player has started answering by hand, and
    // promoting them now would be the very unmount this whole pass exists to
    // avoid.
    if (ABILITIES.every((key) => written[key] === "")) setMode("array");
  }, []);

  const info = klassSlug ? CLASSES[klassSlug] : null;
  const custom = raceValue === CUSTOM_RACE;
  const race = custom ? null : raceBySlug(raceValue);
  const arrayMode = enhanced && mode === "array";
  const level = Math.min(Math.max(Number.parseInt(levelText, 10) || 1, 1), 20);
  /**
   * A path belongs to a character who has lived long enough to choose one.
   *
   * Held shut rather than hidden, because "there is a question here and it is
   * not yours yet" is the thing a first-time player needs told — a section
   * that simply vanished would read as a section this app does not have. The
   * action makes the same ruling on its own account, so a level 1 sheet posted
   * around this lock still arrives pathless.
   */
  const pathLocked = info !== null && level < info.subclassLevel;
  const homebrewPath = subclassChoice === CUSTOM_SUBCLASS;
  /** What the race would add, where the player has left it switched on. */
  const raceAsi = (key: AbilityKey) => (applyRaceAsi ? (race?.asi[key] ?? 0) : 0);

  /**
   * The six numbers this form will actually post — the *finished* scores,
   * race included, whichever half of the section produced them.
   *
   * That is the one invariant worth stating twice (the markup states it too):
   * the standard-array helper adds the race's increase and writes the sum into
   * a hidden field, and the by-hand grid is the player writing that same sum
   * themselves. Nothing downstream ever adds a racial bonus a second time, and
   * the sheet that opens after the redirect reads exactly these.
   *
   * The increase is added in exactly one place, and this is it — so the switch
   * that turns it off has exactly one place to reach, and a player who turned
   * it off gets the numbers they handed out, untouched.
   *
   * Computed on every render rather than memoised: six `parseInt`s cost less
   * than the array they would be cached in, and the memo that used to stand
   * here had to hand the race's table of increases out to a function, which is
   * the shape the compiler cannot prove safe.
   */
  const finals = finalScores(
    arrayMode ? array : manual,
    // Two ways of arriving at "add nothing": the by-hand grid, where the
    // player is writing the finished number themselves, and the switch in the
    // race card. They mean the same thing here.
    arrayMode && applyRaceAsi ? (race?.asi ?? null) : null
  );

  const handedOut = ABILITIES.map((key) => array[key]).filter(Boolean);
  const duplicate = new Set(handedOut).size !== handedOut.length;
  const unassigned = ABILITIES.length - handedOut.length;

  const classList = info ? new Set(info.skillChoices.from) : null;
  const onList = classList ? skills.filter((name) => classList.has(name)).length : skills.length;

  // Proficiency, hit points and the caster's two numbers, drawn as the player
  // types rather than after the redirect. The save DC is `spellcasting()`'s
  // own answer rather than a copy of its one line: the signature now takes the
  // half-filled six this form routinely holds, so the number in the preview
  // strip and the number on the sheet after the redirect are computed by the
  // same function — which is the only way they stay equal through a rule
  // change. lib/srd-classes is already in this bundle for `CLASSES`, and since
  // the skill prose moved out of the builder's reach it brings nothing with it.
  const pb = profBonus(level);
  const conFinal = finals.con;
  const hp = info && conFinal !== null ? averageHp(info.hitDie, level, mod(conFinal)) : null;
  const casting = spellcasting(klassSlug, level, finals);

  const toggleSkill = (name: string) =>
    setSkills((current) =>
      current.includes(name) ? current.filter((s) => s !== name) : [...current, name]
    );

  /**
   * Leaving the standard array for the by-hand grid, carrying the sums over.
   *
   * The array helper has nowhere to put a half-elf's two loose +1s, nor the +2
   * a fourth-level character chooses, and "go and do it by hand" was until now
   * an instruction that emptied all six boxes first — the player did the array
   * twice, once in the helper and once from memory. So the by-hand grid is
   * seeded with `finals`: the value handed out plus the race's increase,
   * exactly the number that would have been posted, and the loose +1s are then
   * typed on top of it.
   *
   * Only ever written over where the array has an answer, so a player who
   * filled the grid by hand, wandered into the helper and came back finds
   * their own six numbers still there rather than six blanks.
   */
  const goManual = () => {
    if (mode === "array") {
      setManual((current) => {
        const next = { ...current };
        for (const key of ABILITIES) {
          const final = finals[key];
          if (final !== null) next[key] = String(final);
        }
        return next;
      });
    }
    setMode("manual");
  };

  return (
    <form ref={formRef} action={buildCharacter} className="space-y-5">
      {/* 1. Who they are */}
      <Card>
        <SectionTitle>{t("character.builder.identity")}</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("character.builder.nameLabel")}</Label>
            <Input
              name="name"
              required
              maxLength={150}
              placeholder={t("character.builder.namePh")}
              className="min-h-11"
            />
          </label>
          <label className="block">
            <Label>{t("character.builder.targetLabel")}</Label>
            {/* Blank is the roster, and blank is the default: a character
                invented on a Tuesday evening does not need a table yet. */}
            <Select name="campaignId" className="min-h-11">
              <option value="">{t("character.builder.targetRoster")}</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-parchment-500">
          {t("character.builder.targetHint")}
        </p>
      </Card>

      {/* 2. Class & path */}
      <Card>
        <SectionTitle>{t("character.builder.classSection")}</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("character.builder.klassLabel")}</Label>
            {/* Slugs on the wire, the book's English on the page: the action
                translates one into the other, and every other class name in
                this app is English too. */}
            {/* `defaultValue` rather than `value`, here and on every field
                that is drawn before hydration: the markup arrives long before
                the script does, somebody answers the first question in that
                window, and a controlled input would throw their answer away
                the moment React caught up. The DOM holds the answer; the
                state below only exists to *explain* it. */}
            <Select
              name="klass"
              defaultValue={klassSlug}
              onChange={(e) => {
                setKlassSlug(e.target.value as ClassSlug | "");
                // A path belongs to a class, so changing the class puts the
                // list beside it out of date — and a Champion left standing
                // under Wizard is a wrong answer nobody typed. Dropped here,
                // where the player can see it go. A path they wrote out by
                // hand is their own and survives the change.
                setSubclassChoice((current) => (current === CUSTOM_SUBCLASS ? current : ""));
              }}
              className="min-h-11"
            >
              <option value="">{t("character.builder.klassNone")}</option>
              {CLASS_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {CLASSES[slug].name}
                </option>
              ))}
            </Select>
          </label>
          <div>
            <Label>{t("character.builder.subclassLabel")}</Label>
            {/* Three controls wearing one name, and which of them is on the
                page is decided by how much the form knows. With a class
                chosen and a script running it is the class's own list of
                paths, ending in "write your own" — the branch a player
                actually meets. Below third level that list is a note instead,
                because the answer is not theirs to give yet. And with no class
                or no script it falls back to what this field has always been:
                a text box, which is the only one of the three that can be
                drawn before either fact is known. */}
            {enhanced && info ? (
              pathLocked ? (
                <p className="flex min-h-11 items-center rounded-sm border border-dashed border-ink-600 px-3 text-xs leading-relaxed text-parchment-500">
                  {t("character.builder.subclassLocked", { n: info.subclassLevel })}
                </p>
              ) : (
                <>
                  {/* Controlled, unlike the fields above it, and allowed to
                      be: this select is never drawn before hydration — it
                      needs a class, and a class needs a script to have been
                      chosen — so there is no pre-script answer for it to
                      overwrite. */}
                  <Select
                    name={homebrewPath ? undefined : "subclass"}
                    value={subclassChoice}
                    onChange={(e) => setSubclassChoice(e.target.value)}
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
                    <option value={CUSTOM_SUBCLASS}>
                      {t("character.builder.subclassCustom")}
                    </option>
                  </Select>
                  {/* The name moves onto the box, and the select stops posting
                      — two live fields called `subclass` would hand the action
                      the sentinel and throw the written path away. The same
                      trade the race section makes. */}
                  {homebrewPath && (
                    <Input
                      name="subclass"
                      maxLength={80}
                      value={customSubclass}
                      onChange={(e) => setCustomSubclass(e.target.value)}
                      aria-label={t("character.builder.subclassCustomLabel")}
                      placeholder={t("character.builder.subclassCustomPh")}
                      className="mt-2 min-h-11"
                    />
                  )}
                </>
              )
            ) : (
              <>
                <Input
                  name="subclass"
                  maxLength={80}
                  list="builder-subclass"
                  aria-label={t("character.builder.subclassLabel")}
                  placeholder={t("character.builder.subclassPh")}
                  className="min-h-11"
                />
                <datalist id="builder-subclass">
                  {info?.subclasses.map((path) => <option key={path} value={path} />)}
                </datalist>
              </>
            )}
          </div>
        </div>
        {info && (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-700 pt-3">
            <Fact label={t("character.builder.hitDie")} value={`d${info.hitDie}`} />
            <Fact
              label={t("character.builder.savesLabel")}
              value={info.saves.map((key) => ABILITY_LABELS[key]).join(" · ")}
            />
            <Fact
              label={t("character.builder.castingLabel")}
              value={
                info.castingAbility
                  ? ABILITY_LABELS[info.castingAbility]
                  : t("character.builder.castingNone")
              }
            />
          </dl>
        )}
        <p className="mt-2 text-xs leading-relaxed text-parchment-500">
          {t("character.builder.subclassHint")}
        </p>
      </Card>

      {/* 3. Race */}
      <Card>
        <SectionTitle>{t("character.builder.raceSection")}</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("character.builder.raceLabel")}</Label>
            {/* The name moves to the free-text box when "something else…" is
                chosen, and the select stops posting at all: two live fields
                called `race` would hand the action the select's blank and
                throw the typed people away. */}
            <Select
              name={custom ? undefined : "race"}
              defaultValue={raceValue}
              onChange={(e) => setRaceValue(e.target.value)}
              className="min-h-11"
            >
              <option value="">{t("character.builder.raceNone")}</option>
              {RACES.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
              {/* Offered only where it can be answered: with no script there
                  is no box for it to open, so there is no option either. */}
              {enhanced && (
                <option value={CUSTOM_RACE}>{t("character.builder.raceCustom")}</option>
              )}
            </Select>
          </label>
          {custom && (
            <label className="block">
              <Label>{t("character.builder.raceCustomLabel")}</Label>
              <Input
                name="race"
                maxLength={80}
                value={customRace}
                onChange={(e) => setCustomRace(e.target.value)}
                placeholder={t("character.builder.raceCustomPh")}
                className="min-h-11"
              />
            </label>
          )}
        </div>
        {race && <RaceFacts race={race} t={t} applied={applyRaceAsi} />}
        {/* Uncontrolled and posted like every other field, so that whatever
            state the box is in survives a back button, a restored tab and the
            window before the script lands — the seeding pass reads it back off
            the form rather than assuming it is still ticked. The action never
            looks at `raceAsi`: the increase is added here or nowhere, and what
            reaches the server is six finished numbers either way. */}
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 border-t border-ink-700 pt-3">
          <input
            type="checkbox"
            name="raceAsi"
            defaultChecked={applyRaceAsi}
            onChange={(e) => setApplyRaceAsi(e.target.checked)}
            className="size-4 shrink-0 accent-gold-500"
          />
          <span className="text-sm text-parchment-200">
            {t("character.builder.raceAsiToggle")}
          </span>
        </label>
        <p className="mt-1 text-xs leading-relaxed text-parchment-500">
          {applyRaceAsi
            ? t("character.builder.raceAsiOnHint")
            : t("character.builder.raceAsiOffHint")}
        </p>
        {custom && (
          <p className="mt-2 text-xs leading-relaxed text-parchment-500">
            {t("character.builder.raceCustomHint")}
          </p>
        )}
      </Card>

      {/* 4. Level & background */}
      <Card>
        <SectionTitle>{t("character.builder.basicsSection")}</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("character.builder.levelLabel")}</Label>
            <Input
              type="number"
              name="level"
              min={1}
              max={20}
              defaultValue={levelText}
              onChange={(e) => setLevelText(e.target.value)}
              className="min-h-11"
            />
          </label>
          <label className="block">
            <Label>{t("character.builder.backgroundLabel")}</Label>
            {/* The thirteen the book prints, offered rather than imposed. A
                datalist is a suggestion attached to a text box, so "Retired
                Hexblood Cartographer" is typed straight over it — and the
                thirteen are a constant, which means this list is filled in on
                the server and works before a single byte of script lands. */}
            <Input
              name="background"
              maxLength={80}
              list="builder-background"
              placeholder={t("character.builder.backgroundPh")}
              className="min-h-11"
            />
            <datalist id="builder-background">
              {BACKGROUNDS.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-parchment-500">
          {t("character.builder.backgroundHint")}
        </p>
        <div className="mt-4 border-t border-ink-700 pt-4">
          <AlignmentWheel t={t} />
        </div>
      </Card>

      {/* 5. Ability scores */}
      <Card>
        <SectionTitle>{t("character.builder.scoresSection")}</SectionTitle>
        {enhanced && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ModeTab active={mode === "array"} onClick={() => setMode("array")}>
              {t("character.builder.modeArray")}
            </ModeTab>
            <ModeTab active={mode === "manual"} onClick={goManual}>
              {t("character.builder.modeManual")}
            </ModeTab>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-parchment-500">
          {arrayMode ? t("character.builder.arrayHint") : t("character.builder.manualHint")}
        </p>

        {arrayMode ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {ABILITIES.map((key) => {
                const bonus = raceAsi(key);
                const final = finals[key];
                return (
                  <label key={key} className="block">
                    <span className="mb-1 block text-center text-[11px] font-bold uppercase tracking-wider text-parchment-500">
                      {ABILITY_LABELS[key]}
                    </span>
                    <Select
                      value={array[key]}
                      onChange={(e) =>
                        setArray((current) => ({ ...current, [key]: e.target.value }))
                      }
                      className="min-h-11 text-center"
                      aria-label={ABILITY_LABELS[key]}
                    >
                      <option value="">{t("character.builder.arrayUnassigned")}</option>
                      {STANDARD_ARRAY.map((value) => {
                        // Faded, never withheld. Handing 14 out twice is a
                        // thing a table is allowed to decide, and the server
                        // clamps rather than judges — so the select says
                        // "this one is spoken for" and steps out of the way.
                        const taken = ABILITIES.some(
                          (other) => other !== key && array[other] === String(value)
                        );
                        return (
                          <option
                            key={value}
                            value={value}
                            className={taken ? "text-parchment-500" : undefined}
                          >
                            {taken ? `${value} · ${t("character.builder.arrayUsed")}` : value}
                          </option>
                        );
                      })}
                    </Select>
                    <p className="mt-1 text-center font-mono text-xs">
                      {final === null ? (
                        <span className="text-parchment-500">—</span>
                      ) : (
                        <>
                          <span className="font-bold text-parchment-100">{final}</span>
                          {bonus !== 0 && <span className="ml-1 text-gold-300">{fmt(bonus)}</span>}
                        </>
                      )}
                    </p>
                    {/* What actually goes on the wire: the sum, once. */}
                    <input type="hidden" name={key} value={final ?? ""} />
                  </label>
                );
              })}
            </div>
            {duplicate && (
              <p className="mt-3 text-xs text-blood-400">
                {t("character.builder.arrayDuplicate")}
              </p>
            )}
            {unassigned > 0 && (
              <p className="mt-2 text-xs text-parchment-500">
                {t("character.builder.arrayIncomplete", { n: unassigned })}
              </p>
            )}
          </>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {ABILITIES.map((key) => {
              const bonus = raceAsi(key);
              return (
                <label key={key} className="block">
                  <span className="mb-1 block text-center text-[11px] font-bold uppercase tracking-wider text-parchment-500">
                    {ABILITY_LABELS[key]}
                  </span>
                  <Input
                    type="number"
                    name={key}
                    min={3}
                    max={20}
                    // Uncontrolled, like the class select and for the same
                    // reason — and the state it feeds is what puts the six
                    // numbers back when the player switches modes and returns.
                    defaultValue={manual[key]}
                    onChange={(e) =>
                      setManual((current) => ({ ...current, [key]: e.target.value }))
                    }
                    className="min-h-11 text-center"
                    aria-label={ABILITY_LABELS[key]}
                  />
                  {/* The race's increase is *stated* here and applied by
                      nobody: by hand means by hand, and a number grown
                      silently under the player's fingers is the one thing
                      this half of the section must never do. */}
                  <p className="mt-1 text-center font-mono text-xs text-gold-300">
                    {bonus !== 0 ? fmt(bonus) : " "}
                  </p>
                </label>
              );
            })}
          </div>
        )}
      </Card>

      {/* 6. Skills */}
      <Card>
        <SectionTitle>{t("character.builder.skillsSection")}</SectionTitle>
        <p className="mt-3 text-xs leading-relaxed text-parchment-500">
          {t("character.builder.skillsHint")}
        </p>
        {info && (
          <p className="mt-2 text-xs font-semibold text-parchment-300">
            {t("character.builder.skillsCount", {
              n: onList,
              max: info.skillChoices.n,
              klass: info.name,
            })}
            {onList > info.skillChoices.n && (
              <span className="ml-2 font-normal text-blood-400">
                {t("character.builder.skillsOver", { klass: info.name })}
              </span>
            )}
          </p>
        )}
        {/* All eighteen, always. A class's list is a suggestion drawn *over*
            the compendium's own list — it never shortens it, because the skill
            a background handed out has to be tickable too. */}
        <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {SKILL_INDEX.map((skill) => {
            const off = classList !== null && !classList.has(skill.name);
            return (
              <label
                key={skill.name}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 transition hover:bg-ink-800/60 ${
                  off ? "opacity-45" : ""
                }`}
              >
                <input
                  type="checkbox"
                  name="skills"
                  value={skill.name}
                  // A tick landed before hydration is a tick the player made.
                  defaultChecked={skills.includes(skill.name)}
                  onChange={() => toggleSkill(skill.name)}
                  className="size-4 shrink-0 accent-gold-500"
                />
                <span className="text-sm text-parchment-200">{skill.name}</span>
                <span className="ml-auto font-mono text-[11px] text-parchment-500">
                  {skill.ability}
                </span>
                {off && info && (
                  <span className="sr-only">
                    {t("character.builder.skillsOffList", { klass: info.name })}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </Card>

      {/* 7. What that comes to */}
      <Card>
        <SectionTitle>{t("character.builder.previewTitle")}</SectionTitle>
        {enhanced &&
          (info || race ? (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Fact label={t("character.builder.previewProf")} value={fmt(pb)} />
              {hp !== null && <Fact label={t("character.builder.previewHp")} value={String(hp)} />}
              {race && (
                <Fact
                  label={t("character.builder.speedLabel")}
                  value={`${race.speed} ${t("character.builder.speedUnit")}`}
                />
              )}
              {casting && (
                <>
                  <Fact label={t("character.builder.previewDc")} value={String(casting.dc)} />
                  <Fact label={t("character.builder.previewAtk")} value={fmt(casting.attack)} />
                </>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-parchment-500">
              {t("character.builder.previewEmpty")}
            </p>
          ))}
        {/* Outside the enhanced fold on purpose: the estimate is a courtesy,
            but the field it stands next to is a field, and a form whose script
            has not landed yet still has to be able to state a hit point
            total. */}
        <label className="mt-4 block max-w-40">
          <Label>{t("character.builder.maxHpLabel")}</Label>
          <Input type="number" name="maxHp" min={0} max={9999} className="min-h-11" />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-parchment-500">
          {t("character.builder.maxHpHint")}
        </p>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" className="min-h-11 px-6">
          {t("character.builder.submit")}
        </Button>
      </div>
    </form>
  );
}

/** One labelled figure in a summary row — the class facts and the preview. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-parchment-500">
        {label}
      </dt>
      <dd className="font-mono text-sm font-bold text-parchment-100">{value}</dd>
    </div>
  );
}

/**
 * Speed and score increases, said in the same breath as the race is chosen.
 *
 * `applied` does not change a word of what the book says — the row still reads
 * "+2 CON", because that is what a dwarf is. It changes whether the row is a
 * promise or a note: switched off, the increases are struck through and the
 * line underneath says out loud that nothing is being added, which is a better
 * answer than quietly removing the fact from the page.
 */
function RaceFacts({ race, t, applied }: { race: RaceInfo; t: T; applied: boolean }) {
  const increases = ABILITIES.filter((key) => race.asi[key]).map(
    (key) => `${fmt(race.asi[key] as number)} ${ABILITY_LABELS[key]}`
  );
  return (
    <div className="mt-3 border-t border-ink-700 pt-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        <Fact
          label={t("character.builder.speedLabel")}
          value={`${race.speed} ${t("character.builder.speedUnit")}`}
        />
        <Fact
          label={t("character.builder.asiLabel")}
          value={
            <span className={applied ? undefined : "text-parchment-500 line-through"}>
              {increases.join(", ")}
            </span>
          }
        />
      </dl>
      {/* The half-elf's two loose +1s are told, not applied: which two is a
          decision, and a decision belongs to the player rather than to a
          table of numbers. Told only while the fixed ones are being added,
          though — a page that is adding nothing has no business asking the
          player to place two more of nothing. */}
      {applied && race.floatingAsi ? (
        <p className="mt-1 text-xs text-parchment-500">
          {t("character.builder.asiFloating", { n: race.floatingAsi })}
        </p>
      ) : null}
    </div>
  );
}

/** The two ways of filling the same six boxes, drawn as a pair of tabs. */
function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 cursor-pointer rounded-sm border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-gold-500 bg-gold-500/10 text-gold-300"
          : "border-ink-600 text-parchment-300 hover:border-gold-500 hover:text-gold-300"
      }`}
    >
      {children}
    </button>
  );
}
