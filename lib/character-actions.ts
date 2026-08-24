"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import {
  db,
  characters,
  characterItems,
  characterAbilities,
  characterSpellSlots,
  campaignMembers,
  worldItems,
  AC_DEX_RULES,
  WORLD_ITEM_STATS,
  type AcDexRule,
  type WorldItemSlot,
} from "@/lib/db";
import {
  MAX_SPELL_LEVEL,
  MIN_SPELL_LEVEL,
  suggestSlots,
  type SlotRow,
} from "@/lib/spell-slots";
import { CLASS_SLUGS, matchClass, type ClassSlug } from "@/lib/class-match";
import { averageHp, classInfo, CLASSES } from "@/lib/srd-classes";
import { raceBySlug } from "@/lib/srd-races";
import { SKILLS } from "@/lib/srd";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { campaignLog } from "@/lib/campaign-log";
import { logSheet, revalidateSheet, revalidateSheetOnly } from "@/lib/sheet-refresh";
import { fmt, mod } from "@/lib/dnd";
import { getT } from "@/lib/locale";
import { deletePortraitFile, putPortraitFile } from "@/lib/storage";
import {
  ABILITY_FLOOR_MAX,
  ABILITY_FLOOR_MIN,
  ABILITY_STATS,
  AC_BASE_MAX,
  AC_BASE_MIN,
  readSlotName,
  STAT_BONUS_MAX,
  STAT_BONUS_MIN,
  stringifyStatBonuses,
  type AbilityFloors,
  type StatBonuses,
} from "@/lib/world-items";
import type { FormState } from "@/lib/actions";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Postgres unique_violation — here, `character_items_one_per_slot`: someone
 * else's click filled the slot between this transaction's read and its write.
 * drizzle wraps driver errors, so the SQLSTATE may sit on the error or its cause.
 */
const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

function int(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

/**
 * The "custom" tick on the three add forms: "this is my own thing, do not go
 * looking it up". An unchecked box sends nothing at all, so a present value is
 * the whole signal — read the way `setMapGrid` reads its own checkbox.
 */
const isCustom = (formData: FormData) => str(formData, "custom") !== "";

/** How a typed name is compared to a stored one: whole, folded, trimmed. */
const foldName = (name: string) => name.trim().toLowerCase();

/** Clamp an optional number into range; a blank field stays blank. */
const clampOpt = (n: number | null, min: number, max: number) =>
  n === null ? null : Math.min(Math.max(n, min), max);

/**
 * "Belongs to this table", where a roster sheet's table is no table at all.
 * `eq(column, null)` is never true in SQL, so the NULL case has to be asked
 * differently — and it is asked here once instead of everywhere.
 */
const inCampaign = (campaignId: string | null) =>
  campaignId === null ? isNull(characters.campaignId) : eq(characters.campaignId, campaignId);

/**
 * A handle on the transaction the write is running in, for the helpers below
 * that are called from inside one. Read off `db.transaction` itself rather
 * than spelled out, so it follows the driver instead of drifting from it.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The rule every door into a campaign obeys, in one place.
 *
 * A player's first sheet at a table is live on arrival and names the party
 * list's shorthand; anything after it waits for the DM's nod and renames
 * nothing. That is one rule, and it had been written out three times — in the
 * quick-create, in the roster's sit-down, and in the sheet form — where the
 * third had already drifted into renaming the party list on *every* save, so
 * editing a pending second character relabelled the player in the party.
 *
 * `characterId` is the sheet being admitted, or null for one that does not
 * exist yet. Naming it excludes it from the count, which is what lets a save
 * to somebody's only sheet still carry its new name into the party list while
 * a save to their second one carries nothing.
 *
 * `approval` only answers for a sheet that is arriving; a save to an existing
 * one has already been approved (or is still waiting) and ignores it.
 */
async function admitCharacter(
  tx: Tx,
  campaignId: string,
  userId: string,
  name: string,
  characterId: string | null
): Promise<{ approval: "approved" | "pending"; first: boolean }> {
  const mine = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, userId)));
  const first = mine.every((row) => row.id === characterId);
  if (first) {
    await tx
      .update(campaignMembers)
      .set({ characterName: cap(name, 150) })
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  }
  return { approval: first ? "approved" : "pending", first };
}

/**
 * Owner of the sheet or the campaign's DM may edit it — and on the roster,
 * where no DM exists to overrule anyone, the owner alone.
 */
async function canEditSheet(
  campaignId: string | null,
  sheetUserId: string,
  actorId: string
) {
  if (campaignId === null) return sheetUserId === actorId;
  if (sheetUserId === actorId) {
    const access = await getCampaignAccess(campaignId, actorId);
    return access?.canParticipate ?? false;
  }
  const access = await getCampaignAccess(campaignId, actorId);
  return access?.isDm ?? false;
}

/**
 * Quick-create from /characters: pick a campaign, name the hero, land on the
 * full sheet to fill in the rest. The first character in a campaign is live
 * immediately; additional ones from the same user wait for the DM's approval.
 */
export async function createCharacter(formData: FormData) {
  const user = await requireUser();
  const campaignId = str(formData, "campaignId");
  const name = str(formData, "name");
  if (!campaignId || !name) return;
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canParticipate) return;

  const id = nanoid(12);
  // The sheet and the party list's shorthand name are one change.
  await db.transaction(async (tx) => {
    const { approval } = await admitCharacter(tx, campaignId, user.id, name, null);
    await tx.insert(characters).values({
      id,
      campaignId,
      userId: user.id,
      name: cap(name, 150),
      approval,
      updatedAt: Date.now(),
    });
  });
  await campaignLog(campaignId, user.id, "characterCreated", { name: cap(name, 150) });
  redirect(`/c/${campaignId}/ch/${user.id}?ch=${id}`);
}

/**
 * A character with no table yet.
 *
 * People are invented before they are cast: a player statting someone out on a
 * Tuesday evening should not have to name a campaign to do it, and a hero whose
 * table has ended should not have to be deleted along with it. So the roster is
 * a place a whole sheet can simply live — items, spells, portrait and all —
 * owned by its player rather than by anyone's campaign.
 *
 * Approved on arrival, because approval is a DM's word and there is no DM here.
 */
export async function createUnboundCharacter(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return;
  const id = nanoid(12);
  await db.insert(characters).values({
    id,
    campaignId: null,
    userId: user.id,
    name: cap(name, 150),
    approval: "approved",
    // Invented here, not stamped from anyone: this row *is* a master.
    originCharacterId: null,
    updatedAt: Date.now(),
  });
  // No feed line: the change log belongs to a campaign, and this character has
  // not walked into one.
  redirect(`/characters/${id}`);
}

/** The names the skill picker is allowed to send, as a set to sieve with. */
const SKILL_NAMES = new Set(SKILLS.map((skill) => skill.name));

/**
 * The character builder's one write: a whole hero, invented in a single form.
 *
 * `createCharacter` and `createUnboundCharacter` take a name and land the
 * player on an empty sheet to fill in by hand, which is fine for someone who
 * already knows what a saving throw proficiency is and merciless for someone
 * meeting the game this evening. This door asks the questions the book asks —
 * class, subclass, race, background, six scores, a handful of skills — and
 * then does the looking-up itself: the saves come off the class, the speed off
 * the race, the hit points off the die, the spell slots off the table.
 *
 * Every one of those is a *default*, written into ordinary columns the sheet
 * form may overwrite five minutes later. Nothing here is enforced afterwards,
 * because a rule the app enforces is a rule the table cannot break, and tables
 * break rules constantly and on purpose.
 *
 * `campaignId` decides which of two doors this is. Named, and the character
 * walks into a campaign under the same admission rule the other two doors
 * obey; blank, and it lands on the player's roster with no table and no DM to
 * wait for.
 */
export async function buildCharacter(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return;

  const campaignId = str(formData, "campaignId");
  if (campaignId) {
    const access = await getCampaignAccess(campaignId, user.id);
    // Silent, like every other refusal here — the id came off a form.
    if (!access?.canParticipate) return;
  }

  // The builder posts a slug; a player who typed over it posts whatever they
  // typed. Only an exact slug is translated into the book's display name —
  // reading "Fighter (Champion)" as the slug it contains would quietly throw
  // away the half the player cared about, and the class matchers downstream
  // are happy with either spelling anyway.
  const rawClass = str(formData, "klass");
  const slug = (CLASS_SLUGS as readonly string[]).includes(rawClass.toLowerCase())
    ? (rawClass.toLowerCase() as ClassSlug)
    : null;
  const klass = slug ? CLASSES[slug].name : cap(rawClass, 80);
  const info = classInfo(klass);

  // Same bargain for the race: a known slug brings its display name and its
  // walking speed with it, and anything else is carried exactly as written by
  // a player whose world has peoples this app has never heard of.
  const rawRace = str(formData, "race");
  const race = raceBySlug(rawRace);

  const level = Math.min(Math.max(int(formData, "level") ?? 1, 1), 20);
  // 3 to 20 is what a character *rolls or buys*; the sheet form's own 1–30
  // stays wider, because a curse or a wish can put a score outside this range
  // later and only creation is being narrowed here.
  const score = (key: string) => clampOpt(int(formData, key), 3, 20);
  const scores = {
    str: score("str"),
    dex: score("dex"),
    con: score("con"),
    intel: score("intel"),
    wis: score("wis"),
    cha: score("cha"),
  };

  // Only skills the compendium actually names: the checkbox list is forgeable,
  // and a proficiency in "Bribery" would render nowhere while still sitting in
  // the CSV forever.
  const skills = formData
    .getAll("skills")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => SKILL_NAMES.has(value));

  // Hit points are the one number a beginner cannot guess and a veteran will
  // not accept from us. Typed, it is theirs; left blank with a class and a
  // Constitution to work from, the book's average is a better first answer
  // than an empty box; blank with neither, it stays blank rather than becoming
  // a confident zero.
  const typedHp = clampOpt(int(formData, "maxHp"), 0, 9999);
  const maxHp =
    typedHp ??
    (info && scores.con !== null ? averageHp(info.hitDie, level, mod(scores.con)) : null);

  // A path is chosen at 3rd level, and the form says so by locking the section
  // until the level box agrees. That lock is a courtesy drawn in a browser,
  // though, and this is the same sentence said where it counts: a level 1
  // character posted with a subclass attached is written down without one.
  //
  // Only a class the book speaks for is held to it. A homebrew class's own
  // ruling about when its path arrives belongs to the table that invented it,
  // and there is nothing here to check it against anyway.
  const writtenSubclass = cap(str(formData, "subclass"), 80) || null;
  const subclass = info && level < info.subclassLevel ? null : writtenSubclass;

  const values = {
    name: cap(name, 150),
    klass: klass || null,
    subclass,
    race: race ? race.name : cap(rawRace, 80) || null,
    speed: race?.speed ?? null,
    background: cap(str(formData, "background"), 80) || null,
    alignment: cap(str(formData, "alignment"), 40) || null,
    level,
    maxHp,
    ...scores,
    profSkills: skills.join(",") || null,
    // The two the class is proficient in, spelled the way lib/dnd.ts reads
    // them back: a CSV of ability keys.
    profSaves: info ? info.saves.join(",") : null,
    updatedAt: Date.now(),
  };

  // What the book would deal this class and level. Null for a martial and for
  // a name the tables do not speak for, which writes no rows at all rather
  // than an empty tracker.
  const slots = suggestSlots(klass, level) ?? [];

  const id = nanoid(12);
  // Sheet and slots in one write, for the same reason the roster copy is one
  // write: a wizard who arrived without their slots is a sheet the player has
  // to repair by hand before they can play. writeSlotRows() is deliberately
  // not reused — it opens a transaction of its own, and this character is one
  // second old, so there is nothing of theirs to reconcile against.
  await db.transaction(async (tx) => {
    const admitted = campaignId
      ? await admitCharacter(tx, campaignId, user.id, values.name, null)
      : null;
    await tx.insert(characters).values({
      id,
      campaignId: campaignId || null,
      userId: user.id,
      ...values,
      // No DM on the roster means nobody to wait for.
      approval: admitted?.approval ?? "approved",
    });
    if (slots.length > 0) {
      await tx
        .insert(characterSpellSlots)
        .values(slots.map((row) => ({ characterId: id, level: row.level, total: row.total })));
    }
  });

  if (campaignId) {
    await campaignLog(campaignId, user.id, "characterCreated", { name: values.name });
    redirect(`/c/${campaignId}/ch/${user.id}?ch=${id}`);
  }
  // The roster sits in no campaign's history, so nothing is logged — exactly
  // as when a character is invented from the quick form.
  redirect(`/characters/${id}`);
}

/**
 * Take a roster character to a table — by copy, never by move.
 *
 * The alternative was to hand the campaign the master row itself, and it is
 * the wrong shape for what actually happens at tables: the same person is run
 * in two games at once, one of those games kills them and the other does not,
 * a DM hands out a sword that has no business existing in the other world.
 * A copy makes each of those the local fact it always was. `originCharacterId`
 * remembers where the copy came from and nothing more — the two sheets are
 * strangers from the moment the second exists.
 *
 * Three things deliberately do not travel:
 * - hit points, because a character arrives rested rather than mid-wound;
 * - the portrait, because it is a stored object rather than a column, and two
 *   rows naming one file would let either sheet's face be blanked by the
 *   other's removal (a copy starts faceless and the player uploads again);
 * - an inventory line's library reference, because a homebrew entry belongs to
 *   one world. The snapshot on the row — name, slot, bonuses, armour — is what
 *   the copy plays with, so the piece still works, it simply stops pointing at
 *   a library this table cannot see.
 *
 * Everything else travels by being copied wholesale rather than column by
 * column. A hand-written list is a list that silently stops being complete:
 * the next column added to a character would simply not reach the copy, and
 * nothing would say so. Spreading the master and overriding the four
 * exceptions makes the exceptions the only thing anyone has to read.
 *
 * The eight columns the official sheet layout brought in — subclass,
 * background, alignment, speed and the four personality lines — reached tables
 * without a word of this function changing, which is the promise being kept.
 */
export async function useCharacterInCampaign(characterId: string, campaignId: string) {
  const user = await requireUser();
  // Mine, and still on the roster: a sheet already at a table is not a master,
  // and someone else's is not mine to stamp. Silent, like every other refusal
  // here — the id is forgeable.
  const master = await db.query.characters.findFirst({
    where: and(
      eq(characters.id, characterId),
      eq(characters.userId, user.id),
      isNull(characters.campaignId)
    ),
  });
  if (!master) return;
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canParticipate) return;

  // A second press is the same press. `originCharacterId` is what makes that
  // answerable at all: without it, "have I already brought this one here?" has
  // no better answer than comparing names.
  const already = await findCopyInCampaign(master.id, campaignId);
  if (already) redirect(`/c/${campaignId}/ch/${user.id}?ch=${already.id}`);

  const id = nanoid(12);
  const now = Date.now();
  // Sheet, inventory, powers and slots are one write: a copy that arrived with
  // its gear but not its spells is a sheet nobody asked for, and there is no
  // half-copy the player could sensibly fix by hand.
  //
  // Two presses that arrive together both read an empty answer above and both
  // go on to write, which is what `characters_one_copy_per_campaign` is for:
  // the loser is thrown out with SQLSTATE 23505 rather than leaving the table
  // holding permanent twins. That refusal is not an error to the player — the
  // copy they asked for exists — so it is caught and read as the idempotent
  // case the first check already covers.
  let twinned = false;
  try {
    await db.transaction(async (tx) => {
      // The same rule the quick-create uses, from the same helper: the first
      // sheet a player brings to a table is live and names the party list, and
      // any extra waits for the DM's nod.
      const { approval } = await admitCharacter(tx, campaignId, user.id, master.name, null);

      await tx.insert(characters).values({
        ...master,
        id,
        campaignId,
        currentHp: null,
        imageFile: null,
        imageMime: null,
        originCharacterId: master.id,
        approval,
        updatedAt: now,
      });

      // One statement per ledger rather than one per row: a well-stocked
      // character is twenty-five round trips with the transaction held open,
      // and the copy is the one moment nobody is waiting on anything else.
      const items = await tx
        .select()
        .from(characterItems)
        .where(eq(characterItems.characterId, master.id));
      if (items.length > 0) {
        await tx.insert(characterItems).values(
          items.map((item) => ({
            ...item,
            id: nanoid(12),
            characterId: id,
            worldItemId: null,
            createdAt: now,
          }))
        );
      }

      const abilities = await tx
        .select()
        .from(characterAbilities)
        .where(eq(characterAbilities.characterId, master.id));
      if (abilities.length > 0) {
        await tx.insert(characterAbilities).values(
          abilities.map((ability) => ({
            ...ability,
            id: nanoid(12),
            characterId: id,
            // Rested, like the hit points: nothing the roster sheet spent is spent.
            usesLeft: ability.usesMax,
            createdAt: now,
          }))
        );
      }

      const slots = await tx
        .select()
        .from(characterSpellSlots)
        .where(eq(characterSpellSlots.characterId, master.id));
      if (slots.length > 0) {
        await tx
          .insert(characterSpellSlots)
          .values(slots.map((slot) => ({ ...slot, characterId: id, used: 0 })));
      }
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    twinned = true;
  }

  // redirect() works by throwing, so it waits until the catch is behind us —
  // inside the try it would read as a failed transaction and be swallowed.
  if (twinned) {
    const winner = await findCopyInCampaign(master.id, campaignId);
    if (winner) redirect(`/c/${campaignId}/ch/${user.id}?ch=${winner.id}`);
    return;
  }

  await campaignLog(campaignId, user.id, "characterCreated", { name: master.name });
  redirect(`/c/${campaignId}/ch/${user.id}?ch=${id}`);
}

/** The copy of one master already sitting at one table, if there is one. */
function findCopyInCampaign(masterId: string, campaignId: string) {
  return db.query.characters.findFirst({
    where: and(
      eq(characters.campaignId, campaignId),
      eq(characters.originCharacterId, masterId)
    ),
  });
}

/**
 * Strike a roster character out for good.
 *
 * Only from the roster, and only by the player who owns it: a sheet at a table
 * is the table's business — the DM's reject is the door out of a campaign, and
 * this one deliberately cannot reach it. What goes is the whole document, in
 * one write, because a sheet whose items outlived it is a set of orphan rows
 * nobody can see or clear.
 *
 * Copies already sitting at tables are untouched. They were strangers from the
 * moment they were stamped, and the master's disappearance is not news to
 * them: `origin_character_id` is ON DELETE SET NULL, so a copy simply stops
 * remembering where it came from and carries on being played.
 */
export async function deleteRosterCharacter(characterId: string) {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  // A missing sheet, somebody else's, and one that has since sat down at a
  // table all answer the same — the id is forgeable.
  if (!character || character.userId !== user.id || character.campaignId !== null) return;

  await db.transaction(async (tx) => {
    await tx.delete(characterItems).where(eq(characterItems.characterId, characterId));
    await tx.delete(characterAbilities).where(eq(characterAbilities.characterId, characterId));
    await tx.delete(characterSpellSlots).where(eq(characterSpellSlots.characterId, characterId));
    await tx.delete(characters).where(eq(characters.id, characterId));
  });

  // No feed line: the roster sits in no campaign's history, exactly as it did
  // when the character was invented.
  revalidatePath("/characters");
  // The page the press came from may be the sheet that no longer exists.
  redirect("/characters");
}

/** DM lets an extra character into the campaign. */
export async function approveCharacter(characterId: string) {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "pending") return;
  // Nobody approves a roster character: it answers to its player, not to a DM.
  if (!character.campaignId) return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(characters).set({ approval: "approved" }).where(eq(characters.id, characterId));
  await campaignLog(character.campaignId, user.id, "characterApproved", { name: character.name });
  revalidateSheet(character);
}

/** DM turns an extra character away — the sheet is removed entirely. */
export async function rejectCharacter(characterId: string) {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "pending") return;
  // A roster character is nobody's to turn away, and this action *deletes* —
  // so the guard is what keeps a DM's rejection from reaching a sheet that was
  // never at their table in the first place.
  if (!character.campaignId) return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  // All four deletes or none: a half-removed sheet leaves items, abilities and
  // spell slots referencing a character row that is gone — and the foreign
  // keys would refuse the last delete anyway.
  await db.transaction(async (tx) => {
    await tx.delete(characterItems).where(eq(characterItems.characterId, characterId));
    await tx.delete(characterAbilities).where(eq(characterAbilities.characterId, characterId));
    await tx
      .delete(characterSpellSlots)
      .where(eq(characterSpellSlots.characterId, characterId));
    await tx.delete(characters).where(eq(characters.id, characterId));
  });
  await campaignLog(character.campaignId, user.id, "characterRejected", { name: character.name });
  revalidateSheet(character);
}

/** Only the campaign's DM decides who is dead — the mark shows everywhere. */
export async function setCharacterStatus(characterId: string, status: "alive" | "dead") {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return;
  // Death is a ruling made at a table. A roster character is at none.
  if (!character.campaignId) return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(characters).set({ status }).where(eq(characters.id, characterId));
  await campaignLog(character.campaignId, user.id, "statusChanged", {
    character: character.name,
    status,
  });
  revalidateSheet(character);
}

/** The eight columns the official sheet layout added, as a save may set them. */
type SheetExtras = Partial<
  Pick<
    typeof characters.$inferInsert,
    "subclass" | "background" | "alignment" | "speed" | "traits" | "ideals" | "bonds" | "flaws"
  >
>;

/**
 * The rest of the printed sheet, read only from the fields a form actually
 * carries.
 *
 * The `has()` check is the whole point, and it is not the same question as
 * "is it blank". A form *carrying* an empty subclass box is a player saying
 * "no subclass", and it must clear the column; a form that never had the box
 * at all is saying nothing, and clearing the column on its word would delete
 * a Champion the moment somebody saved from an older screen — a stale tab, a
 * narrower editor, a mobile form that only ever showed four fields. `str()`
 * cannot tell those apart, because both hand it back an empty string.
 *
 * So absence is silence: a key that is not in the submission is not in the
 * returned object either, and drizzle's `set()` leaves the column exactly as
 * it found it. The same reading protects an item's ability floors a few
 * hundred lines below, and for the same reason.
 */
function readSheetExtras(formData: FormData): SheetExtras {
  const extras: SheetExtras = {};
  if (formData.has("subclass")) extras.subclass = cap(str(formData, "subclass"), 80) || null;
  if (formData.has("background")) extras.background = cap(str(formData, "background"), 80) || null;
  if (formData.has("alignment")) extras.alignment = cap(str(formData, "alignment"), 40) || null;
  // Nothing walks backwards and nothing outruns a teleport: 0–120 feet covers
  // every speed in the book with room for a homebrew boot to spare.
  if (formData.has("speed")) extras.speed = clampOpt(int(formData, "speed"), 0, 120);
  if (formData.has("traits")) extras.traits = cap(str(formData, "traits"), 2000) || null;
  if (formData.has("ideals")) extras.ideals = cap(str(formData, "ideals"), 2000) || null;
  if (formData.has("bonds")) extras.bonds = cap(str(formData, "bonds"), 2000) || null;
  if (formData.has("flaws")) extras.flaws = cap(str(formData, "flaws"), 2000) || null;
  return extras;
}

/**
 * The sheet form's save, for a sheet that exists and for one that does not.
 *
 * The nameless-target branch below — no `characterId`, so "the sheet this
 * user has here" — is a *campaign* affordance and nothing else. On the roster
 * a player may keep any number of characters, and "the one they have" is not a
 * question with an answer: the lookup would return whichever row came back
 * first and the save would land on top of a character nobody was editing.
 * Creating on the roster has its own door (`createUnboundCharacter`), so a
 * roster save that names no sheet is simply not a request this can serve.
 */
export async function upsertCharacter(
  campaignId: string | null,
  sheetUserId: string,
  formData: FormData
) {
  const user = await requireUser();
  if (!(await canEditSheet(campaignId, sheetUserId, user.id))) return;

  const name = str(formData, "name");
  if (!name) return;
  const characterId = str(formData, "characterId");
  if (campaignId === null && !characterId) return;
  const score = (key: string) => {
    const n = int(formData, key);
    return n === null ? null : Math.min(Math.max(n, 1), 30);
  };
  const checkboxList = (key: string) =>
    formData
      .getAll(key)
      .filter((v): v is string => typeof v === "string")
      .join(",") || null;
  const values = {
    name: cap(name, 150),
    klass: cap(str(formData, "klass"), 80) || null,
    race: cap(str(formData, "race"), 80) || null,
    ...readSheetExtras(formData),
    level: Math.min(Math.max(int(formData, "level") ?? 1, 1), 30),
    maxHp: clampOpt(int(formData, "maxHp"), 0, 9999),
    armorClass: clampOpt(int(formData, "armorClass"), 0, 40),
    str: score("str"),
    dex: score("dex"),
    con: score("con"),
    intel: score("intel"),
    wis: score("wis"),
    cha: score("cha"),
    profSkills: checkboxList("profSkills"),
    profSaves: checkboxList("profSaves"),
    notes: cap(str(formData, "notes"), 20_000) || null,
    updatedAt: Date.now(),
  };

  // With multiple characters per user, the edit form names its target; the
  // create flow (no characterId) only exists while the user has no sheet.
  const existing = characterId
    ? await db.query.characters.findFirst({
        where: and(
          eq(characters.id, characterId),
          inCampaign(campaignId),
          eq(characters.userId, sheetUserId)
        ),
      })
    : await db.query.characters.findFirst({
        where: and(inCampaign(campaignId), eq(characters.userId, sheetUserId)),
      });
  // characterId comes from the form and is forgeable: when it names a sheet
  // outside this campaign/user the scoped lookup finds nothing, and the
  // request is refused rather than quietly creating a fresh sheet.
  if (characterId && !existing) return;

  const id = existing?.id ?? nanoid(12);
  // The sheet and the party list's shorthand name move together — under the
  // same rule the other two doors into a campaign obey. A save is not
  // automatically a renaming of the player in the party list: only the sheet
  // that list is already named after gets to carry a new name into it, which
  // is why the row being saved is excluded from the count rather than the
  // count simply being asked for zero.
  await db.transaction(async (tx) => {
    // No approval to grant and no party list to rename on the roster: there is
    // no DM and there is no party.
    const admitted =
      campaignId === null
        ? null
        : await admitCharacter(tx, campaignId, sheetUserId, values.name, existing?.id ?? null);
    if (existing) {
      await tx.update(characters).set(values).where(eq(characters.id, existing.id));
    } else {
      await tx.insert(characters).values({
        id,
        campaignId,
        userId: sheetUserId,
        ...values,
        approval: admitted?.approval ?? "approved",
      });
    }
  });
  // A save on someone else's sheet is a DM write — the feed says so out loud.
  const byDm = sheetUserId !== user.id;
  await logSheet(
    { id, campaignId, userId: sheetUserId },
    user.id,
    byDm ? "sheetSavedByDm" : "sheetSaved",
    { character: values.name, dm: byDm ? 1 : 0 }
  );
  revalidateSheet({ id, campaignId, userId: sheetUserId });
}

async function getEditableCharacter(characterId: string, actorId: string) {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return null;
  if (!(await canEditSheet(character.campaignId, character.userId, actorId))) return null;
  return character;
}

// ---------- portrait ----------

const PORTRAIT_MAX_BYTES = 4 * 1024 * 1024;
const PORTRAIT_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Owner or DM uploads a face for the character. The stored name is a one-shot
 * nanoid, so /files/portraits can serve it immutable; the previous file is
 * dropped only once the new one is safely stored.
 */
export async function uploadPortrait(
  characterId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const character = await getEditableCharacter(characterId, user.id);
  // A missing sheet and a forbidden one answer the same — the id is forgeable.
  if (!character) return { error: t("errors.portrait.notAllowed") };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("errors.portrait.noFile") };
  if (file.size > PORTRAIT_MAX_BYTES) return { error: t("errors.portrait.tooLarge") };
  const ext = PORTRAIT_EXT_BY_MIME[file.type];
  if (!ext) return { error: t("errors.portrait.badType") };

  const fileName = `${nanoid(16)}.${ext}`;
  await putPortraitFile(fileName, new Uint8Array(await file.arrayBuffer()), file.type);
  try {
    await db
      .update(characters)
      .set({ imageFile: fileName, imageMime: file.type })
      .where(eq(characters.id, characterId));
  } catch (e) {
    // Storage cannot join the transaction: with no row naming it, the freshly
    // uploaded object is unreachable, so drop it and report the real error.
    await deletePortraitFile(fileName).catch((err) =>
      console.error("uploadPortrait: orphan cleanup failed", err)
    );
    throw e;
  }
  if (character.imageFile) {
    await deletePortraitFile(character.imageFile).catch((e) =>
      console.error("uploadPortrait: old file delete failed", e)
    );
  }
  await logSheet(character, user.id, "portraitChanged", { character: character.name });
  revalidateSheet(character);
  return {};
}

export async function removePortrait(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character?.imageFile) return;
  await db
    .update(characters)
    .set({ imageFile: null, imageMime: null })
    .where(eq(characters.id, characterId));
  // Row first: a leftover object is cheaper than a sheet naming a missing file.
  await deletePortraitFile(character.imageFile).catch((e) =>
    console.error("removePortrait: file delete failed", e)
  );
  await logSheet(character, user.id, "portraitRemoved", { character: character.name });
  revalidateSheet(character);
}

// ---------- inventory ----------

/** One of the three DEX rules, or nothing — which lib/armor.ts reads as "none". */
function readAcDex(formData: FormData): AcDexRule | null {
  const raw = str(formData, "acDex");
  return (AC_DEX_RULES as readonly string[]).includes(raw) ? (raw as AcDexRule) : null;
}

/**
 * The six floor fields off the line editor: the scores this copy of the thing
 * *sets* rather than adds to. A blank states nothing; a number outside 5e's
 * 1–30 is clamped to the nearest score a creature could actually have, which
 * is how the reader in lib/world-items.ts treats a stored one.
 */
function readItemFloors(formData: FormData): AbilityFloors {
  const floors: AbilityFloors = {};
  for (const stat of ABILITY_STATS) {
    const raw = str(formData, `floor_${stat}`);
    if (!raw) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) continue;
    floors[stat] = Math.min(Math.max(n, ABILITY_FLOOR_MIN), ABILITY_FLOOR_MAX);
  }
  return floors;
}

/**
 * The bonus and floor fields off the line editor, rebuilt the way the library
 * form rebuilds its own: only the allowed keys, each clamped, blanks and
 * zeroes left out, and a form that states nothing at all storing NULL rather
 * than `{}` — so a line the player cleared is a plain item again, not an item
 * granting nothing.
 *
 * The floors used to survive this rebuild untouched, because the editor had
 * eight number fields and no ninth for them: a submission was *silent* about
 * floors rather than saying they were gone, and reading that silence as a
 * deletion would have turned an amulet of health into a necklace the first
 * time somebody typed an armour class onto its line.
 *
 * The editor states them now, six fields filled in from what the line already
 * carries — so the form is no longer silent, and a field cleared by hand is a
 * player saying "this thing does not set that score", which is a sentence they
 * are entitled to say. The cost of the new field is the old safety: leaving
 * one blank deletes it. That is the deal every other field on this form has
 * always offered.
 */
function readItemBonuses(formData: FormData): string | null {
  const bonuses: StatBonuses = {};
  for (const stat of WORLD_ITEM_STATS) {
    const raw = str(formData, `bonus_${stat}`);
    if (!raw) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) continue;
    bonuses[stat] = Math.min(Math.max(n, STAT_BONUS_MIN), STAT_BONUS_MAX);
  }
  return stringifyStatBonuses(bonuses, readItemFloors(formData));
}

/**
 * What an inventory line is, beyond its name: the source it was picked from
 * (if any), where it can be worn, and what it grants. The autocomplete on the
 * sheet sends a reference, never the numbers — the slot and the bonuses are
 * re-derived here from the library row or the SRD entry the reference names,
 * so a forged field buys nothing a player could not already type into the
 * sheet form by hand.
 *
 * A reference is no longer required for a line to know what it is, though:
 * when none arrives the name is resolved here instead (see below), which is
 * what makes the phone-shaped ways of losing the hidden field harmless.
 */
type ItemSource = {
  worldItemId: string | null;
  srdIndex: string | null;
  slot: WorldItemSlot | null;
  statBonuses: string | null;
  /** Only used when the add form left the notes blank. */
  summary: string | null;
};

async function resolveItemSource(
  formData: FormData,
  campaignId: string | null,
  actorId: string
): Promise<ItemSource> {
  const blank: ItemSource = {
    worldItemId: null,
    srdIndex: null,
    slot: readSlotName(str(formData, "slot")),
    statBonuses: null,
    summary: null,
  };

  // "Custom — start blank" is taken at its word, and taken first: whatever the
  // form is carrying, a player who ticked it is asking for a line of their own
  // with no source behind it. Everything below is the lookup they declined.
  if (isCustom(formData)) return blank;

  // A roster sheet plays in no world, so there is no library standing behind
  // it and nobody to ask for access: every lookup below that reaches for one
  // is skipped for a character with no campaign, and the compendium answers
  // alone. An SRD entry is the same entry at every table, which is exactly why
  // it can be stocked onto a character that has none.
  const worldItemId = str(formData, "worldItemId");
  // A library entry wins: it is the only source that carries real bonuses.
  if (campaignId !== null && worldItemId) {
    const [access, item] = await Promise.all([
      getCampaignAccess(campaignId, actorId),
      db.query.worldItems.findFirst({ where: eq(worldItems.id, worldItemId) }),
    ]);
    // The id is forgeable, and a library belongs to exactly one world: a table
    // running elsewhere cannot draw from it however the ids were paired up.
    // A DM-only entry is invisible to a player here too — the suggestion list
    // never offered it, so a line naming it is a forged one and reads as free
    // text instead of carrying the hidden piece's slot and bonuses across.
    if (
      access &&
      item &&
      item.worldId === access.world.id &&
      (item.visibility === "everyone" || access.isDm)
    ) {
      return {
        worldItemId: item.id,
        srdIndex: null,
        slot: item.slot,
        statBonuses: item.statBonuses,
        summary: item.description,
      };
    }
    return blank;
  }

  const srdIndex = str(formData, "srdIndex");
  if (srdIndex) {
    // Lazy import keeps the SRD JSON out of the sheet's chunk. The SRD keeps
    // its mechanics in prose, so what an entry grants is whatever the curated
    // table read out of that prose (srdItemBonuses) — snapshotted onto the
    // line, exactly as a library entry's bonuses are.
    const { getItem, itemSummary, srdItemSlot, srdItemBonuses } = await import(
      "@/lib/srd-data"
    );
    const item = getItem(srdIndex);
    if (item) {
      return {
        worldItemId: null,
        srdIndex: item.index,
        slot: srdItemSlot(item),
        statBonuses: srdItemBonuses(item),
        summary: itemSummary(item),
      };
    }
    return blank;
  }

  // No reference at all — which is the *ordinary* case at the table, not an
  // exotic one: a tap that lands as the suggestion list closes under the
  // finger, or an Enter that submits the form instead of picking a row, sends
  // the name and nothing else. The name is therefore asked last, and asked the
  // same way the suggestion list would have been read: this world's library
  // first (only the part this reader may see), the SRD behind it, whole-name
  // matches only. Typing "Leather Armor" by hand and picking it off the list
  // land the same row, which is the point.
  const name = foldName(str(formData, "name"));
  if (!name) return blank;

  if (campaignId !== null) {
    const access = await getCampaignAccess(campaignId, actorId);
    if (!access) return blank;
    // A DM-only entry is no more reachable by name than it was by id: the party
    // has not met it yet, and typing it exactly is not the same as being shown it.
    const visible = access.isDm ? [] : [eq(worldItems.visibility, "everyone")];
    const [libraryItem] = await db
      .select()
      .from(worldItems)
      .where(
        and(
          eq(worldItems.worldId, access.world.id),
          ...visible,
          sql`lower(btrim(${worldItems.name})) = ${name}`
        )
      )
      // Two entries may share a name; the oldest one is the answer, always.
      .orderBy(asc(worldItems.createdAt), asc(worldItems.id))
      .limit(1);
    if (libraryItem) {
      return {
        worldItemId: libraryItem.id,
        srdIndex: null,
        slot: libraryItem.slot,
        statBonuses: libraryItem.statBonuses,
        summary: libraryItem.description,
      };
    }
  }

  // Either language reaches the entry: a table that plays in Turkish types
  // "Hançer" as readily as "Dagger", and both are whole names for one item.
  const { findItemByAnyName, itemSummary, srdItemSlot, srdItemBonuses } = await import(
    "@/lib/srd-data"
  );
  const srdItem = findItemByAnyName(str(formData, "name"));
  if (srdItem) {
    return {
      worldItemId: null,
      srdIndex: srdItem.index,
      slot: srdItemSlot(srdItem),
      statBonuses: srdItemBonuses(srdItem),
      summary: itemSummary(srdItem),
    };
  }
  return blank;
}

/**
 * The write both "stock a line" paths make. Whether the sheet's own player
 * typed it or the DM handed it over, an inventory line is resolved the same
 * way and stored in the same shape — only the gate in front of it and the
 * feed line behind it differ, and those belong to the callers.
 *
 * Returns what was written so the caller can name it in the log, or null when
 * the form carried no name at all (nothing is written then).
 */
async function stockItem(
  character: { id: string; campaignId: string | null },
  formData: FormData,
  actorId: string,
  maxQty: number
): Promise<{ id: string; name: string; qty: number } | null> {
  const name = str(formData, "name");
  if (!name) return null;
  const itemName = cap(name, 150);
  const qty = Math.min(Math.max(int(formData, "qty") ?? 1, 1), maxQty);
  const source = await resolveItemSource(formData, character.campaignId, actorId);
  const id = nanoid(12);
  await db.insert(characterItems).values({
    id,
    characterId: character.id,
    name: itemName,
    qty,
    // A line the player annotated keeps their words; one they left blank
    // borrows the source's own summary rather than showing nothing.
    notes: cap(str(formData, "notes"), 2_000) || cap(source.summary ?? "", 2_000) || null,
    worldItemId: source.worldItemId,
    srdIndex: source.srdIndex,
    slot: source.slot,
    statBonuses: source.statBonuses,
    createdAt: Date.now(),
  });
  return { id, name: itemName, qty };
}

export async function addItem(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const stocked = await stockItem(character, formData, user.id, 9999);
  if (!stocked) return;
  await logSheet(character, user.id, "itemAdded", {
    name: stocked.name,
    n: stocked.qty,
    character: character.name,
  });
  revalidateSheet(character);
}

/**
 * The other direction: the DM hands something over from the campaign page,
 * without opening the sheet it lands on.
 *
 * The campaign is the capability here, not the character — the id in the form
 * is checked against it rather than trusted, so a DM can only reach the sheets
 * at the table they actually run, and only the ones they have already
 * approved: a character still waiting on its nod is not yet a place to put
 * treasure. The reference the autocomplete attaches is resolved exactly as it
 * is on the sheet, which is what keeps a handed-over sword the same kind of
 * row as a typed one.
 *
 * Every one of those refusals used to be a bare `return`, which a DM standing
 * at a table read as "it worked": the form posted, the page came back, and the
 * player's sheet was unchanged. They now come back as sentences. So does the
 * success — `given` is what the form prints over itself, because a hand-over
 * lands on somebody else's page and the giver never sees it otherwise.
 */
/**
 * `given` names the sheet it landed on as well as the thing that landed,
 * because the form outlives the hand-over: the DM picks the next player from
 * the same select, and a receipt that stayed put while the target changed read
 * as a claim about the player now selected. Naming the character is what lets
 * the form print the line only where it is still true — no effect, no second
 * copy of the answer, just a comparison.
 *
 * `id` is the inventory line itself, and it is here to be a *different string*
 * every time. Handing the same player a second rope produces a word-for-word
 * identical receipt, and the field below the receipt is cleared by remounting
 * on it; without an identity, twice in a row would be indistinguishable from
 * once and the second hand-over would keep the first one's hidden reference.
 */
export type GiveItemState = FormState & {
  given?: { id: string; name: string; qty: number; character: string; characterId: string };
};

export async function giveItem(
  campaignId: string,
  _prev: GiveItemState,
  formData: FormData
): Promise<GiveItemState> {
  const user = await requireUser();
  const { t } = await getT();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return { error: t("errors.items.dmOnlyGive") };

  const characterId = str(formData, "characterId");
  if (!characterId) return { error: t("errors.items.notAtTable") };
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  // A missing sheet and one at another table answer the same — the id is
  // forgeable, and a DM has no business learning that it names anything.
  if (!character || character.campaignId !== campaignId) {
    return { error: t("errors.items.notAtTable") };
  }
  if (character.approval !== "approved") return { error: t("errors.items.notApproved") };

  const stocked = await stockItem(character, formData, user.id, 999);
  if (!stocked) return { error: t("errors.items.nameRequired") };
  await campaignLog(campaignId, user.id, "itemGiven", {
    name: stocked.name,
    n: stocked.qty,
    character: character.name,
  });
  // The sheet gained a line, and the campaign page's own party numbers read
  // from the same rows — one helper already covers both.
  revalidateSheet(character);
  return {
    given: {
      id: stocked.id,
      name: stocked.name,
      qty: stocked.qty,
      character: character.name,
      characterId: character.id,
    },
  };
}

/**
 * Put a piece on.
 *
 * Where it goes is decided by whatever knows best. A line that came from the
 * compendium or the library is placed by its source: a breastplate is body
 * armour, a shield is held, a sword is swung, and no slot the form names can
 * move them — a request that asks otherwise is refused outright rather than
 * quietly corrected, the same silent refusal every other bad input to this
 * action gets. Only a hand-typed line, which no source ever spoke for, takes
 * the slot from the form: "Grandfather's Signet" is a ring because someone
 * said so, and it could as easily have been an amulet.
 *
 * The source also outranks the row's own stored slot, which heals lines
 * stocked before this rule existed (and the ones a backfill has since given a
 * reference to) the first time they are worn.
 *
 * Both halves are one write: whatever occupied the slot comes off in the same
 * transaction the new piece goes on in, so the sheet is never briefly wearing
 * two helms, and never briefly wearing none. `character_items_one_per_slot`
 * backs that up for two clicks that arrive at once — the loser gets SQLSTATE
 * 23505 and is dropped, because the slot did end up filled either way.
 *
 * The refusals speak now. A dropped 23505 is still the right *write* — the
 * slot ended up filled — but it is the wrong *answer*: the player pressed
 * equip and something else is on the square, and being told so is the
 * difference between a race and a bug. The drag-and-drop path throws the
 * answer away (a drop has nowhere to print one); the buttons show it.
 *
 * The `(…ids, _prev, formData)` shape is this codebase's signature for an
 * action a form can both post to and read an answer from, and it is not
 * decoration: React only writes a POST target into the form's markup when the
 * action handed to `useActionState` is a server function *reference*, so the
 * button works before hydration and with scripting off only while the binding
 * happens through `.bind` rather than through a closure in the component.
 */
export async function equipItem(
  itemId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  // A missing line and an unreachable one answer the same — the id is forgeable.
  if (!item) return { error: t("errors.items.notAllowed") };
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return { error: t("errors.items.notAllowed") };

  // Lazy import keeps the SRD JSON out of the sheet's chunk, as everywhere
  // else this module reaches for it.
  const { requiredSlot } = await import("@/lib/srd-data");
  const source = item.worldItemId
    ? await db.query.worldItems.findFirst({ where: eq(worldItems.id, item.worldItemId) })
    : null;
  const required = requiredSlot(item.srdIndex, source);
  const asked = readSlotName(str(formData, "slot"));
  if (required && asked && asked !== required) return { error: t("errors.items.slotMismatch") };

  const slot = required ?? item.slot ?? asked;
  if (!slot) return { error: t("errors.items.slotUnknown") };
  // Already on, already there: nothing to do and nothing to complain about.
  if (item.equipped === 1 && item.slot === slot) return {};

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(characterItems)
        .set({ equipped: 0 })
        .where(
          and(
            eq(characterItems.characterId, item.characterId),
            eq(characterItems.slot, slot),
            eq(characterItems.equipped, 1)
          )
        );
      await tx
        .update(characterItems)
        .set({ slot, equipped: 1 })
        .where(eq(characterItems.id, itemId));
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: t("errors.items.slotTaken") };
    throw e;
  }
  await logSheet(character, user.id, "itemEquipped", {
    name: item.name,
    character: character.name,
  });
  revalidateSheet(character);
  return {};
}

/** Take it off. The slot stays on the row — it is still a helm, just not worn. */
export async function unequipItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item || item.equipped === 0) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  await db.update(characterItems).set({ equipped: 0 }).where(eq(characterItems.id, itemId));
  await logSheet(character, user.id, "itemUnequipped", {
    name: item.name,
    character: character.name,
  });
  revalidateSheet(character);
}

/**
 * The numbers on one line, typed by the player.
 *
 * The compendium answers for ordinary gear and the library answers for
 * homebrew, but neither answers for SRD magic armour: "Adamantine Armor" keeps
 * its whole mechanic in prose, carries no armour class a parser can read, and
 * wearing it therefore moved nothing at all. This is the escape hatch every
 * inventory-driven RPG has — the player states what the piece does, and the
 * sheet believes them.
 *
 * Everything is rebuilt from scratch rather than trusted: the slot is checked
 * against the eight names (and loses outright to the one the line's source
 * insists on — a breastplate is body armour however the select was tampered
 * with), the base is clamped to 0..30, the DEX rule must be one of the three,
 * and the eight bonuses go through the same ±10 clamp the library form uses.
 * The six floors are read the same way, clamped to 1..30. A form with every
 * number blank stores NULL, not `{}`.
 *
 * The floors are a *behaviour change*, not just a new field: the form used to
 * say nothing about them and the action used to carry the stored ones through
 * untouched. Now the form states them — filled in from the line — so clearing
 * one is a deletion the player meant. See readItemBonuses for the whole
 * argument.
 *
 * Moving a worn piece to a different square takes it off on the way: the row
 * cannot sit in `ring` while the sheet still counts it as the worn helm, and
 * one UPDATE carries both halves, so `character_items_one_per_slot` never sees
 * the row in between.
 *
 * The two gates answer out loud rather than returning nothing. The clamps
 * below stay silent on purpose: they are how the form is *specified* to read a
 * number, not a refusal to read it, and the inputs already carry the same
 * min/max the server enforces.
 *
 * `_prev` is the same `.bind`-able shape equipItem carries, and for the same
 * reason: it is what keeps this form posting without hydration.
 */
export async function setItemStats(
  itemId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  // A missing line and an unreachable one answer the same — the id is forgeable.
  if (!item) return { error: t("errors.items.notAllowed") };
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return { error: t("errors.items.notAllowed") };

  // Lazy import keeps the SRD JSON out of the sheet's chunk, as everywhere
  // else this module reaches for it.
  const { requiredSlot } = await import("@/lib/srd-data");
  const source = item.worldItemId
    ? await db.query.worldItems.findFirst({ where: eq(worldItems.id, item.worldItemId) })
    : null;
  // The source has the last word, exactly as equipItem decides it — the form's
  // select is read-only in that case, and a forged one is simply overruled.
  const required = requiredSlot(item.srdIndex, source);
  const slot = required ?? readSlotName(str(formData, "slot"));

  await db
    .update(characterItems)
    .set({
      slot,
      // Worn stays worn only while the square does not change; anywhere else
      // the piece comes off first and the player puts it back on.
      equipped: item.equipped === 1 && slot === item.slot ? 1 : 0,
      acBase: clampOpt(int(formData, "acBase"), AC_BASE_MIN, AC_BASE_MAX),
      acDex: readAcDex(formData),
      statBonuses: readItemBonuses(formData),
    })
    .where(eq(characterItems.id, itemId));

  // The party list and the character hub both show a computed armour class
  // now, so a line that changes one changes them too.
  revalidateSheet(character);
  return {};
}

export async function adjustItemQty(itemId: string, delta: number) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;

  // The pile is counted in the database, so two hands reaching for it at once
  // both count. The new total decides whether the row survives, and the
  // decrement and the delete are one write.
  const qty = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(characterItems)
      .set({ qty: sql`LEAST(9999, ${characterItems.qty} + ${delta})` })
      .where(eq(characterItems.id, itemId))
      .returning({ qty: characterItems.qty });
    if (!row) return null;
    // The last one off the pile is a removal, not a quantity tweak.
    if (row.qty <= 0) await tx.delete(characterItems).where(eq(characterItems.id, itemId));
    return row.qty;
  });
  if (qty === null) return;

  await logSheet(
    character,
    user.id,
    qty <= 0 ? "itemRemoved" : "itemQty",
    qty <= 0
      ? { name: item.name, character: character.name }
      : { name: item.name, d: fmt(delta), n: qty, character: character.name }
  );
  // A pile counted up or down is a number on this page and nowhere else — the
  // hub and the party list read an armour class, not an inventory. Counting the
  // last one away is different: the row goes with it, and if it was worn armour
  // the numbers those two pages do read have just changed.
  if (qty <= 0) revalidateSheet(character);
  else revalidateSheetOnly(character);
}

export async function deleteItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  await db.delete(characterItems).where(eq(characterItems.id, itemId));
  await logSheet(character, user.id, "itemRemoved", {
    name: item.name,
    character: character.name,
  });
  revalidateSheet(character);
}

// ---------- spells & abilities ----------

export async function addAbility(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const name = str(formData, "name");
  if (!name) return;
  const kindRaw = str(formData, "kind");
  let kind: "spell" | "ability" | "trait" =
    kindRaw === "spell" || kindRaw === "trait" ? kindRaw : "ability";
  const usesMax = int(formData, "usesMax");
  const abilityName = cap(name, 150);

  // A line picked from the compendium keeps the index, so the sheet can link
  // back to the full text instead of reprinting it. There is no homebrew spell
  // library to reference — the SRD is the only source a spell can name.
  //
  // The picked reference answers first; when none arrived — the tap the
  // closing list swallowed, the Enter that submitted the form — the name
  // itself is asked, matched whole against the spell list. Someone who types
  // "fireball" into this box means Fireball, and gets the link and the summary
  // a picked one gets. The "custom" tick is the way out for a homebrew power
  // that happens to share a name with the book's, and — as on the inventory
  // form — it is taken at its word before anything else is asked.
  let srdIndex: string | null = null;
  let summary: string | null = null;
  const pickedIndex = str(formData, "srdIndex");
  if (!isCustom(formData)) {
    const { getSpell, spellSummary, SPELLS } = await import("@/lib/srd-data");
    const needle = foldName(name);
    const spell = pickedIndex
      ? getSpell(pickedIndex)
      : SPELLS.find((entry) => foldName(entry.name) === needle);
    if (spell) {
      srdIndex = spell.index;
      summary = spellSummary(spell);
      // Whatever the dropdown said, a spell from the spell list is a spell.
      kind = "spell";
    }
  }

  await db.insert(characterAbilities).values({
    id: nanoid(12),
    characterId,
    name: abilityName,
    kind,
    notes: cap(str(formData, "notes"), 2_000) || cap(summary ?? "", 2_000) || null,
    usesMax,
    usesLeft: usesMax,
    srdIndex,
    createdAt: Date.now(),
  });
  await logSheet(character, user.id, "abilityAdded", {
    name: abilityName,
    character: character.name,
  });
  revalidateSheet(character);
}

/** Spend one use (e.g. cast a spell slot); floor at zero. */
export async function useAbility(abilityId: string) {
  const user = await requireUser();
  const ability = await db.query.characterAbilities.findFirst({
    where: eq(characterAbilities.id, abilityId),
  });
  if (!ability || ability.usesLeft === null) return;
  const character = await getEditableCharacter(ability.characterId, user.id);
  if (!character) return;
  // Counted down in place: two casts in the same instant spend two slots.
  // The IS NOT NULL guard keeps an unlimited ability from being given a
  // count by a spend that raced the read above.
  await db
    .update(characterAbilities)
    .set({ usesLeft: sql`GREATEST(0, ${characterAbilities.usesLeft} - 1)` })
    .where(
      and(eq(characterAbilities.id, abilityId), isNotNull(characterAbilities.usesLeft))
    );
  // Spent uses are read on the sheet alone; nothing else in the app counts them.
  revalidateSheetOnly(character);
}

// ---------- hit points ----------

/**
 * The ceiling for a sheet that has never been given a maximum: the same
 * 0..9999 range the max HP field itself accepts, so a number typed here can
 * never be one the sheet form would refuse.
 */
const HP_CEILING = 9999;

/**
 * Damage and healing from the sheet itself, for the wounds that are taken
 * between sessions (a trap in the corridor, a night that went badly) and for
 * the table that tracks HP without opening the live screen at all.
 *
 * Owner or DM, like every other write on this sheet. The arithmetic runs
 * inside the UPDATE so two clicks in the same instant both count: the base is
 * the stored value, or the sheet's maximum for a character nobody has damaged
 * yet (`current_hp` NULL), or zero for a sheet that has no maximum either.
 *
 * Deliberately *not* wired to a combatant: during a live session the row on
 * the initiative list is the table's working copy, and the one place the
 * number is being argued over should stay the one place it is edited. A change
 * made here mid-combat is harmless — both writes are atomic — it simply does
 * not travel to the live screen until the character joins initiative again.
 */
export async function adjustCharacterHp(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;

  // An empty box is one point. The sheet's form leaves the field blank with a
  // faint 1 written in it — the press that matters is a number typed over
  // whatever was there, and a prefilled digit is one more thing to clear first
  // — so the blank submission has to mean what the hint promises rather than
  // silently doing nothing. A negative number is still refused: that is a form
  // arguing with the two buttons beside it.
  const typed = int(formData, "amount");
  if (typed !== null && typed < 0) return;
  const amount = typed ?? 1;
  const delta = str(formData, "op") === "heal" ? amount : -amount;

  const base = sql`COALESCE(${characters.currentHp}, ${characters.maxHp}, 0)`;
  await db
    .update(characters)
    .set({
      currentHp: sql`GREATEST(0, LEAST(COALESCE(${characters.maxHp}, ${HP_CEILING}), ${base} + ${delta}))`,
    })
    .where(eq(characters.id, characterId));

  // No feed entry: the session log already narrates the blows that land at the
  // table, and a line per point of healing is noise the DM did not ask for.
  revalidateSheet(character);
}

/**
 * Long rest: refill all limited-use abilities, every spent spell slot, and the
 * character's hit points.
 */
export async function longRest(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  // One statement refills every limited-use ability on the sheet, a second
  // unseals every spell slot, and the two are one write: a rest that restored
  // the abilities but not the slots is not a rest anyone would recognise.
  // The rows the first statement touched are the ones the feed counts — the
  // slots ride along inside the same "long rest" entry rather than adding a
  // second line to the feed for the same click.
  const refilled = await db.transaction(async (tx) => {
    const rows = await tx
      .update(characterAbilities)
      .set({ usesLeft: sql`${characterAbilities.usesMax}` })
      .where(
        and(
          eq(characterAbilities.characterId, characterId),
          isNotNull(characterAbilities.usesMax)
        )
      )
      .returning({ id: characterAbilities.id });
    await tx
      .update(characterSpellSlots)
      .set({ used: 0 })
      .where(eq(characterSpellSlots.characterId, characterId));
    // A night's sleep is also what puts the hit points back. A sheet with no
    // maximum lands on NULL, which is the same "untouched" it started from.
    await tx
      .update(characters)
      .set({ currentHp: sql`${characters.maxHp}` })
      .where(eq(characters.id, characterId));
    return rows;
  });
  await logSheet(character, user.id, "longRest", {
    character: character.name,
    n: refilled.length,
  });
  revalidateSheet(character);
}

/**
 * Short rest: the warlock's hour with a book and a fire, after which the pact
 * slots are full again.
 *
 * The narrow rule is the whole feature. An hour's rest in 5e gives most of the
 * party hit dice and a class feature or two, and gives *nobody else* a spell
 * slot back — so this button refills the slot table only for a sheet whose
 * written class reads as a warlock, and does nothing whatsoever otherwise. The
 * class is read the same way the portrait's class plate and the slot table's
 * "suggest" button read it (lib/class-match.ts) — found *inside* the written
 * line rather than matched against it — so "Level 5 Warlock (Fiend)" counts.
 *
 * The silent return is deliberate rather than lazy: the id is forgeable and a
 * caller who reaches this action for a barbarian gets the same nothing an
 * unauthorised one gets. The sheet does not draw the button for a class it
 * would do nothing for, so nobody honest arrives here by accident.
 *
 * Hit points and limited-use abilities stay where they are: hit dice are spent
 * one at a time and by choice, and "recharges on a short rest" is a per-feature
 * sentence the sheet has no column for. Long rest remains the button that
 * refills everything.
 *
 * Known rough edge: the slot table has no pact/spell column, so a multiclass
 * warlock's wizard slots come back with the pact ones. The table for that
 * character is hand-kept anyway (suggestSlots refuses multiclass lines), and
 * refilling a slot the book would not is a kinder wrong answer than a button
 * that refuses the warlock it was drawn for.
 */
export async function shortRest(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  if (matchClass(character.klass) !== "warlock") return;
  await db
    .update(characterSpellSlots)
    .set({ used: 0 })
    .where(eq(characterSpellSlots.characterId, characterId));
  await logSheet(character, user.id, "shortRest", { character: character.name });
  // Slots are pips on this sheet and a number nobody else reads — the hub and
  // the party list carry an armour class, which an hour by the fire does not move.
  revalidateSheetOnly(character);
}

export async function deleteAbility(abilityId: string) {
  const user = await requireUser();
  const ability = await db.query.characterAbilities.findFirst({
    where: eq(characterAbilities.id, abilityId),
  });
  if (!ability) return;
  const character = await getEditableCharacter(ability.characterId, user.id);
  if (!character) return;
  await db.delete(characterAbilities).where(eq(characterAbilities.id, abilityId));
  await logSheet(character, user.id, "abilityRemoved", {
    name: ability.name,
    character: character.name,
  });
  revalidateSheet(character);
}

// ---------- spell slots ----------

/**
 * Write a whole slot table in one go, inside the caller's transaction: the
 * levels named are inserted or retuned, and every level *not* named is
 * dropped — the table on screen is exactly the rows that come back.
 *
 * Spent slots survive a retune, which is the only behaviour that makes sense
 * mid-session: a wizard who has already burned two of four level-1 slots and
 * then fixes a typo in the table has still burned them. Lowering the total
 * below what is spent pulls `used` down with it (LEAST), so the row can never
 * read "3/2".
 */
async function applySlotRows(tx: Tx, characterId: string, rows: SlotRow[]) {
  const levels = rows.map((row) => row.level);
  await tx
    .delete(characterSpellSlots)
    .where(
      levels.length === 0
        ? eq(characterSpellSlots.characterId, characterId)
        : and(
            eq(characterSpellSlots.characterId, characterId),
            notInArray(characterSpellSlots.level, levels)
          )
    );
  for (const row of rows) {
    await tx
      .insert(characterSpellSlots)
      .values({ characterId, level: row.level, total: row.total, used: 0 })
      .onConflictDoUpdate({
        target: [characterSpellSlots.characterId, characterSpellSlots.level],
        set: {
          total: row.total,
          used: sql`LEAST(${characterSpellSlots.used}, ${row.total})`,
        },
      });
  }
}

/**
 * The same retune, for a caller that has no transaction of its own. Levelling
 * up does — the new table and the new level are one change — and reaches for
 * `applySlotRows` directly rather than opening a second one inside the first.
 */
async function writeSlotRows(characterId: string, rows: SlotRow[]) {
  await db.transaction((tx) => applySlotRows(tx, characterId, rows));
}

/**
 * The sheet's own slot table, nine numbers wide. A level left blank or set to
 * zero has no slots and loses its row; anything above nine is a typo, not a
 * character (the SRD stops at nine of a level, and so does the tracker).
 */
export async function setSpellSlots(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;

  const rows: SlotRow[] = [];
  for (let level = MIN_SPELL_LEVEL; level <= MAX_SPELL_LEVEL; level += 1) {
    const total = clampOpt(int(formData, `level${level}`), 0, 9) ?? 0;
    if (total > 0) rows.push({ level, total });
  }
  await writeSlotRows(characterId, rows);
  // The slot table is drawn on the sheet and summarised nowhere.
  revalidateSheetOnly(character);
}

/**
 * Fill the table in from the class the sheet already names — the button that
 * saves a level 9 cleric from typing "4 3 3 3 1" by hand.
 *
 * It overwrites the totals on purpose: "suggest" here means "give me the
 * book's answer", and a player who wanted their own numbers has the form right
 * above it. Spent slots are still spent afterwards (writeSlotRows keeps
 * `used`), so pressing it mid-session does not hand anyone free casts. A class
 * the tables do not speak for — a barbarian, a homebrew name — writes nothing
 * at all rather than clearing what is there.
 */
export async function suggestFromClass(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const rows = suggestSlots(character.klass, character.level);
  if (!rows || rows.length === 0) return;
  await writeSlotRows(characterId, rows);
  revalidateSheetOnly(character);
}

/** Neither end of the counter takes a level the table could not hold. */
const isSpellLevel = (level: number) =>
  Number.isInteger(level) && level >= MIN_SPELL_LEVEL && level <= MAX_SPELL_LEVEL;

/**
 * Burn a slot. Counted in the database like every other resource on the sheet,
 * so two casts in the same instant spend two slots rather than one; the LEAST
 * keeps a race from spending a slot the character does not have.
 */
export async function spendSpellSlot(characterId: string, level: number) {
  const user = await requireUser();
  if (!isSpellLevel(level)) return;
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  await db
    .update(characterSpellSlots)
    .set({
      used: sql`LEAST(${characterSpellSlots.total}, ${characterSpellSlots.used} + 1)`,
    })
    .where(
      and(
        eq(characterSpellSlots.characterId, characterId),
        eq(characterSpellSlots.level, level)
      )
    );
  // A spent slot is a pip on this sheet. The hub and the party list carry an
  // armour class and a passive Perception, neither of which a cast moves — and
  // these two are the most-tapped controls at the table, so they pay the least.
  revalidateSheetOnly(character);
}

/** Misclicked. The same counter, the other way, floored at zero. */
export async function restoreSpellSlot(characterId: string, level: number) {
  const user = await requireUser();
  if (!isSpellLevel(level)) return;
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  await db
    .update(characterSpellSlots)
    .set({ used: sql`GREATEST(0, ${characterSpellSlots.used} - 1)` })
    .where(
      and(
        eq(characterSpellSlots.characterId, characterId),
        eq(characterSpellSlots.level, level)
      )
    );
  revalidateSheetOnly(character);
}

// ---------- levelling ----------

/**
 * Where the game itself stops. The sheet form still accepts 1–30, because a
 * table running epic levels is running them whatever this app thinks; what a
 * *button* may do is narrower, since every table the button consults — hit
 * points, spell slots, proficiency — is written to twenty and no further.
 */
const MAX_CHARACTER_LEVEL = 20;

/**
 * One press for the four things that happen together at the end of a session.
 *
 * A level-up is not a new fact so much as four old ones moving at once: the
 * level, the hit points, the spell slot table, and — the first time — the path
 * the character walks. Every one of them is already editable by hand on this
 * sheet, and every one of them is the sort of thing a table forgets until the
 * fight where it mattered. So this is a convenience and never an authority:
 * it writes ordinary columns, and the sheet form may rub any of them out five
 * minutes later.
 *
 * Hit points are the number the player owns. Typed, it is theirs — that is
 * what a die roll is for. Left blank, the book's fixed-value option is offered
 * instead: half the die, rounded up, plus Constitution. The Constitution read
 * here is the *stored* score rather than the effective one, and deliberately:
 * an amulet raising CON raises the modifier while it is worn, but hit points
 * gained on levelling are kept when it comes off, and a sheet that quietly
 * banked a borrowed +1 forever would be wrong in the direction nobody audits.
 * The panel's placeholder shows this same number, so what is offered is what
 * is written.
 *
 * A sheet with neither a class nor a Constitution has no average to offer, and
 * then nothing is added at all: an invented hit point is worse than a blank
 * one. Current hit points move by exactly what the maximum moved by — a
 * level-up is not a heal, but neither should it leave a character one short of
 * a full night's sleep.
 */
export async function levelUpCharacter(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  // Silent at the ceiling, like every other refusal here: the panel is not
  // drawn for a level 20 sheet, so nobody honest arrives with this request.
  if (character.level >= MAX_CHARACTER_LEVEL) return;

  const newLevel = character.level + 1;
  const info = classInfo(character.klass);

  const typed = clampOpt(int(formData, "hpGain"), 0, 99);
  const average =
    info && character.con !== null
      ? Math.max(0, Math.floor(info.hitDie / 2) + 1 + mod(character.con))
      : null;
  const hpGain = typed ?? average;

  // A sheet that has never been given a maximum starts the sum at zero, which
  // is the same arithmetic the builder does. Null gain leaves both columns
  // exactly as they were.
  const maxHp =
    hpGain === null ? character.maxHp : Math.min((character.maxHp ?? 0) + hpGain, HP_CEILING);
  const currentHp =
    hpGain === null || character.currentHp === null
      ? character.currentHp
      : Math.min(character.currentHp + hpGain, maxHp ?? HP_CEILING);

  // The panel offers the class's own paths in a list and a blank line beside
  // it for a table whose path nobody printed; a written line wins, because it
  // is the one somebody typed on purpose.
  const picked = cap(str(formData, "subclassCustom"), 80) || cap(str(formData, "subclass"), 80);
  // The same sentence the builder says: a path arrives at the level the class
  // says it does, and a class the book does not speak for is held to nothing.
  // A path already written is never overwritten — this button adds a level,
  // and rewriting a Champion into a Battle Master is a decision with a form
  // of its own.
  const tooEarly = info !== null && newLevel < info.subclassLevel;
  const subclass =
    picked && !tooEarly && !character.subclass ? picked : character.subclass;

  // What the book would deal at the new level. Null is a class the tables do
  // not speak for — a barbarian, a homebrew name — and writes nothing rather
  // than clearing a table somebody keeps by hand. Totals come from the new
  // row set; spent slots survive it, so levelling mid-session hands out no
  // free casts.
  const slots = suggestSlots(character.klass, newLevel);

  // One write: a character who gained a level but not the slots that come
  // with it is a sheet the player has to repair before they can play. The
  // arithmetic is done in JavaScript rather than in SQL because this is a
  // once-an-evening press with a form in front of it, not a counter two
  // people tap at the same instant.
  await db.transaction(async (tx) => {
    await tx
      .update(characters)
      .set({ level: newLevel, maxHp, currentHp, subclass, updatedAt: Date.now() })
      .where(eq(characters.id, characterId));
    if (slots && slots.length > 0) await applySlotRows(tx, characterId, slots);
  });

  await logSheet(character, user.id, "leveledUp", {
    character: character.name,
    n: newLevel,
  });
  // Wider than the sheet: proficiency rises on the fours, and the hub and the
  // party list both print numbers computed from it.
  revalidateSheet(character);
}
