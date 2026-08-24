import {
  type Character,
  type CharacterAbility,
  type CharacterSpellSlot,
} from "@/lib/db";
import {
  ABILITIES,
  ABILITY_LABELS,
  hasScores,
  statBlock,
  type AbilityKey,
  type AcBreakdown,
} from "@/lib/dnd";
import { effectiveAc } from "@/lib/armor";
import { SKILLS } from "@/lib/srd";
import { classInfo, spellcasting } from "@/lib/srd-classes";
import { raceBySlug } from "@/lib/srd-races";
import { matchClass } from "@/lib/class-match";
import { sumStatBonuses } from "@/lib/world-items";
import {
  addAbility,
  addItem,
  adjustItemQty,
  approveCharacter,
  deleteAbility,
  deleteItem,
  longRest,
  rejectCharacter,
  setCharacterStatus,
  shortRest,
  unequipItem,
  upsertCharacter,
  useAbility,
} from "@/lib/character-actions";
import type { Locale, T } from "@/lib/i18n";
import { categoryArtMid, classArtMidFor, EMPTY_ART } from "@/lib/ui-art";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PortraitUploadForm } from "@/components/PortraitUploadForm";
import { AutocompleteInput } from "@/components/character/AutocompleteInput";
import { EquipControl } from "@/components/character/EquipControl";
import { EquipmentPanel, type EquippedPiece } from "@/components/character/EquipmentPanel";
import { LevelUpPanel } from "@/components/character/LevelUpPanel";
import { ItemStatsEditor } from "@/components/character/ItemStatsEditor";
import { SpellSlotTracker } from "@/components/character/SpellSlotTracker";
import {
  AbilityScoresCard,
  PassivePerceptionPlate,
  SavesAndSkills,
} from "@/components/character/AbilityColumn";
import { HitPointsBlock, Plate, VitalsStrip } from "@/components/character/SheetVitals";
import { AttacksCard, SpellcastingCard } from "@/components/character/AttacksCard";
import { PersonalityCard } from "@/components/character/PersonalityCard";
import { DragItem, InventoryDrop } from "@/components/character/DragEquip";
import { itemArtSrc, slotCategory } from "@/components/character/item-art";
import { itemPreview, PreviewLink, spellPreview } from "@/components/character/PreviewCard";
import type { InventoryLineShape } from "@/components/character/sheet-data";
import { IconHourglass, IconMoon, IconSkull } from "@/components/Icons";
import {
  Button,
  Card,
  GhostButton,
  Input,
  Label,
  Portrait,
  portraitSrc,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui";

/**
 * The four personality boxes, in the order the printed sheet rules them — and
 * spelled exactly as `readSheetExtras` in lib/character-actions.ts reads them
 * off the form, which is also exactly as the columns are named. One list, so a
 * fifth prompt is one line rather than a hunt through four files.
 */
const PERSONALITY_FIELDS = ["traits", "ideals", "bonds", "flaws"] as const;

const KIND_STYLES: Record<string, string> = {
  spell: "bg-sky-100 text-sky-900 border-sky-700/50",
  ability: "bg-amber-100 text-amber-900 border-amber-700/50",
  trait: "bg-purple-100 text-purple-900 border-purple-700/50",
};

/**
 * One character sheet, wherever it is being read.
 *
 * A sheet at a table and a sheet on its player's roster are the same document:
 * the same scores, the same backpack, the same slots to spend. What differs is
 * the *table* around it — a DM who may approve or kill, a party feed to write
 * into, a world library whose homebrew a line can point back at — and every one
 * of those hangs off `campaignId` being something rather than nothing. So the
 * sheet is written once here and the table's furniture is conditional, rather
 * than the whole thing being written twice and drifting apart by Thursday.
 *
 * Deliberately still a server component: every control is a form posting a
 * server action, which is what lets the page work with its script switched off.
 * The three client islands it reaches for (the autocomplete, the paper doll's
 * dragging, the portrait upload) were client-side before this move and remain
 * exactly as client-side after it.
 */
export function CharacterSheetBody({
  character,
  items,
  abilities,
  spellSlots,
  campaignId,
  editable,
  isDm,
  ownerName,
  t,
  locale,
}: {
  character: Character;
  items: InventoryLineShape[];
  abilities: CharacterAbility[];
  spellSlots: CharacterSpellSlot[];
  /** The table this sheet sits at, or null for one on a player's roster. */
  campaignId: string | null;
  editable: boolean;
  /** Whether the reader runs this table — false wherever there is no table. */
  isDm: boolean;
  /** Named under the character on a shared sheet; null when nobody needs telling. */
  ownerName: string | null;
  t: T;
  locale: Locale;
}) {
  const equipped: EquippedPiece[] = items.flatMap((item) =>
    item.equipped === 1 && item.slot
      ? [
          {
            id: item.id,
            name: item.name,
            slot: item.slot,
            srdIndex: item.srdIndex,
            statBonuses: item.bonuses,
            // What the player typed onto this copy — the first thing the
            // armour rules read, ahead of the compendium's own answer.
            acBase: item.acBase,
            acDex: item.acDex,
            photo: item.photo,
            plate: item.plate,
            category: item.category,
          },
        ]
      : []
  );
  // Derived for display only — the stored scores stay the character's own.
  const wornBonuses = sumStatBonuses(equipped.map((piece) => piece.statBonuses));
  const hpBonus = wornBonuses.hp ?? 0;
  // Armour class is a calculation, not a stored number: worn armour states a
  // formula, the sheet's own field is the fallback, and the shield and the
  // flat bonuses land on top of whichever won.
  const ac: AcBreakdown = effectiveAc(character, equipped, wornBonuses);

  // The whole left rail in one call, worn gear already folded in. Null is a
  // sheet whose six scores are not all filled in yet — a state the page has
  // always had to survive, and everything derived from a modifier below reads
  // that null as "say nothing" rather than as a zero.
  const stats = hasScores(character) ? statBlock(character, wornBonuses) : null;
  const modOf = (key: AbilityKey) =>
    stats?.abilities.find((ability) => ability.key === key)?.mod ?? null;
  // Spell save DCs are read off the score the character is *playing* with, so
  // an amulet that pins a cleric's Wisdom moves the number their enemies roll
  // against — which is precisely the arithmetic tables get wrong at midnight.
  const casting = stats
    ? spellcasting(
        character.klass,
        character.level,
        Object.fromEntries(
          stats.abilities.map((ability) => [ability.key, ability.score])
        ) as Record<AbilityKey, number>
      )
    : null;
  const hitDie = classInfo(character.klass)?.hitDie ?? null;
  // What the player wrote, else what their people walk at, else nothing — a
  // homebrew ancestry has a speed the sheet has no business inventing.
  const speed = character.speed ?? raceBySlug(character.race)?.speed ?? null;
  const hasPersonality = [
    character.traits,
    character.ideals,
    character.bonds,
    character.flaws,
  ].some((line) => (line ?? "").trim() !== "");

  const classLine = [
    character.klass
      ? character.subclass
        ? `${character.klass} (${character.subclass})`
        : character.klass
      : null,
    t("character.sheet.levelN", { n: character.level }),
  ]
    .filter(Boolean)
    .join(" · ");
  const metaLine = [
    character.background,
    character.race,
    character.alignment,
    ownerName ? t("character.sheet.playedBy", { name: ownerName }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Approval is a DM's word, so it is only ever asked for at a table: a
          roster sheet is live from the moment its player names it. */}
      {campaignId !== null && character.approval === "pending" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-gold-500/60 bg-gold-500/10 px-4 py-3">
          <p className="flex-1 text-sm font-bold text-gold-300">
            {t("character.sheet.pendingBanner")}
          </p>
          {isDm && (
            <span className="flex gap-2">
              <form action={approveCharacter.bind(null, character.id)}>
                <button
                  type="submit"
                  className="rounded-sm border border-emerald-700/60 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
                >
                  {t("character.sheet.approve")}
                </button>
              </form>
              <form action={rejectCharacter.bind(null, character.id)}>
                <button
                  type="submit"
                  className="rounded-sm border border-blood-500 px-3 py-1.5 text-xs font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
                >
                  {t("character.sheet.reject")}
                </button>
              </form>
            </span>
          )}
        </div>
      )}

      {/*
        The masthead, in the two lines the printed sheet puts beside the name:
        what the character *is* (class, the archetype taken at third level, and
        how far along they are), and where they came from (background, people,
        alignment) — plus, at a table, whose hands the sheet is in. Empty
        fields simply do not appear; a sheet three minutes old shows a name and
        a level, which is all it has to say.
      */}
      <div className="mt-2 mb-4 flex items-center gap-4">
        <Portrait
          src={portraitSrc(character.id, character.imageFile)}
          alt={character.name}
          size={96}
          eager
          fallbackSrc={classArtMidFor(character.klass)}
        />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {character.name}
          </h1>
          <p className="mt-1 text-sm font-semibold text-parchment-300">{classLine}</p>
          {metaLine && <p className="text-sm text-parchment-500">{metaLine}</p>}
        </div>
      </div>

      {editable && (
        <div className="mb-4 max-w-md">
          <PortraitUploadForm
            characterId={character.id}
            hasPortrait={character.imageFile !== null}
            locale={locale}
          />
        </div>
      )}

      {/* Death is a ruling made at a table, and setCharacterStatus refuses to
          make it anywhere else — so the mark and the banner it raises belong
          to a sheet that sits at one. */}
      {campaignId !== null &&
        (character.status === "dead" ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-sm border border-blood-500 bg-blood-500/10 px-4 py-3">
            <IconSkull size={22} className="shrink-0 text-blood-400" />
            <p className="flex-1 font-display text-sm font-bold uppercase tracking-wide text-blood-400">
              {t("character.sheet.deadBanner")}
            </p>
            {isDm && (
              <form action={setCharacterStatus.bind(null, character.id, "alive")}>
                <button
                  type="submit"
                  className="rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
                >
                  {t("character.sheet.markAlive")}
                </button>
              </form>
            )}
          </div>
        ) : (
          isDm && (
            <form
              action={setCharacterStatus.bind(null, character.id, "dead")}
              className="mb-6"
            >
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-bold text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
              >
                <IconSkull size={14} />
                {t("character.sheet.markDead")}
              </button>
            </form>
          )
        ))}

      {/*
        The sheet itself, laid out the way the printed one has been laid out
        since the game had a printed one: three columns, and each of them
        answering a different question. The left is what the character *is* and
        can therefore roll; the middle is what happens to them and what they do
        back; the right is who they are and what they can call on. Nothing here
        is new information — it is the same document as before, in the
        arrangement its readers already know by heart.

        Below `lg` the grid dissolves into one flowing column and the three
        column wrappers become `display: contents`, which lets every block
        become a flex item of the page itself and take its place in an order
        chosen for a phone held at a table: the numbers a round of combat needs
        first, the doll under them, the long ruled lists folded away behind a
        summary, the reading matter last.

        The markup is written in *that* order — middle column, doll, left rail,
        backpack, right column — rather than in left-to-right order, and the
        wide layout is the one that reorders. That is the way round it has to
        be, because `order` moves what the eye sees and never what the Tab key
        follows: written this way, every control on a phone is reached in the
        order it appears, and the price is paid at `lg`, where the left rail
        holds no controls at all and the only thing out of step is that the
        right column's rest buttons come last in the markup instead of second.

        The two ladders of numbers, so neither has to be reconstructed by
        reading the whole file:

          phone, `order-*` on each block —
            (none) vitals · hit points · hit dice · level up, in markup order
            4  paper doll          8  attacks
            5  ability scores      9  spellcasting
            6  saves & skills     10  backpack
            7  passive perception 11  spells & abilities
                                  12  personality
                                  13  notes

          `lg`, `lg:order-*` on each column —
            1  left rail   2  middle   3  right   4  doll   5  backpack

        The first three carry no number at all: `order` defaults to 0, they are
        already first in the markup, and a 1-2-3 written out only invites the
        belief that the rest of the ladder is dense.

        Within each of the five stretches the markup runs in the phone's order;
        the stretches themselves are grouped by column, which is why 8 and 9 —
        the middle column's own combat blocks — are written above the doll they
        appear beneath. That is the one place the two orders part company, and
        it costs nothing: neither block sits between a control and the control
        that follows it.
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        {/* The middle: what a round of combat asks for, in the order it
            asks for it. */}
        <div className="contents lg:order-2 lg:flex lg:flex-col lg:gap-6">
          <div>
            <VitalsStrip ac={ac} initiative={modOf("dex")} speed={speed} t={t} />
          </div>
          {character.maxHp !== null && (
            <div>
              <HitPointsBlock
                character={character}
                hpBonus={hpBonus}
                editable={editable}
                t={t}
              />
            </div>
          )}
          {/* Only drawn for a class the book knows: a homebrew class levels on
              a die nobody here can name, and "—d—" is worse than silence. */}
          {hitDie !== null && (
            <div>
              <Plate
                label={t("character.sheet.hitDice")}
                value={`${character.level}d${hitDie}`}
              />
            </div>
          )}
          {/* Under the hit dice, which is the other place on this sheet where
              the level is a number rather than a word: the plate says what the
              character has, and the fold beneath it is how they get the next
              one. Unnumbered like the three blocks above it, so the phone
              reads them in markup order. */}
          {editable && (
            <div>
              <LevelUpPanel character={character} t={t} />
            </div>
          )}
          <section className="order-8 space-y-4 lg:order-none">
            <SectionTitle>{t("character.sheet.attacks")}</SectionTitle>
            <AttacksCard
              equipped={equipped}
              strMod={modOf("str")}
              dexMod={modOf("dex")}
              profBonus={stats?.profBonus ?? 0}
              casting={casting}
              t={t}
            />
          </section>
          {casting && (
            <section className="order-9 space-y-4 lg:order-none">
              <SectionTitle>{t("character.sheet.spellcasting")}</SectionTitle>
              <SpellcastingCard casting={casting} t={t} />
            </section>
          )}
        </div>

        {/* The paper doll, which needs the whole width: it is a figure with
            a column of squares down either side, and a third of the page
            turns that into a smear. On a phone it rides up to just under the
            hit points — a player checks what they are holding far more often
            than they read their own backstory. Its own bottom margin is
            cancelled, because the spacing here is the layout's gap and the
            two together would double it. */}
        {(editable || equipped.length > 0) && (
          <div className="order-4 [&>section]:mb-0 lg:col-span-3">
            <EquipmentPanel
              equipped={equipped}
              portrait={{
                src: portraitSrc(character.id, character.imageFile),
                alt: character.name,
                fallbackSrc: classArtMidFor(character.klass),
              }}
              ac={ac}
              editable={editable}
              t={t}
            />
          </div>
        )}

        {/* The left rail: six scores, the bonus, and the twenty-four ruled
            lines a player reads off all evening. */}
        <div className="contents lg:order-1 lg:flex lg:flex-col lg:gap-6">
          {stats ? (
            <>
              <div className="order-5 lg:order-none">
                <AbilityScoresCard stats={stats} t={t} />
              </div>
              {/* The fold and the flat copy are the same two lists written
                  twice: `open` is an attribute and no media query can reach
                  it, so the phone gets a summary to press and the wide screen
                  gets the lists standing open. Whichever is not wanted is
                  `display:none`, and therefore out of the accessibility tree
                  rather than merely out of sight. */}
              <details className="order-6 rounded-sm border border-ink-600/80 bg-ink-900/85 px-4 py-1 lg:hidden">
                <summary className="min-h-11 cursor-pointer py-3 font-display text-sm uppercase tracking-wide text-gold-300 hover:text-gold-400">
                  {t("character.sheet.savesAndSkills")}
                </summary>
                <div className="space-y-4 pb-3">
                  <SavesAndSkills stats={stats} t={t} />
                </div>
              </details>
              <div className="hidden lg:block lg:space-y-6">
                <SavesAndSkills stats={stats} t={t} />
              </div>
              <div className="order-7 lg:order-none">
                <PassivePerceptionPlate stats={stats} t={t} />
              </div>
            </>
          ) : (
            editable && (
              <p className="order-5 rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-parchment-500 lg:order-none">
                {t("character.sheet.fillScoresHint")}
              </p>
            )
          )}
        </div>

        {/* The backpack, under the doll that it fills. */}
        <section className="order-10 space-y-4 lg:order-5 lg:col-span-3">
          <SectionTitle>{t("character.sheet.inventory")}</SectionTitle>
          <Card>
            {items.length === 0 && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={EMPTY_ART.inventory}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="mx-auto mb-3 w-24 opacity-70"
                />
                <p className="text-sm text-parchment-500">{t("character.sheet.backpackEmpty")}</p>
              </>
            )}
            {items.length > 0 && (
              <InventoryGrid items={items} editable={editable} t={t} locale={locale} />
            )}
            {editable && (
              <form action={addItem.bind(null, character.id)} className="mt-4 space-y-2 border-t border-ink-700 pt-4">
                <div className="flex gap-2">
                  <AutocompleteInput
                    characterId={character.id}
                    kind="item"
                    name="name"
                    required
                    locale={locale}
                    placeholder={t("character.sheet.itemNamePh")}
                  />
                  <Input name="qty" type="number" min={1} max={9999} defaultValue={1} className="!w-20" />
                </div>
                <Input name="notes" placeholder={t("character.sheet.notesOptionalPh")} />
                {/* Ticked, the name is taken at face value and the line
                    starts with no source at all — the way to add a
                    heirloom that happens to be called "Shield". */}
                {/* The tick is 20px so it still reads as a tick; the label
                    around it is the 44px a finger aims at. */}
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-parchment-300">
                  <input
                    type="checkbox"
                    name="custom"
                    value="1"
                    className="h-5 w-5 accent-[#8a6516]"
                  />
                  {t("character.custom")}
                </label>
                <Button type="submit">{t("character.sheet.addItem")}</Button>
              </form>
            )}
          </Card>
        </section>

        {/* The right: the person, their powers, and whatever else was
            written down about them. */}
        <div className="contents lg:order-3 lg:flex lg:flex-col lg:gap-6">
          <section className="order-11 space-y-4 lg:order-none">
            {/*
              The one section title on this sheet with controls beside it, and
              therefore the one that has to be told how to share a line.

              Three corrections, all of them measured rather than guessed:

              `flex-auto` on the title. A SectionTitle draws its name and then
              a double rule to the end of its box — but a bare `<h2>` dropped
              into a flex row is sized to its contents, and the rule, being the
              part that flexes, is the part that gets nothing: it rendered
              exactly 0px wide here and nowhere else on the sheet. Growing the
              wrapper gives the rule its width back and the row its horizontal
              datum.

              `flex-wrap`, because this column is 272px wide at `lg` and the
              title alone wants 224 of them. Unwrapped, the two rest buttons
              were shrunk to 69px, their labels broken over two lines, and the
              whole group laid across the title's own letters — on a phone as
              well as in the wide grid. Wrapped, they drop to a line of their
              own at full size and the title takes the one above.

              `translate-y-px`, which is the optical correction the eye was
              actually complaining about. Both boxes are centred on the row and
              the boxes are not the thing being read: 16px Cinzel in a 24px
              line box puts its baseline 17px down, while a 12px label inside a
              30px button sits 15px down its own — so with the button box
              standing 3px taller, the two lines of type ended up a pixel
              apart, the label the higher of them. One pixel of transform, no
              layout moved, and they share a baseline.
            */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-auto">
                <SectionTitle>{t("character.sheet.spellsAbilities")}</SectionTitle>
              </div>
              <div className="flex shrink-0 translate-y-px items-center gap-2">
                {/* Short rest is a warlock's button and nobody else's: an hour by
                    the fire refills pact slots and hands every other class
                    nothing at all. Drawn only when the written class reads as a
                    warlock — the alternative is a control that is always there
                    and silently does nothing eleven times out of twelve, which
                    teaches a player that the sheet's buttons are decorative.
                    Reading the class from free text is the same match the class
                    plate and "suggest from class" already make, so "Level 5
                    Warlock (Fiend)" gets the button. */}
                {editable && spellSlots.length > 0 && matchClass(character.klass) === "warlock" && (
                  <form action={shortRest.bind(null, character.id)}>
                    <GhostButton
                      type="submit"
                      title={t("character.sheet.shortRestHint")}
                      className="!px-3 !py-1.5 text-xs"
                    >
                      <IconHourglass size={14} /> {t("character.sheet.shortRest")}
                    </GhostButton>
                  </form>
                )}
                {/* A rest is worth offering to anyone with something to refill:
                    a limited-use ability, a spell slot, or both. */}
                {editable &&
                  (abilities.some((a) => a.usesMax !== null) || spellSlots.length > 0) && (
                    <form action={longRest.bind(null, character.id)}>
                      <GhostButton type="submit" className="!px-3 !py-1.5 text-xs">
                        <IconMoon size={14} /> {t("character.sheet.longRest")}
                      </GhostButton>
                    </form>
                  )}
              </div>
            </div>
            <Card>
              {/*
                Slots first: they are the resource a caster spends between
                one line of this list and the next, and the list below is
                what they are spent *on*.
              */}
              <SpellSlotTracker
                characterId={character.id}
                slots={spellSlots}
                editable={editable}
                t={t}
              />
              {abilities.length === 0 && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={EMPTY_ART.spells}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="mx-auto mb-3 w-24 opacity-70"
                  />
                  <p className="text-sm text-parchment-500">
                    {t("character.sheet.noAbilities")}
                  </p>
                </>
              )}
              <ul className="divide-y divide-ink-700">
                {abilities.map((ability) => (
                  <li key={ability.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${KIND_STYLES[ability.kind]}`}
                      >
                        {t(`character.sheet.kind.${ability.kind}`)}
                      </span>
                      {/* A div rather than a paragraph: the name carries its
                          preview card along with it, and a card is not phrasing
                          content — inside a <p> the parser would close the
                          paragraph early and rearrange the row around it. */}
                      <div className="min-w-0 flex-1 font-semibold text-parchment-100">
                        <AbilityName ability={ability} t={t} />
                      </div>
                      {ability.usesMax !== null && (
                        <span className="font-mono text-sm font-bold text-gold-300">
                          {ability.usesLeft}/{ability.usesMax}
                        </span>
                      )}
                      {editable && (
                        <div className="flex items-center gap-1">
                          {ability.usesMax !== null && (
                            <form action={useAbility.bind(null, ability.id)}>
                              <button
                                type="submit"
                                disabled={ability.usesLeft === 0}
                                className="rounded border border-gold-500 px-2 py-1 text-xs font-bold text-gold-300 transition hover:bg-gold-500/10 disabled:opacity-40 cursor-pointer"
                              >
                                {t("character.sheet.use")}
                              </button>
                            </form>
                          )}
                          {/* A line struck off a sheet is gone — the notes,
                              the uses counter, all of it — so it takes two
                              presses. The rows share a fold group, so the
                              one opened before folds itself away. */}
                          <ConfirmButton
                            label={<DeleteMark />}
                            confirmLabel={
                              <span className="flex min-h-9 items-center">
                                {t("common.confirm.yesDelete")}
                              </span>
                            }
                            warnText={t("common.confirm.areYouSure")}
                            action={deleteAbility.bind(null, ability.id)}
                            danger
                            size="sm"
                            group="ability-delete"
                            ariaLabel={t("character.sheet.deleteAbility", {
                              name: ability.name,
                            })}
                          />
                        </div>
                      )}
                    </div>
                    {ability.notes && (
                      <p className="mt-1 text-xs text-parchment-500">{ability.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <form action={addAbility.bind(null, character.id)} className="mt-4 space-y-2 border-t border-ink-700 pt-4">
                  <div className="flex gap-2">
                    <AutocompleteInput
                      characterId={character.id}
                      kind="spell"
                      name="name"
                      required
                      locale={locale}
                      placeholder={t("character.sheet.abilityNamePh")}
                    />
                    <Select name="kind" className="!w-28">
                      <option value="spell">{t("character.sheet.kind.spell")}</option>
                      <option value="ability">{t("character.sheet.kind.ability")}</option>
                      <option value="trait">{t("character.sheet.kind.trait")}</option>
                    </Select>
                    <Input name="usesMax" type="number" min={1} max={99} placeholder={t("character.sheet.usesPh")} className="!w-20" />
                  </div>
                  <Input name="notes" placeholder={t("character.sheet.abilityNotesPh")} />
                  {/* Same tick as the inventory form: a homebrew power
                      named after a book spell stays homebrew. */}
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-parchment-300">
                    <input
                      type="checkbox"
                      name="custom"
                      value="1"
                      className="h-5 w-5 accent-[#8a6516]"
                    />
                    {t("character.custom")}
                  </label>
                  <Button type="submit">{t("common.add")}</Button>
                </form>
              )}
            </Card>
          </section>
          {/* Below the powers rather than above them, because that is where a
              phone puts it — and the rule this file keeps is that the markup
              runs in the phone's order, so that Tab follows the eye. */}
          {hasPersonality && (
            <section className="order-12 space-y-4 lg:order-none">
              <SectionTitle>{t("character.sheet.personality")}</SectionTitle>
              <PersonalityCard character={character} t={t} />
            </section>
          )}
          {character.notes && (
            <section className="order-[13] space-y-4 lg:order-none">
              <SectionTitle>{t("character.sheet.notes")}</SectionTitle>
              <Card className="!p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
                  {character.notes}
                </p>
              </Card>
            </section>
          )}
        </div>
      </div>

      {editable && (
        <details className="mt-8">
          <summary className="cursor-pointer font-display text-sm uppercase tracking-wide text-gold-300 hover:text-gold-400">
            {t("character.sheet.editSheet")}
          </summary>
          <Card className="mt-4">
            <SheetForm
              campaignId={campaignId}
              userId={character.userId}
              character={character}
              t={t}
            />
          </Card>
        </details>
      )}
    </>
  );
}

/**
 * The backpack as squares rather than lines — what every game with an
 * inventory settled on, because a picture is found faster than a name in a
 * column. Each square is a `<details>` whose summary *is* the square; opening
 * one unfolds the line's full controls beneath it, across the whole row. The
 * squares share a `name`, so the browser closes the one before — an accordion
 * with no script behind it, which is what keeps this page a server component.
 *
 * The one client-side thing here is the dragging: each square announces the
 * slot it may be worn in so the paper doll can light up, and the grid as a
 * whole is where a worn piece is dropped to come off. Both are additions to
 * the buttons inside the folded-open square, never a replacement for them.
 */
function InventoryGrid({
  items,
  editable,
  t,
  locale,
}: {
  items: InventoryLineShape[];
  editable: boolean;
  t: T;
  locale: Locale;
}) {
  return (
    <InventoryDrop enabled={editable} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <details
          key={item.id}
          name="inventory-cell"
          className="group/cell rounded-sm border border-transparent open:col-span-full open:border-gold-500/40 open:bg-ink-950/40 open:p-3"
        >
          <summary
            title={item.name}
            className="flex cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          >
            {/*
              The dragged thing is the square, not the whole row: the same
              picture the eye is already on. Where it may go is the answer the
              equip button gives — the source's slot, else the row's own, else
              nothing, which means the player decides and any square will take
              it (equipItem still has the final word).
            */}
            <DragItem
              itemId={item.id}
              slot={item.requiredSlot ?? item.slot}
              enabled={editable && item.equipped === 0}
              className="flex min-w-0 flex-1"
            >
              <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm border border-ink-600 bg-ink-950/60 transition hover:border-gold-500 group-open/cell:aspect-auto group-open/cell:h-16 group-open/cell:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  // Photograph, then the plate engraved for this very piece (or
                  // for its kind), then the line's own category, then what its
                  // slot gives away (a line in the armour slot is armour,
                  // whatever else the row forgot), then the plate that says "a
                  // thing in a backpack" and nothing more. Same chain as the
                  // paper doll's.
                  src={itemArtSrc(item, slotCategory(item.slot)) ?? categoryArtMid("gear")}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  // Otherwise the browser drags the picture rather than the line.
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {item.equipped === 1 && (
                  <span
                    aria-hidden
                    title={t("character.equipment.worn")}
                    className="absolute left-1 top-1 h-2 w-2 rounded-full bg-gold-500 ring-1 ring-ink-900"
                  />
                )}
                {item.qty > 1 && (
                  <span className="absolute bottom-0 right-0 rounded-tl-sm border-l border-t border-ink-600 bg-ink-900/90 px-1 font-mono text-[10px] font-bold text-parchment-100">
                    {item.qty}
                  </span>
                )}
              </span>
            </DragItem>
            {/* The square is a picture; this is what it is called. */}
            <span className="sr-only">
              {item.name}
              {item.qty > 1 && ` ×${item.qty}`}
              {item.equipped === 1 && ` — ${t("character.equipment.worn")}`}
            </span>
          </summary>

          <div className="mt-3 space-y-2">
            {/* A div rather than a paragraph, for the reason the ability row
                gives above: the name brings a card with it. */}
            <div className="font-semibold text-parchment-100">
              <ItemName item={item} t={t} locale={locale} />
              {item.qty > 1 && (
                <span className="ml-1.5 text-sm text-parchment-500">×{item.qty}</span>
              )}
              {item.equipped === 1 && (
                <span className="ml-1.5 rounded-sm border border-gold-500/60 bg-gold-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-300">
                  {t("character.equipment.worn")}
                </span>
              )}
            </div>
            {item.notes && <p className="text-xs text-parchment-500">{item.notes}</p>}
            {editable && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1">
                    <form action={adjustItemQty.bind(null, item.id, -1)}>
                      <IconButton label="−" />
                    </form>
                    <form action={adjustItemQty.bind(null, item.id, 1)}>
                      <IconButton label="+" />
                    </form>
                  </span>
                  {item.equipped === 1 ? (
                    <form action={unequipItem.bind(null, item.id)}>
                      <GhostButton type="submit" className="min-h-11 !px-3 !py-1 text-xs">
                        {t("character.equipment.unequip")}
                      </GhostButton>
                    </form>
                  ) : (
                    <EquipControl item={item} locale={locale} />
                  )}
                  {/*
                    Taking a thing off is a mistake worth one press to undo;
                    striking it out of the pack is not, so it takes two. The
                    fold group is the inventory's, so a second square's
                    confirmation folds the first one away.
                  */}
                  <span className="ml-auto">
                    <ConfirmButton
                      label={<DeleteMark />}
                      confirmLabel={
                        <span className="flex min-h-9 items-center">
                          {t("common.confirm.yesDelete")}
                        </span>
                      }
                      warnText={t("common.confirm.areYouSure")}
                      action={deleteItem.bind(null, item.id)}
                      danger
                      size="sm"
                      group="inventory-delete"
                      ariaLabel={t("character.sheet.deleteItem", { name: item.name })}
                    />
                  </span>
                </div>
                {/* The numbers, folded away: most lines never need them. */}
                <ItemStatsEditor item={item} locale={locale} />
              </>
            )}
          </div>
        </details>
      ))}
    </InventoryDrop>
  );
}

/**
 * The inventory line's name, which opens a card whenever the row remembers
 * where it came from: an SRD index shows the compendium entry in miniature, a
 * library reference shows the piece as its own world forged it, and either
 * card carries the way through to the full page. A hand-typed line is just a
 * name, and stays plain text rather than pretending to lead somewhere.
 *
 * A roster line never carries the second of those: the library belongs to a
 * world, a roster sheet belongs to none, and the copy a table stamps drops the
 * reference on the way in. So the card disappears by itself here, with no flag
 * saying so — the row simply has nothing to show.
 */
function ItemName({
  item,
  t,
  locale,
}: {
  item: InventoryLineShape;
  t: T;
  locale: Locale;
}) {
  const facts = itemPreview(item, locale, t);
  if (!facts) return <>{item.name}</>;
  // The tooltip layer that was here before the cards were, kept because it is
  // the one thing that still works when everything else has been switched off.
  // What the player typed on this copy outranks the book: they wrote it down
  // for a reason, and it is the sentence they were reaching for.
  const preview = item.notes?.trim() || facts.summary || facts.detail;
  return (
    <PreviewLink
      id={item.id}
      name={facts.title}
      facts={facts}
      title={hoverText(preview, t("character.sheet.previewHint"))}
      linkTitle={hoverText(preview, facts.linkLabel)}
      t={t}
    />
  );
}

/** Same rule for a spell line — the SRD is the only source one can name. */
function AbilityName({ ability, t }: { ability: CharacterAbility; t: T }) {
  const facts = spellPreview(ability, t);
  if (!facts) return <>{ability.name}</>;
  const preview = ability.notes?.trim() || facts.summary;
  return (
    <PreviewLink
      id={ability.id}
      name={ability.name}
      facts={facts}
      title={hoverText(preview, t("character.sheet.previewHint"))}
      linkTitle={hoverText(preview, facts.linkLabel)}
      t={t}
    />
  );
}

/**
 * The touch of information the name itself can give, without opening anything.
 *
 * This was the whole feature before the cards were, and it is kept because it
 * is the layer underneath them: a hovering mouse reads it without pressing,
 * and a browser too old for a popover has nothing else. The line is the same
 * one the card leads with — what the player typed on this copy, else the
 * entry's own summary, else the opening of a library piece's description.
 *
 * The hint about what the press does keeps its place on a second line: the
 * preview is the addition, not the replacement. Everything is one clipped
 * paragraph, because a `title` is a tooltip, not a page.
 */
const PREVIEW_MAX = 120;

function hoverText(preview: string | null | undefined, hint: string) {
  const flat = preview?.replace(/\s+/g, " ").trim();
  if (!flat) return hint;
  const clipped =
    flat.length <= PREVIEW_MAX ? flat : `${flat.slice(0, PREVIEW_MAX).trimEnd()}…`;
  return `${clipped}\n${hint}`;
}

/**
 * A one-glyph submit — the quantity knobs. Square, and square at the size a
 * finger is: 44px is the smallest box a thumb reliably lands in, and these two
 * sit close enough together that a miss costs an item rather than nothing.
 */
function IconButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="h-11 w-11 rounded border border-ink-600 text-xs font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
    >
      {label}
    </button>
  );
}

/**
 * The cross on a delete knob, padded out to a real target.
 *
 * ConfirmButton's own knob is a text button — right for a worded action, too
 * small for a single glyph — so the glyph is handed in already boxed: the
 * summary's own padding plus this box comes to 44px in both directions.
 */
function DeleteMark() {
  return <span className="flex h-9 w-7 items-center justify-center">✕</span>;
}

/**
 * The sheet's own form. Exported because the campaign route needs it twice
 * over: folded under "Edit sheet" on a sheet that exists, and standing alone
 * as the create form for a player who has not written one yet.
 *
 * `campaignId` is null for a roster sheet, which is exactly what
 * `upsertCharacter` reads as "no table": no party name to keep in step, no
 * feed line, and approval settled on the spot.
 */
export function SheetForm({
  campaignId,
  userId,
  character,
  t,
}: {
  campaignId: string | null;
  userId: string;
  character?: Character;
  t: T;
}) {
  const profSkills = new Set(
    (character?.profSkills ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  const profSaves = new Set(
    (character?.profSaves ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  return (
    <form action={upsertCharacter.bind(null, campaignId, userId)} className="space-y-4">
      {character && <input type="hidden" name="characterId" value={character.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label>{t("character.sheet.form.nameLabel")}</Label>
          <Input name="name" required defaultValue={character?.name} placeholder={t("character.sheet.form.namePh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.level")}</Label>
          <Input name="level" type="number" min={1} max={30} defaultValue={character?.level ?? 1} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.classLabel")}</Label>
          <Input name="klass" defaultValue={character?.klass ?? ""} placeholder={t("character.sheet.form.classPh")} />
        </label>
        {/*
          The eight fields below arrived with the official sheet's information
          architecture, and every one of them is carried by this form on every
          save — including the ones left blank. `readSheetExtras` keeps a
          column it is not sent and clears one it is sent empty, which is the
          contract that lets a player delete an alignment they regret by
          rubbing it out rather than by finding another door.
        */}
        <label className="block">
          <Label>{t("character.sheet.form.subclassLabel")}</Label>
          <Input name="subclass" defaultValue={character?.subclass ?? ""} placeholder={t("character.sheet.form.subclassPh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.raceLabel")}</Label>
          <Input name="race" defaultValue={character?.race ?? ""} placeholder={t("character.sheet.form.racePh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.backgroundLabel")}</Label>
          <Input name="background" defaultValue={character?.background ?? ""} placeholder={t("character.sheet.form.backgroundPh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.alignmentLabel")}</Label>
          <Input name="alignment" defaultValue={character?.alignment ?? ""} placeholder={t("character.sheet.form.alignmentPh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.speedLabel")}</Label>
          {/* The placeholder is the number the sheet is *showing* — the same
              `speed ?? race ?? nothing` the vitals strip reads — so a dwarf
              whose tile says 25 does not open the editor onto an empty box and
              conclude the app forgot. Left blank the column stays NULL, which
              is the documented way back to the race's own answer rather than a
              deletion the fallback quietly undoes. */}
          <Input
            name="speed"
            type="number"
            min={0}
            max={120}
            defaultValue={character?.speed ?? ""}
            placeholder={String(
              character?.speed ?? raceBySlug(character?.race)?.speed ?? ""
            )}
          />
          <span className="mt-1 block text-xs leading-relaxed text-parchment-500">
            {t("character.sheet.form.speedHint")}
          </span>
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.maxHp")}</Label>
          {/* Zero, not one: `readSheetExtras` accepts it and the builder
              offers it, and a floor of 1 here would leave a sheet saved at 0
              unable to be saved again without inventing a hit point. */}
          <Input name="maxHp" type="number" min={0} max={9999} defaultValue={character?.maxHp ?? ""} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.armorClass")}</Label>
          <Input name="armorClass" type="number" min={1} max={40} defaultValue={character?.armorClass ?? ""} />
        </label>
      </div>

      <div>
        <Label>{t("character.sheet.form.abilityScores")}</Label>
        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((key) => (
            <label key={key} className="block">
              <span className="mb-0.5 block text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500">
                {ABILITY_LABELS[key]}
              </span>
              <Input
                name={key}
                type="number"
                min={1}
                max={30}
                defaultValue={character?.[key] ?? ""}
                className="text-center"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("character.sheet.form.saveProfs")}</Label>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {ABILITIES.map((key) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm text-parchment-300"
            >
              <input
                type="checkbox"
                name="profSaves"
                value={key}
                defaultChecked={profSaves.has(key)}
                className="h-5 w-5 accent-[#8a6516]"
              />
              {ABILITY_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("character.sheet.form.skillProfs")}</Label>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {SKILLS.map((skill) => (
            <label
              key={skill.name}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm text-parchment-300"
            >
              <input
                type="checkbox"
                name="profSkills"
                value={skill.name}
                defaultChecked={profSkills.has(skill.name)}
                className="h-5 w-5 accent-[#8a6516]"
              />
              {skill.name}
              <span className="text-[10px] text-parchment-500">{skill.ability}</span>
            </label>
          ))}
        </div>
      </div>
      {/* Four prompts rather than one blank page: the book asks the four
          questions separately because that is what gets them answered, and the
          sheet keeps them apart for the same reason. */}
      <div>
        <Label>{t("character.sheet.form.personalityLabel")}</Label>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {PERSONALITY_FIELDS.map((key) => (
            <label key={key} className="block">
              <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-parchment-500">
                {t(`character.sheet.${key}`)}
              </span>
              <Textarea
                name={key}
                rows={3}
                defaultValue={character?.[key] ?? ""}
                placeholder={t(`character.sheet.form.${key}Ph`)}
              />
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <Label>{t("character.sheet.form.notesLabel")}</Label>
        <Textarea name="notes" rows={5} defaultValue={character?.notes ?? ""} />
      </label>
      <Button type="submit">
        {character ? t("character.sheet.form.saveSheet") : t("character.sheet.form.createButton")}
      </Button>
    </form>
  );
}
