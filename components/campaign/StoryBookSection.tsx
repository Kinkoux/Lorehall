import type { StoryBeat, StoryChapter } from "@/lib/db";
import {
  addBeat,
  addChapter,
  deleteBeat,
  deleteChapter,
  moveBeatToChapter,
  renameChapter,
  setBeatStatus,
} from "@/lib/beat-actions";
import type { T } from "@/lib/i18n";
import { IconBookmark, IconDie, IconX } from "@/components/Icons";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  Button,
  Card,
  Input,
  Label,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui";
import { SmallButton } from "./shared";

export function StoryBookSection({
  beats,
  chapters,
  campaignId,
  t,
}: {
  beats: StoryBeat[];
  chapters: StoryChapter[];
  campaignId: string;
  t: T;
}) {
  // Story book: chapters in order, then whatever never got filed into one.
  const plotBeats = beats.filter((b) => b.kind === "plot");
  const unfiledBeats = beats.filter((b) => !b.chapterId);
  const bookGroups: { chapter: StoryChapter | null; beats: StoryBeat[] }[] = [
    ...chapters.map((chapter) => ({
      chapter,
      beats: beats.filter((b) => b.chapterId === chapter.id),
    })),
    ...(unfiledBeats.length > 0 ? [{ chapter: null, beats: unfiledBeats }] : []),
  ];

  return (
    <section id="story-book" className="mt-10 scroll-mt-28 space-y-4">
      <SectionTitle>{t("campaign.beats.title")}</SectionTitle>
      <p className="-mt-2 text-xs text-parchment-500">{t("campaign.beats.hint")}</p>

      {plotBeats.length > 0 && (
        <Card className="!py-3">
          <Label>{t("campaign.beats.plotStrip")}</Label>
          <ul className="flex flex-wrap gap-1.5">
            {plotBeats.map((beat) => (
              <li
                key={beat.id}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold ${
                  beat.status === "current"
                    ? "border-gold-500 bg-gold-500/10 text-gold-300"
                    : beat.status === "done"
                      ? "border-ink-700 text-parchment-500 line-through"
                      : "border-ink-600 text-parchment-500"
                }`}
              >
                <IconBookmark size={12} className="shrink-0" />
                {beat.title}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {bookGroups.map((group) => (
        <details
          key={group.chapter?.id ?? "unfiled"}
          open
          className="rounded-sm border border-ink-700 bg-ink-900/40 px-4 py-3"
        >
          <summary className="cursor-pointer font-display text-sm font-bold uppercase tracking-[0.14em] text-gold-300 hover:text-gold-200">
            {group.chapter ? group.chapter.title : t("campaign.beats.unfiled")}
            <span className="ml-2 text-[11px] font-semibold normal-case tracking-normal text-parchment-500">
              {group.beats.length === 1
                ? t("campaign.beats.countOne", { n: group.beats.length })
                : t("campaign.beats.countMany", { n: group.beats.length })}
            </span>
          </summary>

          <div className="mt-3 space-y-3">
            {group.beats.map((beat) => (
              <Card
                key={beat.id}
                className={`py-4 ${beat.kind === "plot" ? "border-l-2 !border-l-gold-500 " : ""}${
                  beat.status === "current"
                    ? "border-gold-500 bg-ink-800"
                    : beat.status === "done"
                      ? "opacity-60"
                      : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-display text-lg font-bold text-gold-400">
                    {beat.status === "done" ? "✓" : beat.status === "current" ? "▶" : "•"}
                  </span>
                  <div className="flex-1">
                    <h3 className="flex items-center gap-2 font-display text-base font-bold text-parchment-100">
                      {beat.kind === "plot" && (
                        <IconBookmark
                          size={14}
                          className="shrink-0 text-gold-400"
                          aria-label={t("campaign.beats.plotPoint")}
                        />
                      )}
                      <span className="min-w-0">{beat.title}</span>
                    </h3>
                    {beat.narrative && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
                        {beat.narrative}
                      </p>
                    )}
                    {beat.rollNote && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded border border-blood-500/50 bg-blood-500/10 px-2 py-0.5 text-xs font-bold text-blood-400">
                        <IconDie size={14} /> {beat.rollNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {beat.status !== "current" && (
                      <form action={setBeatStatus.bind(null, beat.id, "current")}>
                        <SmallButton label={t("campaign.beats.play")} />
                      </form>
                    )}
                    {beat.status !== "done" && (
                      <form action={setBeatStatus.bind(null, beat.id, "done")}>
                        <SmallButton label={t("campaign.beats.done")} />
                      </form>
                    )}
                    {beat.status === "done" && (
                      <form action={setBeatStatus.bind(null, beat.id, "pending")}>
                        <SmallButton label={t("campaign.beats.reset")} />
                      </form>
                    )}
                    <ConfirmButton
                      label={<IconX size={12} />}
                      confirmLabel={t("common.confirm.yesDelete")}
                      warnText={t("common.confirm.areYouSure")}
                      action={deleteBeat.bind(null, beat.id)}
                      danger
                      group="story-delete"
                      ariaLabel={t("common.delete")}
                    />
                  </div>
                </div>

                {chapters.length > 0 && (
                  <form
                    action={moveBeatToChapter.bind(null, beat.id)}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3"
                  >
                    <Select
                      name="chapterId"
                      defaultValue={beat.chapterId ?? ""}
                      title={t("campaign.beats.moveTitle")}
                      aria-label={t("campaign.beats.moveTitle")}
                      className="!w-auto min-w-40 !py-1 text-xs"
                    >
                      <option value="">{t("campaign.beats.noChapter")}</option>
                      {chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.title}
                        </option>
                      ))}
                    </Select>
                    <SmallButton label={t("campaign.beats.move")} />
                  </form>
                )}
              </Card>
            ))}
          </div>

          {group.chapter && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
              <form
                action={renameChapter.bind(null, group.chapter.id)}
                className="flex min-w-56 flex-1 items-center gap-1.5"
              >
                <Input
                  name="title"
                  required
                  defaultValue={group.chapter.title}
                  aria-label={t("campaign.beats.renameChapter")}
                  className="!py-1 text-xs"
                />
                <SmallButton label={t("campaign.beats.renameChapter")} />
              </form>
              <ConfirmButton
                label={t("campaign.beats.deleteChapter")}
                confirmLabel={t("common.confirm.yesDelete")}
                warnText={t("common.confirm.areYouSure")}
                action={deleteChapter.bind(null, group.chapter.id)}
                danger
                group="story-delete"
                ariaLabel={t("campaign.beats.deleteChapter")}
              />
            </div>
          )}
        </details>
      ))}

      <Card>
        <h3 className="mb-3 font-display text-base text-gold-300">
          {t("campaign.beats.addHeading")}
        </h3>
        <form action={addBeat.bind(null, campaignId)} className="space-y-3">
          <label className="block">
            <Label>{t("campaign.beats.sceneTitle")}</Label>
            <Input name="title" required placeholder={t("campaign.beats.scenePh")} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Label>{t("campaign.beats.chapterLabel")}</Label>
              <Select name="chapterId" defaultValue="">
                <option value="">{t("campaign.beats.noChapter")}</option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <Label>{t("campaign.beats.kindLabel")}</Label>
              <Select name="kind" defaultValue="scene">
                <option value="scene">{t("campaign.beats.kindScene")}</option>
                <option value="plot">{t("campaign.beats.kindPlot")}</option>
              </Select>
            </label>
          </div>
          <label className="block">
            <Label>{t("campaign.beats.narration")}</Label>
            <Textarea
              name="narrative"
              rows={3}
              placeholder={t("campaign.beats.narrationPh")}
            />
          </label>
          <label className="block">
            <Label>{t("campaign.beats.rollNote")}</Label>
            <Input name="rollNote" placeholder={t("campaign.beats.rollPh")} />
          </label>
          <Button type="submit">{t("campaign.beats.addButton")}</Button>
        </form>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base text-gold-300">
          {t("campaign.beats.addChapterHeading")}
        </h3>
        <form action={addChapter.bind(null, campaignId)} className="flex gap-2">
          <Input name="title" required placeholder={t("campaign.beats.chapterPh")} />
          <Button type="submit" className="shrink-0">
            {t("campaign.beats.addChapter")}
          </Button>
        </form>
        <p className="mt-2 text-xs text-parchment-500">{t("campaign.beats.chapterHint")}</p>
      </Card>
    </section>
  );
}
