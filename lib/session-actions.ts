"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  gameSessions,
  combatants,
  sessionEvents,
  characters,
  type Combatant,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
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

async function logEvent(
  sessionId: string,
  kind: "roll" | "join" | "system" | "note",
  message: string,
  userId?: string
) {
  await db.insert(sessionEvents).values({
    id: nanoid(12),
    sessionId,
    userId: userId ?? null,
    kind,
    message,
    createdAt: Date.now(),
  });
}

/** Combatants in table order: highest initiative first, earliest added wins ties. */
export async function getTurnOrder(sessionId: string): Promise<Combatant[]> {
  return db
    .select()
    .from(combatants)
    .where(eq(combatants.sessionId, sessionId))
    .orderBy(desc(combatants.initiative), asc(combatants.createdAt));
}

/**
 * After inserting a combatant, keep the turn pointer on the creature whose
 * turn it was: entries added above the current position shift it down by one.
 */
async function bumpTurnIndexFor(sessionId: string, combatantId: string, turnIndex: number) {
  const order = await getTurnOrder(sessionId);
  const insertedAt = order.findIndex((c) => c.id === combatantId);
  if (order.length > 1 && insertedAt !== -1 && insertedAt <= turnIndex) {
    await db
      .update(gameSessions)
      .set({ turnIndex: turnIndex + 1 })
      .where(eq(gameSessions.id, sessionId));
  }
}

async function requireLiveSession(sessionId: string, userId: string) {
  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session) return null;
  const access = await getCampaignAccess(session.campaignId, userId);
  if (!access?.canView) return null;
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
  await db.insert(gameSessions).values({
    id,
    campaignId,
    title: str(formData, "title") || t("campaign.start.placeholder", { n: count.length + 1 }),
    startedAt: Date.now(),
  });
  await logEvent(id, "system", logMessage("sessionBegins"));
  redirect(`/s/${id}`);
}

export async function endSession(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm) return;

  await db
    .update(gameSessions)
    .set({
      status: "ended",
      endedAt: Date.now(),
      recap: str(formData, "recap") || null,
    })
    .where(eq(gameSessions.id, sessionId));
  await logEvent(sessionId, "system", logMessage("sessionEnds"));
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
    .set({ recap: str(formData, "recap") || null })
    .where(eq(gameSessions.id, sessionId));
  revalidatePath(`/s/${sessionId}`);
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

  const maxHp = int(formData, "maxHp");
  const id = nanoid(12);
  await db.insert(combatants).values({
    id,
    sessionId,
    name,
    initiative,
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
  const name =
    character?.name ||
    ctx.access.membership?.characterName ||
    user.displayName ||
    user.username;
  const id = nanoid(12);
  await db.insert(combatants).values({
    id,
    sessionId,
    name,
    initiative: roll,
    maxHp: character?.maxHp ?? null,
    hp: character?.maxHp ?? null,
    userId: user.id,
    createdAt: Date.now(),
  });
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
  await logEvent(sessionId, "note", text, user.id);
  revalidatePath(`/s/${sessionId}`);
}

export async function removeCombatant(sessionId: string, combatantId: string) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm) return;

  const order = await getTurnOrder(sessionId);
  const removedIndex = order.findIndex((c) => c.id === combatantId);
  if (removedIndex === -1) return;

  await db.delete(combatants).where(eq(combatants.id, combatantId));

  // Keep the turn pointer on the same creature (or clamp when the list shrinks).
  let turnIndex = ctx.session.turnIndex;
  if (removedIndex < turnIndex) turnIndex -= 1;
  const newCount = order.length - 1;
  if (newCount > 0 && turnIndex >= newCount) turnIndex = 0;
  if (newCount === 0) turnIndex = 0;
  await db.update(gameSessions).set({ turnIndex }).where(eq(gameSessions.id, sessionId));
  revalidatePath(`/s/${sessionId}`);
}

export async function adjustHp(sessionId: string, combatantId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm) return;

  const combatant = await db.query.combatants.findFirst({ where: eq(combatants.id, combatantId) });
  if (!combatant || combatant.hp === null) return;

  const amount = int(formData, "amount");
  if (amount === null || amount < 0) return;
  const op = str(formData, "op");
  const cap = combatant.maxHp ?? Number.MAX_SAFE_INTEGER;

  if (op === "temp") {
    // Temp HP doesn't stack — the new pool replaces the old one.
    await db.update(combatants).set({ tempHp: amount }).where(eq(combatants.id, combatantId));
    if (amount > 0) {
      await logEvent(sessionId, "system", logMessage("gainsTemp", { name: combatant.name, n: amount }));
    }
  } else if (op === "heal") {
    const hp = Math.max(0, Math.min(cap, combatant.hp + amount));
    const revived = combatant.hp === 0 && hp > 0;
    await db
      .update(combatants)
      .set({
        hp,
        ...(revived ? { deathSuccesses: 0, deathFailures: 0 } : {}),
      })
      .where(eq(combatants.id, combatantId));
    if (hp !== combatant.hp) {
      await logEvent(
        sessionId,
        "system",
        logMessage("heals", { name: combatant.name, n: hp - combatant.hp, from: combatant.hp, to: hp })
      );
    }
  } else {
    // Damage chews through temp HP first.
    const tempLeft = Math.max(0, combatant.tempHp - amount);
    const spill = Math.max(0, amount - combatant.tempHp);
    const hp = Math.max(0, combatant.hp - spill);
    await db
      .update(combatants)
      .set({ hp, tempHp: tempLeft })
      .where(eq(combatants.id, combatantId));
    if (amount > 0) {
      await logEvent(
        sessionId,
        "system",
        logMessage("takesDamage", { name: combatant.name, n: amount, from: combatant.hp, to: hp })
      );
    }
    if (hp === 0 && combatant.hp > 0) {
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

  const combatant = await db.query.combatants.findFirst({ where: eq(combatants.id, combatantId) });
  if (!combatant) return;
  if (!ctx.access.isDm && combatant.userId !== user.id) return;

  if (kind === "reset") {
    await db
      .update(combatants)
      .set({ deathSuccesses: 0, deathFailures: 0 })
      .where(eq(combatants.id, combatantId));
  } else if (kind === "success") {
    const deathSuccesses = Math.min(3, combatant.deathSuccesses + 1);
    await db.update(combatants).set({ deathSuccesses }).where(eq(combatants.id, combatantId));
    if (deathSuccesses === 3 && combatant.deathSuccesses < 3) {
      await logEvent(sessionId, "system", logMessage("isStable", { name: combatant.name }));
    }
  } else {
    const deathFailures = Math.min(3, combatant.deathFailures + 1);
    await db.update(combatants).set({ deathFailures }).where(eq(combatants.id, combatantId));
    if (deathFailures === 3 && combatant.deathFailures < 3) {
      await logEvent(sessionId, "system", logMessage("hasDied", { name: combatant.name }));
    }
  }
  revalidatePath(`/s/${sessionId}`);
}

export async function setConditions(sessionId: string, combatantId: string, formData: FormData) {
  const user = await requireUser();
  const ctx = await requireLiveSession(sessionId, user.id);
  if (!ctx?.access.isDm) return;
  await db
    .update(combatants)
    .set({ conditions: str(formData, "conditions") || null })
    .where(eq(combatants.id, combatantId));
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

export async function rollDice(sessionId: string, formData: FormData) {
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
}
