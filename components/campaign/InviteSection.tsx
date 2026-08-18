import { rotateJoinCode } from "@/lib/actions";
import type { T } from "@/lib/i18n";
import { Card, Label, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

export function InviteSection({
  joinCode,
  campaignId,
  isDm,
  t,
}: {
  joinCode: string;
  campaignId: string;
  isDm: boolean;
  t: T;
}) {
  return (
    <>
      <SectionTitle>{t("campaign.invite.title")}</SectionTitle>
      <Card>
        <Label>{t("campaign.invite.code")}</Label>
        <p className="font-mono text-3xl font-bold tracking-[0.3em] text-gold-400">
          {joinCode}
        </p>
        <p className="mt-2 text-xs text-parchment-500">{t("campaign.invite.hint")}</p>
        {isDm && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
            <form action={rotateJoinCode.bind(null, campaignId)}>
              <SmallButton label={t("campaign.invite.rotate")} />
            </form>
            <p className="min-w-0 flex-1 text-xs text-parchment-500">
              {t("campaign.invite.rotateHint")}
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
