import Link from "next/link";
import {
  type Character,
  type CharacterAbility,
  type CharacterSpellSlot,
} from "@/lib/db";
import {
  ABILITIES,
  ABILITY_LABELS,
  acGearBonus,
  acTitle,
  fmt,
  hasScores,
  statBlock,
  type AcBreakdown,
} from "@/lib/dnd";
import { effectiveAc } from "@/lib/armor";
import { SKILLS } from "@/lib/srd";
import { getItem, getSpell, itemNameTr, itemSummary, spellSummary } from "@/lib/srd-data";
import { sumStatBonuses, type StatBonuses } from "@/lib/world-items";
import {
  addAbility,
  addItem,
  adjustCharacterHp,
  adjustItemQty,
  approveCharacter,
  deleteAbility,
  deleteItem,
  longRest,
  rejectCharacter,
  setCharacterStatus,
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
import { ItemStatsEditor } from "@/components/character/ItemStatsEditor";
import { SpellSlotTracker } from "@/components/character/SpellSlotTracker";
import { DragItem, InventoryDrop } from "@/components/character/DragEquip";
import { itemArtSrc, slotCategory } from "@/components/character/item-art";
import type { InventoryLineShape } from "@/components/character/sheet-data";
import { IconMoon, IconSkull } from "@/components/Icons";
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
  const acBonus = acGearBonus(ac);

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

      <div className="mt-2 mb-2 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <Portrait
            src={portraitSrc(character.id, character.imageFile)}
            alt={character.name}
            size={96}
            eager
            fallbackSrc={classArtMidFor(character.klass)}
          />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
              {character.name}
            </h1>
            <p className="mt-1 text-sm text-parchment-500">
              {[
                t("character.sheet.levelN", { n: character.level }),
                character.race,
                character.klass,
                ownerName ? t("character.sheet.playedBy", { name: ownerName }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {/*
          Both numbers read as the value that matters at the table — what
          the character actually has right now — with the equipment's
          share spelled out beside it so nobody wonders where it came from.

          Hit points read "current / maximum", and the maximum is the
          sheet's own field: `currentHp` is clamped to it, so pairing the
          pool with the equipment-inflated number would show a character
          at full health as though they were wounded. The worn share stays
          the parenthetical it always was.
        */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 font-mono text-sm font-bold">
            {character.maxHp !== null && (
              <span
                title={t("character.hp.title")}
                className="rounded-md border border-blood-500/50 bg-blood-500/10 px-3 py-1.5 text-blood-400"
              >
                {character.currentHp ?? character.maxHp} / {character.maxHp}{" "}
                {t("character.hp.label")}
                {hpBonus !== 0 && (
                  <span className="ml-1 text-gold-300" title={t("character.equipment.bonusTitle")}>
                    ({fmt(hpBonus)})
                  </span>
                )}
              </span>
            )}
            {ac.value !== null && (
              <span
                title={acTitle(ac)}
                className="rounded-md border border-ink-600 px-3 py-1.5 text-parchment-300"
              >
                AC {ac.value}
                {acBonus !== 0 && (
                  <span className="ml-1 text-gold-300" title={t("character.equipment.bonusTitle")}>
                    ({fmt(acBonus)})
                  </span>
                )}
              </span>
            )}
          </div>
          {/* The wounds taken away from the live screen: a trap in the
              corridor, a night that went badly, a table that never opens
              the session view at all.

              The box starts empty with a 1 written faintly in it: the
              common press is a number typed over whatever was there, and a
              prefilled 1 is a digit to clear before the real one can be
              typed — on a phone, a fiddly one. Blank submits as 1 anyway
              (adjustCharacterHp reads a missing amount as one point), so
              the hint is the truth rather than a placeholder's promise. */}
          {editable && character.maxHp !== null && (
            <form
              action={adjustCharacterHp.bind(null, character.id)}
              className="flex items-center gap-1"
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
      {character.notes && (
        <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
          {character.notes}
        </p>
      )}

      {hasScores(character) ? (
        <StatBlockCard character={character} bonuses={wornBonuses} t={t} />
      ) : (
        editable && (
          <p className="mb-6 rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-parchment-500">
            {t("character.sheet.fillScoresHint")}
          </p>
        )
      )}

      {/* An all-empty doll is only worth drawing for someone who can fill it. */}
      {(editable || equipped.length > 0) && (
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
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4">
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

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>{t("character.sheet.spellsAbilities")}</SectionTitle>
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
                    <p className="min-w-0 flex-1 font-semibold text-parchment-100">
                      <AbilityName ability={ability} t={t} />
                    </p>
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
            <p className="font-semibold text-parchment-100">
              <ItemName item={item} t={t} locale={locale} />
              {item.qty > 1 && (
                <span className="ml-1.5 text-sm text-parchment-500">×{item.qty}</span>
              )}
              {item.equipped === 1 && (
                <span className="ml-1.5 rounded-sm border border-gold-500/60 bg-gold-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-300">
                  {t("character.equipment.worn")}
                </span>
              )}
            </p>
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
 * The inventory line's name, which is a link whenever the row remembers where
 * it came from: an SRD index opens the compendium entry, a library reference
 * jumps to the card in the world's own forge. A hand-typed line is just a
 * name, and stays plain text rather than pretending to lead somewhere.
 *
 * A roster line never carries the second of those: the library belongs to a
 * world, a roster sheet belongs to none, and the copy a table stamps drops the
 * reference on the way in. So the link disappears by itself here, with no flag
 * saying so — the row simply has nothing to point at.
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
  const linkClass = "text-parchment-100 underline decoration-ink-600 underline-offset-2 transition hover:text-gold-300 hover:decoration-gold-500";
  if (item.srdIndex) {
    const srd = getItem(item.srdIndex);
    /**
     * The row's name is the one that was written down — the English the whole
     * of this app resolves names against — and it stays that way in the
     * database. A locale with its own word for the thing gets to *say* that
     * word here, and only where we actually have one: an untranslated entry
     * keeps the player's own spelling rather than being tidied into the SRD's.
     */
    const shown = (locale === "tr" && itemNameTr(item.srdIndex)) || item.name;
    return (
      <Link
        href={`/compendium/items/${item.srdIndex}`}
        title={hoverText(
          item.notes?.trim() || (srd ? itemSummary(srd) : null),
          t("character.sheet.openInCompendium")
        )}
        className={linkClass}
      >
        {shown}
      </Link>
    );
  }
  if (item.worldItemId && item.sourceWorldId) {
    return (
      <Link
        href={`/w/${item.sourceWorldId}#wi-${item.worldItemId}`}
        title={hoverText(item.sourceDescription, t("character.sheet.openInLibrary"))}
        className={linkClass}
      >
        {item.name}
      </Link>
    );
  }
  return <>{item.name}</>;
}

/** Same rule for a spell line — the SRD is the only source one can name. */
function AbilityName({ ability, t }: { ability: CharacterAbility; t: T }) {
  if (!ability.srdIndex) return <>{ability.name}</>;
  const spell = getSpell(ability.srdIndex);
  return (
    <Link
      href={`/compendium/spells/${ability.srdIndex}`}
      title={hoverText(
        ability.notes?.trim() || (spell ? spellSummary(spell) : null),
        t("character.sheet.openInCompendium")
      )}
      className="text-parchment-100 underline decoration-ink-600 underline-offset-2 transition hover:text-gold-300 hover:decoration-gold-500"
    >
      {ability.name}
    </Link>
  );
}

/**
 * The touch of information the link itself can give, without going anywhere.
 *
 * A line that came from the compendium already carries its one-line summary in
 * its notes — that is what `itemSummary`/`spellSummary` wrote there when it was
 * added — so the note is read first and the summary regenerated only when
 * somebody has since typed over it or blanked it. A library piece answers with
 * the opening of its own description instead.
 *
 * The hint about where the link leads keeps its place on a second line: the
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


function StatBlockCard({
  character,
  bonuses,
  t,
}: {
  character: Character;
  bonuses: StatBonuses;
  t: T;
}) {
  const stats = statBlock(character, bonuses);
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.abilities.map((ability) => (
          <div
            key={ability.key}
            className={`rounded-md border bg-ink-950/60 px-2 py-2 text-center ${
              ability.bonus !== 0 ? "border-gold-500/50" : "border-ink-700"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
              {ability.label}
            </p>
            {/* The modifier is the number in play, so it is the one folded. */}
            <p className="font-display text-xl font-bold text-parchment-100">{fmt(ability.mod)}</p>
            <p className="text-[11px] text-parchment-500">
              {ability.score}
              {ability.bonus !== 0 && (
                <span className="ml-1 text-gold-300" title={t("character.equipment.bonusTitle")}>
                  {fmt(ability.bonus)}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="rounded-md border border-gold-500/60 bg-gold-500/10 px-2 py-0.5 font-bold text-gold-300">
          {t("character.sheet.passivePerception", { n: stats.passivePerception })}
        </span>
        <span className="text-parchment-500">
          {t("character.sheet.proficiency")}{" "}
          <strong className="text-parchment-100">{fmt(stats.profBonus)}</strong>
        </span>
        <span className="text-parchment-500">
          {t("character.sheet.saves")}{" "}
          {stats.saves.map((save, i) => (
            <span key={save.label}>
              {i > 0 && " · "}
              <span className={save.proficient ? "font-bold text-parchment-100" : ""}>
                {save.label} {fmt(save.bonus)}
              </span>
            </span>
          ))}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-ink-700 pt-3 sm:grid-cols-3">
        {stats.skills.map((skill) => (
          <p key={skill.name} className="flex justify-between text-sm">
            <span className={skill.proficient ? "font-bold text-parchment-100" : "text-parchment-300"}>
              {skill.proficient && <span className="mr-1 text-gold-400">●</span>}
              {skill.name}
            </span>
            <span className="font-mono text-parchment-100">{fmt(skill.bonus)}</span>
          </p>
        ))}
      </div>
    </Card>
  );
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
        <label className="block">
          <Label>{t("character.sheet.form.raceLabel")}</Label>
          <Input name="race" defaultValue={character?.race ?? ""} placeholder={t("character.sheet.form.racePh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.maxHp")}</Label>
          <Input name="maxHp" type="number" min={1} max={9999} defaultValue={character?.maxHp ?? ""} />
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
