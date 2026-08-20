import type { Quest } from "@/lib/db";
import { addQuest, deleteQuest, setQuestStatus } from "@/lib/quest-actions";
import type { Locale, T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { IconScroll, IconX } from "@/components/Icons";
import {
  Button,
  Card,
  Input,
  QuestStatusBadge,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import { SmallButton } from "./shared";

export function QuestsSection({
  quests,
  campaignId,
  isDm,
  locale,
  t,
}: {
  quests: Quest[];
  campaignId: string;
  isDm: boolean;
  locale: Locale;
  t: T;
}) {
  const activeQuests = quests.filter((q) => q.status === "active");
  const closedQuests = quests.filter((q) => q.status !== "active");

  return (
    <>
      <SectionTitle>{t("campaign.quests.title")}</SectionTitle>
      {activeQuests.length === 0 && closedQuests.length === 0 && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMPTY_ART.quests}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto mb-3 w-24 opacity-70"
          />
          <p className="text-sm text-parchment-500">
            {isDm ? t("campaign.quests.emptyDm") : t("campaign.quests.empty")}
          </p>
        </div>
      )}
      {activeQuests.map((quest) => (
        <Card key={quest.id} className="border-l-2 !border-l-gold-500 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-display text-base font-bold text-parchment-100">
                <IconScroll size={15} className="shrink-0 text-gold-400" />
                <span className="min-w-0">{quest.title}</span>
                <QuestStatusBadge status="active" label={t("campaign.quests.stActive")} />
              </h3>
              {quest.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-parchment-300">
                  {quest.description}
                </p>
              )}
              <p className="mt-1 text-[11px] text-parchment-500">
                {new Date(quest.createdAt).toLocaleDateString(
                  locale === "tr" ? "tr-TR" : "en-GB"
                )}
              </p>
            </div>
            {isDm && (
              <span className="flex shrink-0 gap-1">
                <form action={setQuestStatus.bind(null, quest.id, "done")}>
                  <SmallButton label={t("campaign.quests.done")} tone="success" />
                </form>
                <form action={setQuestStatus.bind(null, quest.id, "failed")}>
                  <SmallButton label={t("campaign.quests.failed")} danger />
                </form>
                <form action={deleteQuest.bind(null, quest.id)}>
                  <SmallButton
                    label={<IconX size={12} />}
                    danger
                    ariaLabel={t("campaign.quests.delete")}
                  />
                </form>
              </span>
            )}
          </div>
        </Card>
      ))}
      {closedQuests.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-parchment-500 hover:text-gold-300">
            {closedQuests.length > 1
              ? t("campaign.quests.closedMany", { n: closedQuests.length })
              : t("campaign.quests.closedOne", { n: closedQuests.length })}
          </summary>
          <div className="mt-2 space-y-2">
            {closedQuests.map((quest) => (
              <Card key={quest.id} className="py-3 opacity-70">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <QuestStatusBadge
                      status={quest.status === "done" ? "done" : "failed"}
                      label={
                        quest.status === "done"
                          ? t("campaign.quests.stDone")
                          : t("campaign.quests.stFailed")
                      }
                    />
                    <span
                      className={
                        quest.status === "done"
                          ? "text-parchment-300"
                          : "text-parchment-500 line-through"
                      }
                    >
                      {quest.title}
                    </span>
                  </p>
                  {isDm && (
                    <form action={setQuestStatus.bind(null, quest.id, "active")}>
                      <SmallButton label={t("campaign.quests.reopen")} />
                    </form>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </details>
      )}
      {isDm && (
        <Card>
          <h3 className="mb-3 font-display text-base text-gold-300">
            {t("campaign.quests.addHeading")}
          </h3>
          <form action={addQuest.bind(null, campaignId)} className="space-y-2">
            <Input name="title" required placeholder={t("campaign.quests.titlePh")} />
            <Textarea
              name="description"
              rows={2}
              placeholder={t("campaign.quests.descPh")}
            />
            <Button type="submit">{t("campaign.quests.add")}</Button>
          </form>
        </Card>
      )}
    </>
  );
}
