"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { customAlphabet, nanoid } from "nanoid";
import {
  db,
  users,
  worlds,
  worldMembers,
  campaigns,
  campaignMembers,
  characters,
  codexEntries,
  CODEX_TYPES,
  type CodexType,
} from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { canEditEntry, getCampaignAccess, hasDmPowers } from "@/lib/perms";
import { campaignLog } from "@/lib/campaign-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { isEmailAddress, normalizeEmail, sendVerification } from "@/lib/email";
import { getT } from "@/lib/locale";

export type FormState = { error?: string };

const joinCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

// ---------- auth ----------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Upper bound on a password. Hashing cost is paid per submission, so the
 * input needs an end; 128 is far past any real passphrase, and bcrypt only
 * reads the first 72 bytes anyway.
 */
const PASSWORD_MAX = 128;

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = str(formData, "username").toLowerCase();
  const displayName = str(formData, "displayName");
  const email = normalizeEmail(str(formData, "email"));
  const password = formData.get("password");

  const { t, locale } = await getT();
  // A handful of new accounts an hour per address: plenty for a household
  // sharing a connection, and a low ceiling for anything automated.
  if (!(await checkRateLimit(`register:ip:${await clientIp()}`, 5, HOUR))) {
    return { error: t("errors.auth.tooManyAttempts") };
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: t("errors.auth.usernameFormat") };
  }
  if (!isEmailAddress(email)) {
    return { error: t("errors.auth.emailInvalid") };
  }
  if (typeof password !== "string" || password.length < 6) {
    return { error: t("errors.auth.passwordTooShort") };
  }
  if (password.length > PASSWORD_MAX) {
    return { error: t("errors.auth.passwordTooLong") };
  }
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) return { error: t("errors.auth.usernameTaken") };
  const claimed = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (claimed) return { error: t("errors.auth.emailTaken") };

  const id = nanoid(12);
  await db.insert(users).values({
    id,
    username,
    displayName: cap(displayName, 80) || username,
    email,
    // Unconfirmed until the link we are about to send is followed.
    emailVerifiedAt: null,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: Date.now(),
  });
  // The account exists either way: an unsent confirmation costs nothing but a
  // badge on the dashboard, and there is a button there to ask for another.
  await sendVerification(id, email, locale);
  // A brand-new row is at session_version 1 (the column default).
  await createSession(id, 1);
  redirect("/dashboard");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = str(formData, "username").toLowerCase();
  const password = formData.get("password");
  const { t } = await getT();

  // Counted per account and per address; either ceiling alone leaves an
  // obvious way around it. Both are checked before the hash comparison, which
  // is the expensive half of this action.
  const ip = await clientIp();
  const [ipAllowed, userAllowed] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 30, 15 * MINUTE),
    checkRateLimit(`login:u:${username}`, 10, 15 * MINUTE),
  ]);
  if (!ipAllowed || !userAllowed) {
    return { error: t("errors.auth.tooManyAttempts") };
  }

  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: t("errors.auth.badCredentials") };
  }
  await createSession(user.id, user.sessionVersion);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/**
 * Retire every cookie issued for this account by moving the account's session
 * version past all of them. The bump happens in SQL rather than as a
 * read-then-write, so two concurrent clicks cannot land on the same number.
 * The device that asked is re-signed at the new version and stays put; every
 * other one falls out the next time it loads a page.
 */
export async function logoutEverywhere() {
  const user = await requireUser();
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id))
    .returning({ sessionVersion: users.sessionVersion });
  if (!row) {
    await destroySession();
    redirect("/login");
  }
  await createSession(user.id, row.sessionVersion);
  redirect("/dashboard");
}

// ---------- worlds ----------

export async function createWorld(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return;
  const id = nanoid(12);
  const now = Date.now();
  // The world and its owner row are one fact: a world whose owner never
  // landed would be unreachable from the dashboard.
  await db.transaction(async (tx) => {
    await tx.insert(worlds).values({
      id,
      name: cap(name, 150),
      description: cap(str(formData, "description"), 5_000) || null,
      ownerId: user.id,
      createdAt: now,
    });
    await tx.insert(worldMembers).values({
      worldId: id,
      userId: user.id,
      role: "owner",
      joinedAt: now,
    });
  });
  revalidatePath("/dashboard");
  redirect(`/w/${id}`);
}

// ---------- campaigns ----------

export async function createCampaign(worldId: string, formData: FormData) {
  const user = await requireUser();
  // Only the world's owner may open a table in it. A 6-char join code lets
  // anyone into a world as a member; if members could create campaigns they
  // would become DM of one, and a campaign DM holds world-wide DM powers
  // (hasDmPowers) — dm-only codex included. Multi-DM worlds will be an
  // explicit grant from the owner, never a side effect of joining.
  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
  if (!world) return;
  if (world.ownerId !== user.id) return;
  const name = str(formData, "name");
  if (!name) return;
  const id = nanoid(12);
  const now = Date.now();
  await db.insert(campaigns).values({
    id,
    worldId,
    name: cap(name, 150),
    description: cap(str(formData, "description"), 5_000) || null,
    dmUserId: user.id,
    joinCode: joinCodeAlphabet(),
    createdAt: now,
  });
  // The DM runs the table but isn't a party member; getCampaignAccess
  // grants them access via dmUserId. A DM who wants a player character
  // can still join explicitly with the campaign code.
  redirect(`/c/${id}`);
}

export async function joinCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  // A join code is the only thing standing between someone and a table, so
  // the number of codes one account may try in an hour is bounded.
  if (!(await checkRateLimit(`join:u:${user.id}`, 10, HOUR))) {
    return { error: t("errors.auth.tooManyAttempts") };
  }

  const code = str(formData, "code").toUpperCase();
  if (!code) return { error: t("errors.join.emptyCode") };

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.joinCode, code) });
  if (!campaign) return { error: t("errors.join.notFound") };

  const now = Date.now();
  // Joining a table also enrols you in its world — half of that would leave a
  // player who can open the campaign but not the codex behind it.
  await db.transaction(async (tx) => {
    const alreadyIn = await tx.query.campaignMembers.findFirst({
      where: and(eq(campaignMembers.campaignId, campaign.id), eq(campaignMembers.userId, user.id)),
    });
    if (!alreadyIn) {
      await tx.insert(campaignMembers).values({
        campaignId: campaign.id,
        userId: user.id,
        joinedAt: now,
      });
    }
    const inWorld = await tx.query.worldMembers.findFirst({
      where: and(
        eq(worldMembers.worldId, campaign.worldId),
        eq(worldMembers.userId, user.id)
      ),
    });
    if (!inWorld) {
      await tx.insert(worldMembers).values({
        worldId: campaign.worldId,
        userId: user.id,
        role: "member",
        joinedAt: now,
      });
    }
  });
  revalidatePath("/dashboard");
  redirect(`/c/${campaign.id}`);
}

export async function setCharacterName(campaignId: string, formData: FormData) {
  const user = await requireUser();
  await db
    .update(campaignMembers)
    .set({ characterName: cap(str(formData, "characterName"), 150) || null })
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id)));
  revalidatePath(`/c/${campaignId}`);
}

// ---------- membership ----------

/**
 * The DM sends a player away from the table. Only the membership row goes:
 * sheets, ledger entries and log lines stay where they are, because the
 * campaign's history is the campaign's, not the player's. Losing the row is
 * enough — every gate reads membership, so the door closes either way.
 */
export async function kickMember(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const targetId = str(formData, "userId");
  if (!targetId) return;
  // The DM cannot show themselves — or a second DM — the door.
  if (targetId === user.id || targetId === access.campaign.dmUserId) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  const removed = await db
    .delete(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetId)))
    .returning({ userId: campaignMembers.userId });
  if (removed.length === 0) return;

  await campaignLog(campaignId, user.id, "memberKicked", {
    name: target?.displayName ?? target?.username ?? "",
  });
  revalidatePath(`/c/${campaignId}`);
  revalidatePath("/dashboard");
}

/**
 * The other half of kickMember, and what makes removal safe to offer at all:
 * the sheets that stayed behind are the way back. "Left behind" is the whole
 * condition — at least one characters row in this campaign — so this is an
 * undo for a removal or a departure, never a door a stranger can be pulled
 * through. Their world membership returns with them, exactly as joining
 * grants it, since half of it would seat a player who cannot read the codex.
 */
export async function readdMember(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const targetId = str(formData, "userId");
  if (!targetId) return;
  // The DM runs the table without a membership row (createCampaign leaves it
  // out deliberately); this is not the side door onto their own roster.
  if (targetId === user.id || targetId === access.campaign.dmUserId) return;

  // The oldest sheet names the row — the same name the party list showed
  // before the player was sent away.
  const [own] = await db
    .select({ name: characters.name })
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, targetId)))
    .orderBy(asc(characters.updatedAt))
    .limit(1);
  if (!own) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  const now = Date.now();
  const seated = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(campaignMembers)
      .values({ campaignId, userId: targetId, characterName: own.name, joinedAt: now })
      // A double click, or a player who typed the join code in the meantime:
      // the second write is a no-op rather than a 23505 in the DM's face.
      .onConflictDoNothing()
      .returning({ userId: campaignMembers.userId });
    const inWorld = await tx.query.worldMembers.findFirst({
      where: and(
        eq(worldMembers.worldId, access.campaign.worldId),
        eq(worldMembers.userId, targetId)
      ),
    });
    if (!inWorld) {
      await tx.insert(worldMembers).values({
        worldId: access.campaign.worldId,
        userId: targetId,
        role: "member",
        joinedAt: now,
      });
    }
    return inserted.length > 0;
  });
  // A press that seated nobody says nothing: the feed is a list of changes.
  if (seated) {
    await campaignLog(campaignId, user.id, "memberReadded", {
      name: target?.displayName ?? target?.username ?? "",
    });
  }
  revalidatePath(`/c/${campaignId}`);
  revalidatePath("/dashboard");
}

/**
 * A player leaves of their own accord. The DM cannot: the table would be left
 * without one, so the request is simply dropped.
 */
export async function leaveCampaign(campaignId: string) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access || access.isDm || !access.membership) return;

  await db
    .delete(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id)));
  await campaignLog(campaignId, user.id, "memberLeft");
  revalidatePath(`/c/${campaignId}`);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Retire the invite code — the answer to a code that leaked. The old one stops
 * working the moment this lands; anyone already at the table stays. The new
 * code is never written to the feed, since the feed is a list the DM shows
 * around.
 */
export async function rotateJoinCode(campaignId: string) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;

  // join_code is unique; with 32^6 codes a clash is a curiosity, but a
  // handful of tries costs nothing and keeps the action from failing loudly.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = joinCodeAlphabet();
    const clash = await db.query.campaigns.findFirst({ where: eq(campaigns.joinCode, code) });
    if (clash) continue;
    await db.update(campaigns).set({ joinCode: code }).where(eq(campaigns.id, campaignId));
    await campaignLog(campaignId, user.id, "joinCodeRotated");
    revalidatePath(`/c/${campaignId}`);
    return;
  }
}

// ---------- codex ----------

function parseCodexType(value: string): CodexType | null {
  return (CODEX_TYPES as readonly string[]).includes(value) ? (value as CodexType) : null;
}

export async function createCodexEntry(worldId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  // Chronicling the world is the DM's privilege (world owner or any
  // campaign DM in it); players read the codex, they don't write it.
  if (!(await hasDmPowers(worldId, user.id))) {
    return { error: t("errors.codex.dmOnlyEntries") };
  }

  const type = parseCodexType(str(formData, "type"));
  const title = str(formData, "title");
  if (!type) return { error: t("errors.codex.badType") };
  if (!title) return { error: t("errors.codex.titleRequired") };

  const visibility: "everyone" | "dm" = str(formData, "visibility") === "dm" ? "dm" : "everyone";

  const id = nanoid(12);
  const now = Date.now();
  await db.insert(codexEntries).values({
    id,
    worldId,
    type,
    title: cap(title, 150),
    body: cap(str(formData, "body"), 50_000),
    visibility,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  });
  redirect(`/w/${worldId}/codex/${id}`);
}

export async function updateCodexEntry(entryId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const entry = await db.query.codexEntries.findFirst({ where: eq(codexEntries.id, entryId) });
  if (!entry) return { error: t("errors.codex.entryNotFound") };
  if (!(await canEditEntry(entry, user.id))) return { error: t("errors.codex.cannotEdit") };

  const type = parseCodexType(str(formData, "type")) ?? entry.type;
  const title = str(formData, "title");
  if (!title) return { error: t("errors.codex.titleRequired") };

  let visibility: "everyone" | "dm" = str(formData, "visibility") === "dm" ? "dm" : "everyone";
  if (visibility === "dm" && !(await hasDmPowers(entry.worldId, user.id))) {
    visibility = entry.visibility;
  }

  await db
    .update(codexEntries)
    .set({
      type,
      title: cap(title, 150),
      body: cap(str(formData, "body"), 50_000),
      visibility,
      updatedAt: Date.now(),
    })
    .where(eq(codexEntries.id, entryId));
  revalidatePath(`/w/${entry.worldId}/codex/${entryId}`);
  revalidatePath(`/w/${entry.worldId}`);
  redirect(`/w/${entry.worldId}/codex/${entryId}`);
}

export async function deleteCodexEntry(entryId: string) {
  const user = await requireUser();
  const entry = await db.query.codexEntries.findFirst({ where: eq(codexEntries.id, entryId) });
  if (!entry) return;
  if (!(await canEditEntry(entry, user.id))) return;
  await db.delete(codexEntries).where(eq(codexEntries.id, entryId));
  revalidatePath(`/w/${entry.worldId}`);
  redirect(`/w/${entry.worldId}`);
}
