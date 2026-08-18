"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { removePortrait, uploadPortrait } from "@/lib/character-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, GhostButton, Label } from "@/components/ui";
import { IconX } from "@/components/Icons";

const MAX_BYTES = 4 * 1024 * 1024;

export function PortraitUploadForm({
  characterId,
  hasPortrait,
  locale,
}: {
  characterId: string;
  hasPortrait: boolean;
  locale: Locale;
}) {
  const t = makeT(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      // Pre-check the size client-side; past the action body limit the server
      // would reject the whole request with an opaque error.
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0)
        return { error: t("errors.portrait.noFile") };
      if (file.size > MAX_BYTES) return { error: t("errors.portrait.tooLarge") };
      const result = await uploadPortrait(characterId, prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {}
  );

  return (
    <div className="space-y-2">
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-52 flex-1">
          <Label>{t("character.sheet.portrait.label")}</Label>
          <input
            type="file"
            name="file"
            required
            accept="image/png,image/jpeg,image/webp"
            className="w-full cursor-pointer rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-300 file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-gold-500 file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink-900"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? t("character.sheet.portrait.uploading") : t("character.sheet.portrait.upload")}
        </Button>
      </form>
      {hasPortrait && (
        <form action={removePortrait.bind(null, characterId)}>
          <GhostButton type="submit" className="!px-3 !py-1.5 text-xs">
            <IconX size={14} />
            {t("character.sheet.portrait.remove")}
          </GhostButton>
        </form>
      )}
      <ErrorText>{state.error}</ErrorText>
      <p className="text-xs text-parchment-500">{t("character.sheet.portrait.hint")}</p>
    </div>
  );
}
