import Link from "next/link";
import { getT } from "@/lib/locale";

/**
 * The colophon rule at the foot of the public pages: the SRD attribution the
 * licence asks for, and a way through to the fuller notice. It used to live
 * inline on the landing page alone, which meant a reader who came straight to
 * the compendium never saw either line.
 */
export async function SiteFooter({ className = "" }: { className?: string }) {
  const { t } = await getT();
  return (
    <footer
      className={`border-t border-ink-600/50 py-8 text-center text-xs leading-relaxed text-parchment-500 ${className}`}
    >
      <p>{t("landing.srdNote")}</p>
      <p className="mt-2">
        <Link href="/legal" className="underline decoration-ink-600 transition hover:text-gold-400">
          {t("legal.linkLabel")}
        </Link>
      </p>
    </footer>
  );
}
