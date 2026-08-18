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
    ? "border-ink-600 text-parchment-500 hover:border-blood-500 hover:text-blood-400"
    : tone === "success"
      ? "border-ink-600 text-parchment-300 hover:border-emerald-700 hover:text-emerald-800"
      : "border-ink-600 text-parchment-300 hover:border-gold-500 hover:text-gold-300";
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className={`rounded border px-2 py-1 text-xs font-bold transition cursor-pointer ${style}`}
    >
      {label}
    </button>
  );
}
