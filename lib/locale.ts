import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeT, type Locale, type T } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return cookieStore.get(LOCALE_COOKIE)?.value === "tr" ? "tr" : "en";
}

/** One-stop helper for server components: `const { t, locale } = await getT();` */
export async function getT(): Promise<{ t: T; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
