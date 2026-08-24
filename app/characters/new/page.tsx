import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { BuilderForm } from "@/components/character/BuilderForm";
import { loadSittableCampaigns } from "@/components/character/SitDownForm";
import { BackLink } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("character.builder.title") };
}

/**
 * The character builder's page: authentication, the list of tables this player
 * could send the finished character to, and nothing else.
 *
 * The form itself is an island, because its questions answer one another — but
 * the one thing it must not do is ask the browser who the player sits with.
 * That list is a two-query merge over memberships and DM chairs
 * (`loadSittableCampaigns`, shared with the roster's sit-down picker), and it
 * is read here, once, on the server. The island receives names and ids; it
 * never learns there was a database.
 *
 * `buildCharacter` re-checks the chosen campaign against the same rule before
 * it writes, so the select is a convenience rather than a permission — a
 * forged id buys nothing but a silent refusal.
 */
export default async function NewCharacterPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const campaigns = await loadSittableCampaigns(user.id);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/characters">{t("character.hub.title")}</BackLink>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("character.builder.title")}
        </h1>
        <p className="mb-8 mt-2 max-w-2xl text-sm leading-relaxed text-parchment-300">
          {t("character.builder.lead")}
        </p>
        <BuilderForm campaigns={campaigns} locale={locale} />
      </main>
    </>
  );
}
