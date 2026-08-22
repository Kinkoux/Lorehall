"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  gameSessions,
  combatants,
  sessionEvents,
  characters,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { getTurnOrder } from "@/lib/queries";
import { logMessage } from "@/lib/session-log";
import type { FormState } from "@/lib/actions";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function int(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

/** Postgres unique_violation — a double-click losing the race, not a bug. */
const isUniqueViolation = (e: unknown) => {
  // drizzle wraps driver errors; the SQLSTATE may sit on the error or its cause.
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

/** `db` itself or a transaction handle — both write rows the same way. */
type Writer = Pick<typeof db, "insert">;

async function logEvent(
  sessionId: string,
  kind: "roll" | "join" | "system" | "note",
  message: string,
  userId?: string,
  exec: Writer = db
) {
  await exec.insert(sessionEvents).values({
    id: nanoid(12),
    sessionId,
    userId: userId ?? null,
    kind,
    message,
    createdAt: Date.now(),
  });
}

/**
 * After inserting a combatant, keep the turn pointer on the creature whose
 * turn it was: entries added above the current position shift it down by one.
 */
async function bumpTurnIndexFor(sessionId: string, combatantId: string, turnIndex: number) {
  const order = await getTurnOrder(sessionId);
  const insertedAt = order.findIndex((c) => c.id === combatantId);
  if (order.length > 1 && insertedAt !== -1 && insertedAt <= turnIndex) {
    // The shift is relative: two players joining at once each move the pointer
    // once, instead of the second write overwriting the first one's result.
    await db
      .update(gameSessions)
      .set({ turnIndex: sql`${gameSessions.turnIndex} + 1` })
      .where(eq(gameSessions.id, sessionId));
  }
}

async function requireLiveSession(sessionId: string, userId: string) {
  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session) return null;
  const access = await getCampaignAccess(session.campaignId, userId);
  if (!access?.canParticipate) return null;
  return { session, access };
}

// ---------- lifecycle ----------

export async function startSession(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;

  const existing = await db.query.gameSessions.findFirst({
    where: and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.status, "live")),
  });
  if (existing) redirect(`/s/${existing.id}`);

  const id = nanoid(12);
  const count = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(eq(gameSessions.campaignId, campaignId));
  const { t } = await getT();
  try {
    // Row and opening line land together: a session never exists without the
    // log entry that announces it, and a rejected insert leaves neither.
    await db.transaction(async (tx) => {
      await tx.insert(gameSessions).values({
        id,
        campaignId,
        title:
          cap(str(formData, "title"), 150) ||
          t("campaign.start.placeholder", { n: count.length + 1 }),
        startedAt: Date.now(),
      });
      await logEvent(id, "system", logMessage("sessionBegins"), undefined, tx);
    });
  } catch (e) {
    // A second click raced the first: uniq_live_session rejected this row, so
    // the session the winner opened is the one to walk into.
    if (!isUniqueViolation(e)) throw e;
    const live = await db.query.gameSessions.findFirst({
      where: and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.status, "live")),
    });
    if (live) redirect(`/s/${live.id}`);
    return;
  }
  redirect(`/s/${id}`);
}

export async function endSession(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm) return;

  await db.transaction(async (tx) => {
    await tx
      .update(gameSessions)
      .set({
        status: "ended",
        endedAt: Date.now(),
        recap: cap(str(formData, "recap"), 20_000) || null,
      })
      .where(eq(gameSessions.id, sessionId));
    await logEvent(sessionId, "system", logMessage("sessionEnds"), undefined, tx);
  });
  revalidatePath(`/c/${ctx.session.campaignId}`);
  redirect(`/c/${ctx.session.campaignId}`);
}

export async function saveRecap(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session) return;
  const access = await getCampaignAccess(session.campaignId, user.id);
  if (!access?.isDm) return;
  await db
    .update(gameSessions)
    .set({ recap: cap(str(formData, "recap"), 20_000) || null })
    .where(eq(gameSessions.id, sessionId));
  revalidatePath(`/s/${sessionId}`);
  revalidatePath(`/c/${session.campaignId}`);
}

// ---------- initiative ----------

export async function addCombatant(sessionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return { error: t("errors.session.dmOnlyAdd") };

  const name = str(formData, "name");
  const initiative = int(formData, "initiative");
  if (!name) return { error: t("errors.session.nameRequired") };
  if (initiative === null) return { error: t("errors.session.initiativeRequired") };

  const rawMaxHp = int(formData, "maxHp");
  const maxHp = rawMaxHp === null ? null : Math.min(Math.max(rawMaxHp, 0), 9999);
  const id = nanoid(12);
  await db.insert(combatants).values({
    id,
    sessionId,
    name: cap(name, 150),
    initiative: Math.min(Math.max(initiative, -10), 50),
    maxHp,
    hp: maxHp,
    createdAt: Date.now(),
  });
  await bumpTurnIndexFor(sessionId, id, ctx.session.turnIndex);
  revalidatePath(`/s/${sessionId}`);
  return {};
}

/**
 * A player enters the initiative order as their character. If they rolled a
 * physical d20 they type the result; left blank, the app rolls for them.
 */
export async function joinInitiative(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx || ctx.session.status !== "live") return;

  const already = await db.query.combatants.findFirst({
    where: and(eq(combatants.sessionId, sessionId), eq(combatants.userId, user.id)),
  });
  if (already) return;

  // Approved characters only; with several, the join form names one.
  const myCharacters = await db
    .select()
    .from(characters)
    .where(
      and(
        eq(characters.campaignId, ctx.session.campaignId),
        eq(characters.userId, user.id),
        eq(characters.approval, "approved")
      )
    );
  const chosenId = str(formData, "characterId");
  const character = chosenId
    ? myCharacters.find((c) => c.id === chosenId)
    : myCharacters[0];
  if (chosenId && !character) return;
  if (character?.status === "dead") return; // the dead roll no initiative
  const dexMod =
    character?.dex != null ? Math.floor((character.dex - 10) / 2) : 0;
  const manual = int(formData, "initiative");
  const roll =
    manual !== null ? Math.max(-10, Math.min(50, manual)) : randomInt(1, 21) + dexMod;
  const name = cap(
    character?.name ||
      ctx.access.membership?.characterName ||
      user.displayName ||
      user.username,
    150
  );
  const id = nanoid(12);
  try {
    await db.insert(combatants).values({
      id,
      sessionId,
      name,
      initiative: roll,
      maxHp: character?.maxHp ?? null,
      // Walk in at the health the sheet actually carries. `currentHp` is NULL
      // for a character nobody has damaged yet, which reads as full.
      hp: character ? (character.currentHp ?? character.maxHp ?? null) : null,
      userId: user.id,
      // Remembering the sheet lets the initiative row show its portrait.
      characterId: character?.id ?? null,
      createdAt: Date.now(),
    });
  } catch (e) {
    // Double-click: uniq_combatant_player already holds this player's row.
    if (!isUniqueViolation(e)) throw e;
    return;
  }
  await bumpTurnIndexFor(sessionId, id, ctx.session.turnIndex);
  const src = manual !== null ? "srcManual" : dexMod !== 0 ? "srcAppDex" : "srcApp";
  await logEvent(
    sessionId,
    "join",
    logMessage("joinsInitiative", {
      name,
      roll,
      src,
      mod: dexMod > 0 ? `+${dexMod}` : `${dexMod}`,
    }),
    user.id
  );
  revalidatePath(`/s/${sessionId}`);
}

/** Anyone at the table can pin a note to the session log ("Ser Alden owes us 50gp"). */
export async function addTableNote(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx || ctx.session.status !== "live") return;
  const text = str(formData, "note");
  if (!text) return;
  // Author renders from the joined users row; store only the note itself.
  await logEvent(sessionId, "note", cap(text, 500), user.id);
  revalidatePath(`/s/${sessionId}`);
}

export async function removeCombatant(sessionId: string, combatantId: string) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;

  const order = await getTurnOrder(sessionId);
  const removedIndex = order.findIndex((c) => c.id === combatantId);
  if (removedIndex === -1) return;

  // Keep the turn pointer on the same creature (or clamp when the list shrinks).
  let turnIndex = ctx.session.turnIndex;
  if (removedIndex < turnIndex) turnIndex -= 1;
  const newCount = order.length - 1;
  if (newCount > 0 && turnIndex >= newCount) turnIndex = 0;
  if (newCount === 0) turnIndex = 0;
  // The row leaves and the pointer moves together — halfway through, the
  // pointer would name a creature that is no longer in the order.
  await db.transaction(async (tx) => {
    await tx.delete(combatants).where(eq(combatants.id, combatantId));
    await tx.update(gameSessions).set({ turnIndex }).where(eq(gameSessions.id, sessionId));
  });
  revalidatePath(`/s/${sessionId}`);
}

export async function adjustHp(sessionId: string, combatantId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx || ctx.session.status !== "live") return;

  // Scoped to this session: a combatantId from another table is not the DM's
  // to touch just because they run this one.
  const combatant = await db.query.combatants.findFirst({
    where: and(eq(combatants.id, combatantId), eq(combatants.sessionId, sessionId)),
  });
  if (!combatant || combatant.hp === null) return;

  // At this table a player notes their own damage; the DM notes everyone
  // else's. So: the DM may touch any row, and a player only the row their own
  // character is standing in. A monster (character_id NULL) is the DM's alone,
  // and so is another player's row.
  if (!ctx.access.isDm) {
    if (!combatant.characterId) return;
    const sheet = await db.query.characters.findFirst({
      where: eq(characters.id, combatant.characterId),
    });
    if (!sheet || sheet.userId !== user.id) return;
  }

  // An empty box means the commonest number at the table — one point. The
  // field is left blank on purpose so a thumb can type into it without
  // clearing a default first; blank must therefore land somewhere, not be
  // dropped in silence.
  const amount = int(formData, "amount") ?? 1;
  if (amount < 0) return;
  const op = str(formData, "op");
  // Read out of the row so the narrowing survives into the transaction
  // callbacks below, and so "before" and "after" are named the same way in
  // both the write and the line the log ends up printing.
  const wasHp = combatant.hp;
  const sheetId = combatant.characterId;
  // The arithmetic runs inside the UPDATE, so two hits landing at the same
  // moment both count instead of the second overwriting the first. The clamps
  // are the same ones the JS used: floor at zero, ceiling at max HP (no
  // ceiling when the creature has none).
  const scope = and(eq(combatants.id, combatantId), eq(combatants.sessionId, sessionId));

  if (op === "temp") {
    // Temp HP doesn't stack — the new pool replaces the old one.
    await db.update(combatants).set({ tempHp: amount }).where(scope);
    if (amount > 0) {
      await logEvent(sessionId, "system", logMessage("gainsTemp", { name: combatant.name, n: amount }));
    }
  } else if (op === "heal") {
    const healed = sql`GREATEST(0, LEAST(COALESCE(${combatants.maxHp}, ${combatants.hp} + ${amount}), ${combatants.hp} + ${amount}))`;
    const hp = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(combatants)
        .set({
          hp: healed,
          // Coming back from zero clears the death save pips.
          deathSuccesses: sql`CASE WHEN ${combatants.hp} = 0 AND ${healed} > 0 THEN 0 ELSE ${combatants.deathSuccesses} END`,
          deathFailures: sql`CASE WHEN ${combatants.hp} = 0 AND ${healed} > 0 THEN 0 ELSE ${combatants.deathFailures} END`,
        })
        .where(scope)
        .returning({ hp: combatants.hp });
      const next = row?.hp ?? wasHp;
      // The row the database just settled on is the one the sheet keeps: a
      // second source of truth would drift the first time two hits raced.
      if (row && sheetId) {
        await tx.update(characters).set({ currentHp: next }).where(eq(characters.id, sheetId));
      }
      return next;
    });
    if (hp !== wasHp) {
      await logEvent(
        sessionId,
        "system",
        logMessage("heals", { name: combatant.name, n: hp - wasHp, from: wasHp, to: hp })
      );
    }
  } else {
    // Damage chews through temp HP first, then spills into HP.
    const hp = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(combatants)
        .set({
          hp: sql`GREATEST(0, ${combatants.hp} - GREATEST(0, ${amount} - ${combatants.tempHp}))`,
          tempHp: sql`GREATEST(0, ${combatants.tempHp} - ${amount})`,
        })
        .where(scope)
        .returning({ hp: combatants.hp });
      const next = row?.hp ?? wasHp;
      if (row && sheetId) {
        await tx.update(characters).set({ currentHp: next }).where(eq(characters.id, sheetId));
      }
      return next;
    });
    if (amount > 0) {
      await logEvent(
        sessionId,
        "system",
        logMessage("takesDamage", { name: combatant.name, n: amount, from: wasHp, to: hp })
      );
    }
    if (hp === 0 && wasHp > 0) {
      await logEvent(sessionId, "system", logMessage("dropsToZero", { name: combatant.name }));
    }
  }
  revalidatePath(`/s/${sessionId}`);
}

/** Death save pips for downed player characters; DM or the owner may click. */
export async function recordDeathSave(
  sessionId: string,
  combatantId: string,
  kind: "success" | "fail" | "reset"
) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx || ctx.session.status !== "live") return;

  const combatant = await db.query.combatants.findFirst({
    where: and(eq(combatants.id, combatantId), eq(combatants.sessionId, sessionId)),
  });
  if (!combatant) return;
  if (!ctx.access.isDm && combatant.userId !== user.id) return;

  // The pip count is bumped in place and the third one is only reached once:
  // the "< 3" guard is the ceiling the JS Math.min used to apply, and it also
  // makes the row that crossed the line the only one that announces it.
  const scope = and(eq(combatants.id, combatantId), eq(combatants.sessionId, sessionId));

  if (kind === "reset") {
    await db.update(combatants).set({ deathSuccesses: 0, deathFailures: 0 }).where(scope);
  } else if (kind === "success") {
    const [row] = await db
      .update(combatants)
      .set({ deathSuccesses: sql`${combatants.deathSuccesses} + 1` })
      .where(and(scope, lt(combatants.deathSuccesses, 3)))
      .returning({ deathSuccesses: combatants.deathSuccesses });
    if (row?.deathSuccesses === 3) {
      await logEvent(sessionId, "system", logMessage("isStable", { name: combatant.name }));
    }
  } else {
    const [row] = await db
      .update(combatants)
      .set({ deathFailures: sql`${combatants.deathFailures} + 1` })
      .where(and(scope, lt(combatants.deathFailures, 3)))
      .returning({ deathFailures: combatants.deathFailures });
    if (row?.deathFailures === 3) {
      await logEvent(sessionId, "system", logMessage("hasDied", { name: combatant.name }));
    }
  }
  revalidatePath(`/s/${sessionId}`);
}

export async function setConditions(sessionId: string, combatantId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;
  await db
    .update(combatants)
    .set({ conditions: cap(str(formData, "conditions"), 200) || null })
    .where(and(eq(combatants.id, combatantId), eq(combatants.sessionId, sessionId)));
  revalidatePath(`/s/${sessionId}`);
}

/**
 * Whether the party reads a monster's hit points or hears what it looks like.
 * Off by default, because at the table the DM describes the ogre's state and
 * the players guess; the switch is there for the fights where the maths is
 * meant to be public. One statement, so a double-click cannot land on the
 * state neither click asked for.
 */
export async function setMonsterHpVisibility(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;

  await db
    .update(gameSessions)
    .set({ showMonsterHp: str(formData, "show") === "1" ? 1 : 0 })
    .where(eq(gameSessions.id, sessionId));
  revalidatePath(`/s/${sessionId}`);
}

/**
 * Combat is an explicit phase: the party may roll initiative long before the
 * first blow lands, so nothing ticks until the DM opens the fight.
 */
export async function startCombat(sessionId: string) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;
  if (ctx.session.combatActive === 1) return;

  await db
    .update(gameSessions)
    .set({ combatActive: 1, round: 1, turnIndex: 0 })
    .where(eq(gameSessions.id, sessionId));
  await logEvent(sessionId, "system", logMessage("combatStarts"));
  revalidatePath(`/s/${sessionId}`);
}

export async function endCombat(sessionId: string) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;
  if (ctx.session.combatActive !== 1) return;

  await db
    .update(gameSessions)
    .set({ combatActive: 0 })
    .where(eq(gameSessions.id, sessionId));
  await logEvent(sessionId, "system", logMessage("combatEnds", { rounds: ctx.session.round }));
  revalidatePath(`/s/${sessionId}`);
}

export async function nextTurn(sessionId: string) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm || ctx.session.status !== "live") return;
  if (ctx.session.combatActive !== 1) return;

  const order = await getTurnOrder(sessionId);
  if (order.length === 0) return;

  let turnIndex = ctx.session.turnIndex + 1;
  let round = ctx.session.round;
  if (turnIndex >= order.length) {
    turnIndex = 0;
    round += 1;
    await logEvent(sessionId, "system", logMessage("roundBegins", { n: round }));
  }
  await db.update(gameSessions).set({ turnIndex, round }).where(eq(gameSessions.id, sessionId));
  revalidatePath(`/s/${sessionId}`);
}

// ---------- dice ----------

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** What the roller shows the person who pressed the die, over and above the
 *  line the whole table reads in the log. */
export type RollResult = { notation: string; rolls: number[]; total: number };

export async function rollDice(
  sessionId: string,
  formData: FormData
): Promise<RollResult | undefined> {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx || ctx.session.status !== "live") return;

  const sides = int(formData, "sides") ?? 20;
  if (!DICE.includes(sides)) return;
  const count = Math.min(Math.max(int(formData, "count") ?? 1, 1), 20);
  const modifier = Math.min(Math.max(int(formData, "modifier") ?? 0, -99), 99);

  const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;

  const notation = `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`;
  const detail = count > 1 || modifier ? `[${rolls.join(", ")}]` : "";
  await logEvent(sessionId, "roll", logMessage("rolled", { notation, detail, total }), user.id);
  revalidatePath(`/s/${sessionId}`);
  // The log keeps the table's copy; this one goes back to the hand that
  // pressed the die, which should not have to hunt the scroll for its own
  // number.
  return { notation, rolls, total };
}
