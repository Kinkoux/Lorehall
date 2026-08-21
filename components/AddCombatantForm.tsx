"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { addCombatant } from "@/lib/session-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input, Label } from "@/components/ui";

export function AddCombatantForm({ sessionId, locale }: { sessionId: string; locale: Locale }) {
  const t = makeT(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await addCombatant(sessionId, prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {}
  );

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <label className="block">
          <Label>{t("session.add.name")}</Label>
          {/* min-h-11: the table's own hands are on this form mid-fight, and a
              36px box is one a thumb misses. */}
          <Input
            name="name"
            required
            placeholder={t("session.add.namePlaceholder")}
            className="min-h-11"
          />
        </label>
        <label className="block">
          <Label>{t("session.add.init")}</Label>
          <Input name="initiative" type="number" required min={-10} max={50} className="min-h-11" />
        </label>
        <label className="block">
          <Label>HP</Label>
          <Input name="maxHp" type="number" min={0} max={9999} placeholder="—" className="min-h-11" />
        </label>
      </div>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? t("session.add.adding") : t("session.add.title")}
      </Button>
    </form>
  );
}
