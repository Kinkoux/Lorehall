"use client";

import { useActionState } from "react";
import { createCodexEntry, updateCodexEntry, type FormState } from "@/lib/actions";
import { CODEX_TYPES, type CodexEntry } from "@/lib/db/schema";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input, Label, Select, Textarea } from "@/components/ui";

type Props = {
  worldId: string;
  entry?: Pick<CodexEntry, "id" | "type" | "title" | "body" | "visibility">;
  canSetDmOnly: boolean;
  locale: Locale;
};

export function CodexEntryForm({ worldId, entry, canSetDmOnly, locale }: Props) {
  const t = makeT(locale);
  const action = entry
    ? updateCodexEntry.bind(null, entry.id)
    : createCodexEntry.bind(null, worldId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label>{t("world.form.type")}</Label>
          <Select name="type" defaultValue={entry?.type ?? "npc"}>
            {CODEX_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`world.codex.types.${type}`)}
              </option>
            ))}
          </Select>
        </label>
        {canSetDmOnly && (
          <label className="block">
            <Label>{t("world.form.visibility")}</Label>
            <Select name="visibility" defaultValue={entry?.visibility ?? "everyone"}>
              <option value="everyone">{t("world.form.everyone")}</option>
              <option value="dm">{t("world.form.dmOnly")}</option>
            </Select>
          </label>
        )}
      </div>
      <label className="block">
        <Label>{t("world.form.title")}</Label>
        <Input name="title" required defaultValue={entry?.title} placeholder={t("world.form.titlePh")} />
      </label>
      <label className="block">
        <Label>{t("world.form.details")}</Label>
        <Textarea
          name="body"
          rows={10}
          defaultValue={entry?.body}
          placeholder={t("world.form.detailsPh")}
        />
      </label>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending
          ? t("world.form.inscribing")
          : entry
            ? t("world.form.saveChanges")
            : t("world.form.addToCodex")}
      </Button>
    </form>
  );
}
