"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { uploadMap } from "@/lib/map-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input, Label, Select } from "@/components/ui";

const MAX_BYTES = 10 * 1024 * 1024;

export function MapUploadForm({ campaignId, locale }: { campaignId: string; locale: Locale }) {
  const t = makeT(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      // Pre-check the size client-side; past the action body limit the server
      // would reject the whole request with an opaque error.
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) return { error: t("errors.maps.noFile") };
      if (file.size > MAX_BYTES) return { error: t("errors.maps.tooLarge") };
      const result = await uploadMap(campaignId, prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {}
  );

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <Label>{t("campaign.maps.titleLabel")}</Label>
          <Input name="title" placeholder={t("campaign.maps.titlePh")} />
        </label>
        <label className="block">
          <Label>{t("campaign.maps.visibilityLabel")}</Label>
          <Select name="visibility" defaultValue="everyone">
            <option value="everyone">{t("campaign.maps.visEveryone")}</option>
            <option value="dm">{t("campaign.maps.visDm")}</option>
          </Select>
        </label>
      </div>
      <label className="block">
        <Label>{t("campaign.maps.fileLabel")}</Label>
        <input
          type="file"
          name="file"
          required
          accept="image/png,image/jpeg,image/webp"
          className="w-full cursor-pointer rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-300 file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-gold-500 file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink-900"
        />
      </label>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? t("campaign.maps.uploading") : t("campaign.maps.upload")}
      </Button>
    </form>
  );
}
