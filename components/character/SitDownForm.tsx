import { and, eq, isNotNull } from "drizzle-orm";
// Renamed on the way in: called plainly rather than through `.bind`, a server
// action whose name begins with "use" is a React hook as far as the linter can
// tell, and it is right to complain about one being called inside a closure.
import { useCharacterInCampaign as takeCharacterToCampaign } from "@/lib/character-actions";
import { db, campaigns, campaignMembers, characters } from "@/lib/db";
import type { T } from "@/lib/i18n";
import { Button, GhostButton, Label, Select } from "@/components/ui";

/** One adventure the player sits at, as the picker needs to name it. */
export type SittableCampaign = { id: string; name: string };

/**
 * Every table this player could sit a character down at.
 *
 * Membership is not the whole answer, and reading it as one is what left a DM
 * unable to bring their own character to their own game: the DM of a campaign
 * is deliberately *not* a member of it (see lib/perms.ts — the party list is
 * the players), while `useCharacterInCampaign` gates on `canParticipate`,
 * which is membership **or** the DM's chair. The picker offered a list the
 * action was happy to go beyond, so the door existed and nothing opened it.
 *
 * Two reads and a merge rather than a UNION: the overlap is a player who has
 * also been handed the DM's chair at a table they joined, which is one row to
 * de-duplicate, not a query to optimise.
 */
export async function loadSittableCampaigns(userId: string): Promise<SittableCampaign[]> {
  const [joined, running] = await Promise.all([
    db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, userId)),
    db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.dmUserId, userId)),
  ]);
  const byId = new Map<string, SittableCampaign>();
  for (const campaign of [...joined, ...running]) byId.set(campaign.id, campaign);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which of those tables each roster character is already sitting at, keyed by
 * the master's id.
 *
 * A second copy of the same master at the same table is refused outright — by
 * the action, and under it by `characters_one_copy_per_campaign` — so offering
 * the campaign again is offering a button that cannot do anything. It is one
 * read for the whole hub rather than one per card, which is why it answers as
 * a lookup instead of a filtered list.
 */
export async function loadSeatsTaken(userId: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ origin: characters.originCharacterId, campaignId: characters.campaignId })
    .from(characters)
    .where(and(eq(characters.userId, userId), isNotNull(characters.originCharacterId)));
  const taken = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.origin || !row.campaignId) continue;
    const seats = taken.get(row.origin) ?? new Set<string>();
    seats.add(row.campaignId);
    taken.set(row.origin, seats);
  }
  return taken;
}

/** The tables one roster character has not been taken to yet. */
export function openSeats(
  sittable: readonly SittableCampaign[],
  taken: Map<string, Set<string>>,
  characterId: string
): SittableCampaign[] {
  const seats = taken.get(characterId);
  return seats ? sittable.filter((campaign) => !seats.has(campaign.id)) : [...sittable];
}

/**
 * "Take this one to a table" — the roster's only outward door.
 *
 * The picker exists rather than a button per adventure because the list is
 * every table this player sits at and reads as a choice, not as five separate
 * offers. `useCharacterInCampaign` takes its campaign as an argument rather
 * than off a form, so the choice is unwrapped here: one closure, one place,
 * used by both the hub's cards and the roster sheet itself.
 *
 * Nothing is trusted across that boundary — the action re-checks that the
 * character is the caller's, that it is still on the roster, and that they
 * actually sit at the campaign named. A second press is not a second copy
 * either: the action is idempotent and lands on the copy already made.
 */
export function SitDownForm({
  characterId,
  campaigns,
  t,
  compact = false,
}: {
  characterId: string;
  campaigns: readonly SittableCampaign[];
  t: T;
  /** The hub's cards carry this in a row of badges; the sheet gives it a card. */
  compact?: boolean;
}) {
  async function sitDown(formData: FormData) {
    "use server";
    const campaignId = formData.get("campaignId");
    if (typeof campaignId !== "string" || !campaignId) return;
    await takeCharacterToCampaign(characterId, campaignId);
  }

  const options = campaigns.map((campaign) => (
    <option key={campaign.id} value={campaign.id}>
      {campaign.name}
    </option>
  ));

  if (compact) {
    return (
      <form action={sitDown} className="flex items-center gap-2">
        <Select
          name="campaignId"
          aria-label={t("character.roster.sitCampaignLabel")}
          className="!w-44 min-h-11 !py-1 text-xs"
        >
          {options}
        </Select>
        <GhostButton type="submit" className="min-h-11 !px-3 !py-1 text-xs">
          {t("character.roster.sitButton")}
        </GhostButton>
      </form>
    );
  }

  return (
    <form action={sitDown} className="flex flex-wrap items-end gap-3">
      <label className="block min-w-44 flex-1">
        <Label>{t("character.roster.sitCampaignLabel")}</Label>
        <Select name="campaignId">{options}</Select>
      </label>
      <Button type="submit">{t("character.roster.sitButton")}</Button>
    </form>
  );
}
