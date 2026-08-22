/**
 * Bits the campaign page's sections share. Server-rendered like everything
 * else on that page — no client boundary here.
 */

export function SmallButton({
  label,
  danger = false,
  tone,
  ariaLabel,
}: {
  label: React.ReactNode;
  danger?: boolean;
  tone?: "success";
  ariaLabel?: string;
}) {
  const style = danger
    ? "border-ink-600 text-parchment-500 group-hover:border-blood-500 group-hover:text-blood-400"
    : tone === "success"
      ? "border-ink-600 text-parchment-300 group-hover:border-emerald-700 group-hover:text-emerald-800"
      : "border-ink-600 text-parchment-300 group-hover:border-gold-500 group-hover:text-gold-300";
  // The chip keeps the size it has always had; the button around it is 44px of
  // transparent room, because a 26px target next to another 26px target is two
  // things a thumb chooses between by luck. Only the room is new — the face,
  // and so the density of every row these sit in, is unchanged.
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className="group inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer"
    >
      <span className={`rounded border px-2 py-1 text-xs font-bold transition ${style}`}>
        {label}
      </span>
    </button>
  );
}
