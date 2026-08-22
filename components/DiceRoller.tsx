"use client";

import { useState, useTransition } from "react";
import { rollDice, type RollResult } from "@/lib/session-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Input, Label } from "@/components/ui";

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceRoller({ sessionId, locale }: { sessionId: string; locale: Locale }) {
  const t = makeT(locale);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [last, setLast] = useState<RollResult | null>(null);
  const [pending, startTransition] = useTransition();

  function roll(sides: number) {
    const formData = new FormData();
    formData.set("sides", String(sides));
    formData.set("count", String(count));
    formData.set("modifier", String(modifier));
    startTransition(async () => {
      const result = await rollDice(sessionId, formData);
      // A refused roll (session closed under them) leaves the last one
      // standing rather than blanking the plate for no stated reason.
      if (result) setLast(result);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label className="block w-20">
          <Label>{t("session.dice.count")}</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </label>
        <label className="block w-24">
          <Label>{t("session.dice.modifier")}</Label>
          <Input
            type="number"
            min={-99}
            max={99}
            value={modifier}
            onChange={(e) => setModifier(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      {/* The number, struck large enough to read from across the table. It is
          in the log too, but the log is a scroll of everyone's rolls; this is
          the one this hand just made. */}
      {last && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-sm border border-gold-500/60 bg-ink-800/70 px-3 py-2 text-center transition-opacity ${
            pending ? "opacity-50" : ""
          }`}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-parchment-500">
            {last.notation}
          </p>
          <p className="font-display text-4xl font-bold leading-tight text-gold-300">
            {last.total}
          </p>
          {last.rolls.length > 1 && (
            <p className="font-mono text-xs text-parchment-500">[{last.rolls.join(", ")}]</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => roll(sides)}
            disabled={pending}
            className="rounded-md border border-ink-600 px-2 py-2 text-sm font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 disabled:opacity-50 cursor-pointer"
          >
            d{sides}
          </button>
        ))}
      </div>
    </div>
  );
}
