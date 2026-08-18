"use client";

import { useState, type ComponentProps } from "react";
import { makeT, type Locale } from "@/lib/i18n";
import { Input } from "@/components/ui";
import { IconEye, IconEyeOff } from "@/components/Icons";

/**
 * A password field with the usual eye at its right edge. It is the ordinary
 * `Input` underneath — same frame, same focus ring — only with room made for
 * the button and `type` under local control. Everything else, `name`
 * included, passes straight through, so the server action on the other side
 * of the form never learns that this component exists.
 */
export function PasswordInput({
  locale,
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type"> & { locale: Locale }) {
  const t = makeT(locale);
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="relative block">
      <Input {...props} type={revealed ? "text" : "password"} className={`pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setRevealed((shown) => !shown)}
        aria-label={revealed ? t("auth.password.hide") : t("auth.password.show")}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-sm text-parchment-500 transition hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </span>
  );
}
