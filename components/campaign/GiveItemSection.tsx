import { campaignMembers, type Character, type User } from "@/lib/db";
import type { Locale, T } from "@/lib/i18n";
import { Card, SectionTitle } from "@/components/ui";
import { GiveItemForm, type GiveItemTarget } from "./GiveItemForm";

type MemberRow = { member: typeof campaignMembers.$inferSelect; user: User };

/**
 * The four columns the picker reads. Stated as a slice rather than a whole
 * `Character` so a caller on a hot path — the session page, re-queried every
 * three seconds — can ask the database for four fields instead of twenty-six.
 */
export type GiveItemCharacter = Pick<Character, "id" | "name" | "userId" | "approval">;

/**
 * The DM's "hand it over" panel, next to the encounters they prepped.
 *
 * Only approved sheets are offered, because only those are ones the action
 * will write to — a select listing a character the server would refuse is a
 * button that does nothing. A table with no approved characters yet has
 * nothing to hand anything to, so the section does not render at all rather
 * than showing an empty picker.
 */
export function GiveItemSection({
  members,
  campaignCharacters,
  campaignId,
  locale,
  t,
}: {
  members: MemberRow[];
  campaignCharacters: GiveItemCharacter[];
  campaignId: string;
  locale: Locale;
  t: T;
}) {
  const playerNames = new Map(
    members.map(({ user }) => [user.id, user.displayName ?? user.username] as const)
  );
  const targets: GiveItemTarget[] = campaignCharacters
    .filter((character) => character.approval === "approved")
    .map((character) => {
      // The DM's own sheet, if they keep one, has no membership row to name —
      // the character's own name is answer enough there.
      const player = playerNames.get(character.userId);
      return {
        id: character.id,
        label: player ? `${character.name} · ${player}` : character.name,
      };
    });
  if (targets.length === 0) return null;

  return (
    <section id="give-item" className="mt-10 scroll-mt-28 space-y-4">
      <SectionTitle>{t("campaign.giveItem.title")}</SectionTitle>
      <p className="-mt-2 text-xs text-parchment-500">{t("campaign.giveItem.hint")}</p>
      <Card>
        <GiveItemForm campaignId={campaignId} targets={targets} locale={locale} />
      </Card>
    </section>
  );
}
