import { getLocale } from "@/lib/locale";
import { Navbar } from "@/components/Navbar";
import type { User } from "@/lib/db";

/** Server wrapper: resolves the locale cookie, renders the client navbar.
 *  Pass user: null on public pages. */
export async function SiteHeader({ user }: { user: User | null }) {
  const locale = await getLocale();
  return <Navbar userName={user ? (user.displayName ?? user.username) : null} locale={locale} />;
}
