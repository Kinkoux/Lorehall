"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { customAlphabet, nanoid } from "nanoid";
import {
  db,
  users,
  worlds,
  worldMembers,
  campaigns,
  campaignMembers,
  codexEntries,
  CODEX_TYPES,
  type CodexType,
} from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { canEditEntry, getWorldMembership, hasDmPowers } from "@/lib/perms";
import { getT } from "@/lib/locale";

export type FormState = { error?: string };

const joinCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------- auth ----------

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = str(formData, "username").toLowerCase();
  const displayName = str(formData, "displayName");
  const password = formData.get("password");

  const { t } = await getT();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: t("errors.auth.usernameFormat") };
  }
  if (typeof password !== "string" || password.length < 6) {
    return { error: t("errors.auth.passwordTooShort") };
  }
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) return { error: t("errors.auth.usernameTaken") };

  const id = nanoid(12);
  await db.insert(users).values({
    id,
    username,
    displayName: displayName || username,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: Date.now(),
  });
  await createSession(id);
  redirect("/dashboard");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = str(formData, "username").toLowerCase();
  const password = formData.get("password");
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user || typeof password !== "string" || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: (await getT()).t("errors.auth.badCredentials") };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---------- worlds ----------

export async function createWorld(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return;
  const id = nanoid(12);
  const now = Date.now();
  await db.insert(worlds).values({
    id,
    name,
    description: str(formData, "description") || null,
    ownerId: user.id,
    createdAt: now,
  });
  await db.insert(worldMembers).values({
    worldId: id,
    userId: user.id,
    role: "owner",
    joinedAt: now,
  });
  redirect(`/w/${id}`);
}

// ---------- campaigns ----------

export async function createCampaign(worldId: string, formData: FormData) {
  const user = await requireUser();
  const membership = await getWorldMembership(worldId, user.id);
  if (!membership) return;
  const name = str(formData, "name");
  if (!name) return;
  const id = nanoid(12);
  const now = Date.now();
  await db.insert(campaigns).values({
    id,
    worldId,
    name,
    description: str(formData, "description") || null,
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
  const code = str(formData, "code").toUpperCase();
  if (!code) return { error: (await getT()).t("errors.join.emptyCode") };

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.joinCode, code) });
  if (!campaign) return { error: (await getT()).t("errors.join.notFound") };

  const now = Date.now();
  const alreadyIn = await db.query.campaignMembers.findFirst({
    where: and(eq(campaignMembers.campaignId, campaign.id), eq(campaignMembers.userId, user.id)),
  });
  if (!alreadyIn) {
    await db.insert(campaignMembers).values({
      campaignId: campaign.id,
      userId: user.id,
      joinedAt: now,
    });
  }
  const inWorld = await getWorldMembership(campaign.worldId, user.id);
  if (!inWorld) {
    await db.insert(worldMembers).values({
      worldId: campaign.worldId,
      userId: user.id,
      role: "member",
      joinedAt: now,
    });
  }
  redirect(`/c/${campaign.id}`);
}

export async function setCharacterName(campaignId: string, formData: FormData) {
  const user = await requireUser();
  await db
    .update(campaignMembers)
    .set({ characterName: str(formData, "characterName") || null })
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id)));
  revalidatePath(`/c/${campaignId}`);
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
    title,
    body: str(formData, "body"),
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
    .set({ type, title, body: str(formData, "body"), visibility, updatedAt: Date.now() })
    .where(eq(codexEntries.id, entryId));
  revalidatePath(`/w/${entry.worldId}/codex/${entryId}`);
  redirect(`/w/${entry.worldId}/codex/${entryId}`);
}

export async function deleteCodexEntry(entryId: string) {
  const user = await requireUser();
  const entry = await db.query.codexEntries.findFirst({ where: eq(codexEntries.id, entryId) });
  if (!entry) return;
  if (!(await canEditEntry(entry, user.id))) return;
  await db.delete(codexEntries).where(eq(codexEntries.id, entryId));
  redirect(`/w/${entry.worldId}`);
}
