import { revalidatePath } from "next/cache";
import { campaignLog, type CampaignEventKey } from "@/lib/campaign-log";

/**
 * What a write to a character sheet has to say afterwards: which pages went
 * stale, and what the campaign's feed should remember.
 *
 * A plain module rather than a second copy in every action file. The rule had
 * been written twice — once in lib/character-actions.ts and once, already
 * drifted, in lib/compendium-actions.ts, whose version refreshed neither the
 * hub nor the campaign page — on the belief that a "use server" module cannot
 * export anything but async functions and therefore cannot be shared from. It
 * can be *imported* from, which is all this needs: lib/campaign-log.ts,
 * lib/perms.ts and lib/armor.ts are the same kind of ordinary module, reached
 * by actions and pages alike.
 */

/**
 * The three columns every sheet write needs to know where a sheet lives.
 * `campaignId` is NULL for a roster character — one its player keeps outside
 * any campaign — and that single NULL is what the helpers below fork on.
 */
export type SheetRef = { id: string; campaignId: string | null; userId: string };

/**
 * Where a sheet is read, and therefore what a write to it has to refresh.
 *
 * A roster character has no campaign pages to invalidate — building them would
 * revalidate the literal string "/c/null" — so its neighbourhood is its own
 * page and the hub that lists it. A sheet at a table keeps the three it always
 * had: itself, the campaign page whose party numbers are computed from what it
 * wears, and the hub.
 *
 * The sheet's own page is always first, which is what `revalidateSheetOnly`
 * below reads.
 */
export function sheetPaths(character: SheetRef): string[] {
  if (!character.campaignId) return [`/characters/${character.id}`, "/characters"];
  return [
    `/c/${character.campaignId}/ch/${character.userId}`,
    `/c/${character.campaignId}`,
    "/characters",
  ];
}

/**
 * "This character's derived numbers changed" — one write, every page that
 * reads them. The hub and the party list both print an armour class and a
 * passive Perception computed from what the sheet is wearing, so anything that
 * can move those has to reach further than the sheet itself.
 */
export function revalidateSheet(character: SheetRef) {
  for (const path of sheetPaths(character)) revalidatePath(path);
}

/**
 * "This page changed" — and only this page.
 *
 * The narrower half of the same question, for the writes that happen many
 * times an evening and move nothing anyone reads elsewhere: a torch counted
 * down, a spell slot spent, a class's suggested table filled in. Neither the
 * hub nor the party list shows any of that, and revalidating three paths per
 * press would throw away two caches an evening's play keeps warm.
 */
export function revalidateSheetOnly(character: SheetRef) {
  revalidatePath(sheetPaths(character)[0]);
}

/**
 * The feed line a sheet write leaves behind — when there is a feed to leave it
 * in. A roster character sits in no campaign's history, and the events table
 * names a campaign in a column that cannot be NULL, so the entry is not
 * attempted rather than attempted and swallowed.
 */
export async function logSheet(
  character: SheetRef,
  actorId: string,
  k: CampaignEventKey,
  p?: Record<string, string | number>
) {
  if (!character.campaignId) return;
  await campaignLog(character.campaignId, actorId, k, p);
}
