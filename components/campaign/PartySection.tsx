import Link from "next/link";
import { campaignMembers, type Character, type User } from "@/lib/db";
import { kickMember, leaveCampaign } from "@/lib/actions";
import { approveCharacter, rejectCharacter } from "@/lib/character-actions";
import { hasScores, statBlock } from "@/lib/dnd";
import type { StatBonuses } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import { classArtFor } from "@/lib/ui-art";
import { IconSkull } from "@/components/Icons";
import { Card, Portrait, portraitSrc, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

type MemberRow = { member: typeof campaignMembers.$inferSelect; user: User };

export function PartySection({
  members,
  campaignCharacters,
  wornBonuses,
  campaignId,
  dmUserId,
  currentUserId,
  isDm,
  t,
}: {
  members: MemberRow[];
  campaignCharacters: Character[];
  /**
   * What each sheet's equipped gear adds, keyed by character id — loaded once
   * for the whole party by the page. A passive Perception that ignored the
   * ring of +2 WIS the sheet itself counts would be the list quietly
   * contradicting the character it links to.
   */
  wornBonuses: ReadonlyMap<string, StatBonuses>;
  campaignId: string;
  dmUserId: string;
  currentUserId: string;
  isDm: boolean;
  t: T;
}) {
  // Approved characters show to everyone; pending ones only to the DM
  // (who approves) and their owner.
  const charactersOf = (userId: string) =>
    campaignCharacters.filter(
      (c) =>
        c.userId === userId && (c.approval === "approved" || isDm || userId === currentUserId)
    );
  /**
   * The knob at the end of a party row. The DM may show a player out; anyone
   * may see themselves out. The DM's own row carries neither — a table cannot
   * lose the person running it.
   */
  const memberKnob = (memberId: string, name: string) => {
    if (memberId === dmUserId) return null;
    if (memberId === currentUserId) {
      return (
        <form action={leaveCampaign.bind(null, campaignId)} className="shrink-0">
          <SmallButton
            label={t("campaign.party.leave")}
            danger
            ariaLabel={t("campaign.party.leaveTitle")}
          />
        </form>
      );
    }
    if (!isDm) return null;
    return (
      <form action={kickMember.bind(null, campaignId)} className="shrink-0">
        <input type="hidden" name="userId" value={memberId} />
        <SmallButton
          label={t("campaign.party.remove")}
          danger
          ariaLabel={t("campaign.party.removeTitle", { name })}
        />
      </form>
    );
  };

  return (
    <>
      <SectionTitle>{t("campaign.party.title")}</SectionTitle>
      <Card>
        <ul className="space-y-3">
          {members.map(({ member, user: memberUser }) => {
            const memberCharacters = charactersOf(memberUser.id);
            const memberName = memberUser.displayName ?? memberUser.username;
            const knob = memberKnob(memberUser.id, memberName);
            const memberLabel = (
              <p className="text-xs text-parchment-500">
                {memberName}
                {memberUser.id === dmUserId && ` · ${t("campaign.party.dm")}`}
              </p>
            );
            if (memberCharacters.length === 0) {
              return (
                <li key={memberUser.id} className="flex items-center gap-3">
                  <Link
                    href={`/c/${campaignId}/ch/${memberUser.id}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <Portrait src={null} alt="" size={40} />
                      <div>
                        <p className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                          {member.characterName ?? t("campaign.party.unnamed")}
                        </p>
                        {memberLabel}
                      </div>
                    </div>
                    <span className="text-parchment-500 transition group-hover:text-gold-400">
                      →
                    </span>
                  </Link>
                  {knob}
                </li>
              );
            }
            return (
              <li key={memberUser.id} className="space-y-1.5">
                {memberCharacters.map((character, ci) => {
                  const pp = hasScores(character)
                    ? statBlock(character, wornBonuses.get(character.id) ?? {})
                        .passivePerception
                    : null;
                  return (
                    <div key={character.id} className="flex items-center justify-between gap-3">
                      <Portrait
                        src={portraitSrc(character.id, character.imageFile)}
                        alt={character.name}
                        size={40}
                        fallbackSrc={classArtFor(character.klass)}
                      />
                      <Link
                        href={`/c/${campaignId}/ch/${memberUser.id}?ch=${character.id}`}
                        className="group min-w-0 flex-1"
                      >
                        <p className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                          {character.name}
                          <span className="ml-2 text-xs text-parchment-500">
                            {t("campaign.party.lv", { n: character.level })}
                          </span>
                          {character.status === "dead" && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-blood-500 bg-blood-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-blood-400">
                              <IconSkull size={11} />
                              {t("campaign.party.dead")}
                            </span>
                          )}
                          {character.approval === "pending" && (
                            <span className="ml-2 rounded-sm border border-gold-500 bg-gold-500/10 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-gold-300">
                              {t("campaign.party.pending")}
                            </span>
                          )}
                        </p>
                        {ci === 0 && memberLabel}
                      </Link>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {character.approval === "pending" && isDm ? (
                          <>
                            <form action={approveCharacter.bind(null, character.id)}>
                              <SmallButton label={t("campaign.party.approve")} tone="success" />
                            </form>
                            <form action={rejectCharacter.bind(null, character.id)}>
                              <SmallButton label={t("campaign.party.reject")} danger />
                            </form>
                          </>
                        ) : (
                          pp !== null && (
                            <span
                              title={t("campaign.party.passivePerception")}
                              className="rounded border border-gold-500/60 bg-gold-500/10 px-1.5 py-0.5 text-xs font-bold text-gold-300"
                            >
                              {t("campaign.party.pp", { n: pp })}
                            </span>
                          )
                        )}
                        {ci === 0 && knob}
                      </span>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 border-t border-ink-700 pt-3 text-xs text-parchment-500">
          {t("campaign.party.hint")}
        </p>
      </Card>
    </>
  );
}
