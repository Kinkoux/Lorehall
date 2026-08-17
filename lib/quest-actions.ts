"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, quests, partyLedger, partyItems } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";

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

// ---------- quest log (DM manages, everyone reads) ----------

export async function addQuest(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const title = str(formData, "title");
  if (!title) return;
  await db.insert(quests).values({
    id: nanoid(12),
    campaignId,
    title,
    description: str(formData, "description") || null,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function setQuestStatus(questId: string, status: "active" | "done" | "failed") {
  const user = await requireUser();
  const quest = await db.query.quests.findFirst({ where: eq(quests.id, questId) });
  if (!quest) return;
  const access = await getCampaignAccess(quest.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(quests).set({ status }).where(eq(quests.id, questId));
  revalidatePath(`/c/${quest.campaignId}`);
}

export async function deleteQuest(questId: string) {
  const user = await requireUser();
  const quest = await db.query.quests.findFirst({ where: eq(quests.id, questId) });
  if (!quest) return;
  const access = await getCampaignAccess(quest.campaignId, user.id);
  if (!access?.isDm) return;
  await db.delete(quests).where(eq(quests.id, questId));
  revalidatePath(`/c/${quest.campaignId}`);
}

// ---------- party treasury (any member) ----------

export async function addLedgerEntry(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) return;
  const amount = int(formData, "amount");
  const reason = str(formData, "reason");
  if (amount === null || amount === 0 || !reason) return;
  await db.insert(partyLedger).values({
    id: nanoid(12),
    campaignId,
    amount: Math.max(-1_000_000, Math.min(1_000_000, amount)),
    reason,
    userId: user.id,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function addPartyItem(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) return;
  const name = str(formData, "name");
  if (!name) return;
  await db.insert(partyItems).values({
    id: nanoid(12),
    campaignId,
    name,
    qty: Math.min(Math.max(int(formData, "qty") ?? 1, 1), 9999),
    notes: str(formData, "notes") || null,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function adjustPartyItemQty(itemId: string, delta: number) {
  const user = await requireUser();
  const item = await db.query.partyItems.findFirst({ where: eq(partyItems.id, itemId) });
  if (!item) return;
  const access = await getCampaignAccess(item.campaignId, user.id);
  if (!access?.canView) return;
  const qty = item.qty + delta;
  if (qty <= 0) {
    await db.delete(partyItems).where(eq(partyItems.id, itemId));
  } else {
    await db.update(partyItems).set({ qty: Math.min(qty, 9999) }).where(eq(partyItems.id, itemId));
  }
  revalidatePath(`/c/${item.campaignId}`);
}
