import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { CodexType } from "@/lib/db";
import { makeT, type Locale } from "@/lib/i18n";
import { IconHelm } from "@/components/Icons";

/**
 * Lorehall design language: a rubricated campaign ledger. Cards are "leaves"
 * with a double hairline frame; section headings are red rubrics with ledger
 * rules; gilt is reserved for primary actions and the brand.
 */

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Anchor target, for cards something elsewhere links straight to. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-sm border border-ink-600/80 bg-ink-900/85 p-5 outline outline-1 outline-ink-700/45 outline-offset-[-5px] shadow-sm shadow-[#5e4420]/10 ${className}`}
    >
      {children}
    </div>
  );
}

/** Rubric: small-caps vermilion heading with a trailing double ledger rule. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-base font-bold uppercase tracking-[0.18em] text-blood-400">
      <span className="shrink-0">{children}</span>
      <span aria-hidden className="h-[3px] flex-1 border-y border-ink-600/70" />
    </h2>
  );
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm bg-gold-500 px-4 py-2 text-sm font-bold text-ink-900 transition hover:bg-gold-400 active:translate-y-px disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-gold-400 cursor-pointer ${className}`}
    />
  );
}

export function GhostButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm border border-ink-600 px-4 py-2 text-sm font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 active:translate-y-px focus-visible:outline-2 focus-visible:outline-gold-400 cursor-pointer ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-100 placeholder:text-parchment-500 outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/30 ${className}`}
    />
  );
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-100 placeholder:text-parchment-500 outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/30 ${className}`}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`w-full rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-100 outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/30 ${className}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-parchment-500">
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-blood-400">{children}</p>;
}

/**
 * Where a character's face lives. The file name rides along as ?v= so the
 * immutable response is re-fetched after a re-upload; NULL means no portrait.
 */
export function portraitSrc(characterId: string, imageFile: string | null) {
  return imageFile ? `/files/portraits/${characterId}?v=${imageFile}` : null;
}

/**
 * Circular character portrait; falls back to a monoline helm when the sheet
 * has no image. `eager` skips lazy loading for the one above the fold.
 */
export function Portrait({
  src,
  alt,
  size,
  eager = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  size: number;
  eager?: boolean;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (!src) {
    return (
      <span
        aria-hidden
        style={box}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-950/70 text-parchment-500 ${className}`}
      >
        <IconHelm size={Math.round(size * 0.55)} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={box}
      loading={eager ? undefined : "lazy"}
      decoding="async"
      className={`shrink-0 rounded-full border border-ink-600 object-cover ${className}`}
    />
  );
}

const TYPE_STYLES: Record<CodexType, string> = {
  npc: "bg-sky-100 text-sky-900 border-sky-700/50",
  location: "bg-emerald-100 text-emerald-900 border-emerald-700/50",
  faction: "bg-purple-100 text-purple-900 border-purple-700/50",
  item: "bg-amber-100 text-amber-900 border-amber-700/50",
  lore: "bg-rose-100 text-rose-900 border-rose-700/50",
};

export function TypeBadge({ type, locale = "en" }: { type: CodexType; locale?: Locale }) {
  const t = makeT(locale);
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_STYLES[type]}`}>
      {t(`world.codex.types.${type}`)}
    </span>
  );
}

const QUEST_STATUS_STYLES = {
  active: "border-gold-500 bg-gold-500/10 text-gold-300",
  done: "border-emerald-700/60 bg-emerald-100/60 text-emerald-900",
  failed: "border-blood-500 bg-blood-500/15 text-blood-400",
} as const;

export function QuestStatusBadge({
  status,
  label,
}: {
  status: keyof typeof QUEST_STATUS_STYLES;
  label: string;
}) {
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${QUEST_STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

export function DmBadge({ label = "DM only" }: { label?: string }) {
  return (
    <span className="rounded-sm border border-blood-500 bg-blood-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blood-400">
      {label}
    </span>
  );
}

/** Style keys off `role` ("DM" | "Owner" | anything else); `label` is what renders. */
export function RoleBadge({ role, label }: { role: string; label?: string }) {
  const cls =
    role === "DM" || role === "Owner"
      ? "border-gold-500 bg-gold-500/10 text-gold-300"
      : "border-ink-600 text-parchment-300";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {label ?? role}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as never} className="text-sm text-parchment-500 hover:text-gold-300 transition">
      ← {children}
    </Link>
  );
}
