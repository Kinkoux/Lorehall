import type { ReactNode } from "react";

/**
 * A destructive action that takes two presses, generalised from the party
 * roster's remove knob.
 *
 * The first press only unfolds: inside is what the action does and does not
 * touch, and a second, separate press is the one that lands. Closing the fold
 * is the way out, so there is nothing to cancel — and no script behind any of
 * it. It is a plain `<details>`, server-rendered, working before (and
 * without) hydration.
 *
 * Pass `group` to share a `<details name>` with sibling confirmations, so
 * opening one folds the last one away.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  warnText,
  action,
  danger = false,
  size = "sm",
  group,
  ariaLabel,
  children,
}: {
  /** What the closed knob reads. */
  label: ReactNode;
  /** What the real submit inside the fold reads. */
  confirmLabel: ReactNode;
  /** What the action costs — shown above the submit. */
  warnText?: ReactNode;
  /** The server action, already `.bind()`-ed to whatever it needs. */
  action: (formData: FormData) => void | Promise<void>;
  /** Red hover on the knob and a vermilion frame on the fold. */
  danger?: boolean;
  size?: "sm" | "md";
  /** `<details name>`, shared by confirmations that should close each other. */
  group?: string;
  /** Spoken name for both presses, when `label` alone is too terse. */
  ariaLabel?: string;
  /** Extra form fields — hidden inputs the action needs. */
  children?: ReactNode;
}) {
  const knob =
    size === "md"
      ? "rounded-sm border px-4 py-2 text-sm font-semibold"
      : "rounded border px-2 py-1 text-xs font-bold";
  const tone = danger
    ? "border-ink-600 text-parchment-500 hover:border-blood-500 hover:text-blood-400"
    : "border-ink-600 text-parchment-300 hover:border-gold-500 hover:text-gold-300";

  return (
    <details name={group} className="relative shrink-0">
      <summary
        title={ariaLabel}
        className={`${knob} ${tone} inline-block list-none transition cursor-pointer [&::-webkit-details-marker]:hidden`}
      >
        {label}
      </summary>
      <div
        className={`absolute top-full right-0 z-20 mt-1 w-56 rounded-sm border bg-ink-950 p-2.5 text-left shadow-lg ${
          danger ? "border-blood-500/40" : "border-ink-600"
        }`}
      >
        {warnText && (
          <p className="mb-2 text-xs leading-relaxed text-parchment-500">{warnText}</p>
        )}
        <form action={action}>
          {children}
          {/* The destructive press is the one that must not be fat-fingered
              past — full width of the fold and a 44px thumb row, while the
              opening knob stays at its row's metric (its press only unfolds). */}
          <button
            type="submit"
            aria-label={ariaLabel}
            className={`${knob} ${tone} flex min-h-11 w-full items-center justify-center transition cursor-pointer`}
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </details>
  );
}
