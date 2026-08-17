"use client";

import { useActionState } from "react";
import { joinCampaign, type FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input } from "@/components/ui";

export function JoinCampaignForm({ locale }: { locale: Locale }) {
  const t = makeT(locale);
  const [state, action, pending] = useActionState<FormState, FormData>(joinCampaign, {});

  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <Input
          name="code"
          placeholder={t("dashboard.joinForm.codePh")}
          className="uppercase tracking-widest"
          maxLength={6}
          required
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? t("dashboard.joinForm.joining") : t("dashboard.joinForm.join")}
        </Button>
      </div>
      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}
