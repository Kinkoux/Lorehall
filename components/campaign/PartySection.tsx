import Link from "next/link";
import { campaignMembers, type Character, type User } from "@/lib/db";
import { kickMember, leaveCampaign, readdMember } from "@/lib/actions";
import { approveCharacter, rejectCharacter } from "@/lib/character-actions";
import { hasScores, statBlock } from "@/lib/dnd";
import type { StatBonuses } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import { classArtThumbFor } from "@/lib/ui-art";
import { IconSkull } from "@/components/Icons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Portrait, portraitSrc, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

type MemberRow = { member: typeof campaignMembers.$inferSelect; user: User };

export function PartySection({
  members,
  campaignCharacters,
  formerUsers = [],
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
   * People with a sheet at this table but no membership row — removed, or
   * gone of their own accord. The page works them out from the two lists it
   * already loads; only the DM is ever handed any.
   */
  formerUsers?: User[];
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
    /*
      A stray tap used to be the whole ceremony. Now the knob only unfolds:
      inside is what removal does and does not touch, and a second, separate
      press is the one that lands. Closing the fold is the way out, so there
      is nothing to cancel and no script behind any of it — the shared
      confirmation every destructive knob on this page now wears, sharing a
      name so opening one closes the last.
    */
    return (
      <ConfirmButton
        label={t("campaign.party.remove")}
        confirmLabel={t("campaign.party.removeConfirm")}
        warnText={t("campaign.party.removeWarn")}
        action={kickMember.bind(null, campaignId)}
        danger
        group="party-remove"
        ariaLabel={t("campaign.party.removeTitle", { name })}
      >
        <input type="hidden" name="userId" value={memberId} />
      </ConfirmButton>
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
                      {/* The 96px cut. A party row draws the portrait 40px
                          across — 80 on a doubled screen — and a class plate
                          only appears here when nobody uploaded a face, so a
                          table of six could otherwise pull six full 512px
                          plates to fill six thumbnails. */}
                      <Portrait
                        src={portraitSrc(character.id, character.imageFile)}
                        alt={character.name}
                        size={40}
                        fallbackSrc={classArtThumbFor(character.klass)}
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
        {isDm && formerUsers.length > 0 && (
          <div className="mt-4 border-t border-ink-700 pt-3">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-parchment-300">
              {t("campaign.party.formerTitle")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {formerUsers.map((formerUser) => {
                const formerName = formerUser.displayName ?? formerUser.username;
                const sheets = charactersOf(formerUser.id)
                  .map((c) => c.name)
                  .join(", ");
                return (
                  <li key={formerUser.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 text-xs text-parchment-500">
                      <span className="font-semibold text-parchment-300">{formerName}</span>
                      {sheets && ` · ${sheets}`}
                    </span>
                    <form action={readdMember.bind(null, campaignId)} className="shrink-0">
                      <input type="hidden" name="userId" value={formerUser.id} />
                      <SmallButton
                        label={t("campaign.party.readd")}
                        ariaLabel={t("campaign.party.readdTitle", { name: formerName })}
                      />
                    </form>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-parchment-500">{t("campaign.party.formerHint")}</p>
          </div>
        )}
        <p className="mt-4 border-t border-ink-700 pt-3 text-xs text-parchment-500">
          {t("campaign.party.hint")}
        </p>
      </Card>
    </>
  );
}
