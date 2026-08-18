"use client";

import { useRef, useState, type FormEvent } from "react";
import { finalizeMapUpload, requestMapUpload } from "@/lib/map-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input, Label, Select } from "@/components/ui";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A map upload in three moves: ask the server where to put the file, PUT it
 * straight to storage, then tell the server to record it. The middle step is
 * the reason for the other two — a 10 MB body would never survive the trip
 * through a server action, so it skips the app server entirely.
 */
export function MapUploadForm({ campaignId, locale }: { campaignId: string; locale: Locale }) {
  const t = makeT(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // The form drives three separate requests, so it cannot be a plain POST.
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const file = fields.get("file");
    // Checked here as well as on the server: past this size the upload is
    // refused anyway, and finding that out early costs the user nothing.
    if (!(file instanceof File) || file.size === 0) return setError(t("errors.maps.noFile"));
    if (file.size > MAX_BYTES) return setError(t("errors.maps.tooLarge"));

    setError(undefined);
    setPending(true);
    try {
      const ask = new FormData();
      ask.set("type", file.type);
      ask.set("size", String(file.size));
      const granted = await requestMapUpload(campaignId, ask);
      if (!granted.ticket) return setError(granted.error ?? t("errors.maps.uploadFailed"));

      const stored = await fetch(granted.ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!stored.ok) return setError(t("errors.maps.uploadFailed"));

      const done = new FormData();
      done.set("fileName", granted.ticket.fileName);
      // The server never sees the file name, so the fallback title is worked
      // out here — same one the single-step upload used to derive.
      const typed = String(fields.get("title") ?? "").trim();
      done.set("title", typed || file.name.replace(/\.[^.]+$/, ""));
      done.set("visibility", String(fields.get("visibility") ?? "everyone"));
      const recorded = await finalizeMapUpload(campaignId, done);
      if (recorded.error) return setError(recorded.error);
      formRef.current?.reset();
    } catch {
      // A dropped connection mid-upload lands here; the wording is the same
      // either way, since there is nothing the DM can do but try again.
      setError(t("errors.maps.uploadFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
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
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? t("campaign.maps.uploading") : t("campaign.maps.upload")}
      </Button>
    </form>
  );
}
