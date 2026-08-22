import Link from "next/link";
import type { Encounter, EncounterMonster } from "@/lib/db";
import {
  addCustomMonsterToEncounter,
  createEncounter,
  deleteEncounter,
  removeEncounterMonster,
} from "@/lib/compendium-actions";
import { getMonsterArt } from "@/lib/srd-data";
import type { T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { IconX } from "@/components/Icons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Button, Card, Input, SectionTitle } from "@/components/ui";

export function EncountersSection({
  encounters,
  encounterRows,
  campaignId,
  t,
}: {
  encounters: Encounter[];
  encounterRows: EncounterMonster[];
  campaignId: string;
  t: T;
}) {
  return (
    <section id="encounters" className="mt-10 scroll-mt-28 space-y-4">
      <SectionTitle>{t("campaign.encounters.title")}</SectionTitle>
      <p className="-mt-2 text-xs text-parchment-500">
        {t("campaign.encounters.hintA")}{" "}
        <Link href="/compendium/monsters" className="text-gold-300 underline">
          {t("campaign.encounters.hintLink")}
        </Link>{" "}
        {t("campaign.encounters.hintB")}
      </p>
      {encounters.length === 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={EMPTY_ART.encounters}
          alt=""
          loading="lazy"
          decoding="async"
          className="mx-auto mb-3 w-24 opacity-70"
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {encounters.map((encounter) => {
          const rows = encounterRows.filter((r) => r.encounterId === encounter.id);
          return (
            <Card key={encounter.id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-parchment-100">
                  {encounter.name}
                </h3>
                <ConfirmButton
                  label={<IconX size={12} />}
                  confirmLabel={t("common.confirm.yesDelete")}
                  warnText={t("common.confirm.areYouSure")}
                  action={deleteEncounter.bind(null, encounter.id)}
                  danger
                  group="encounter-delete"
                  ariaLabel={t("common.delete")}
                />
              </div>
              <ul className="mt-2 space-y-1">
                {rows.length === 0 && (
                  <li className="text-sm text-parchment-500">{t("campaign.encounters.empty")}</li>
                )}
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 text-sm">
                    <MonsterMark srdIndex={row.srdIndex} />
                    <span className="flex-1 text-parchment-100">
                      {row.name}
                      {row.count > 1 && (
                        <span className="ml-1 text-parchment-500">×{row.count}</span>
                      )}
                      {row.srdIndex ? (
                        <Link
                          href={`/compendium/monsters/${row.srdIndex}`}
                          className="ml-1 text-xs text-gold-300 underline"
                        >
                          {t("campaign.encounters.stats")}
                        </Link>
                      ) : (
                        <span className="ml-1 text-[10px] uppercase text-purple-800">
                          {t("campaign.encounters.homebrew")}
                        </span>
                      )}
                    </span>
                    {row.maxHp !== null && (
                      <span className="font-mono text-xs text-parchment-500">
                        {t("campaign.encounters.hp", { n: row.maxHp })}
                      </span>
                    )}
                    <ConfirmButton
                      label={<IconX size={12} />}
                      confirmLabel={t("common.confirm.yesDelete")}
                      warnText={t("common.confirm.areYouSure")}
                      action={removeEncounterMonster.bind(null, row.id)}
                      danger
                      group="encounter-delete"
                      ariaLabel={t("common.delete")}
                    />
                  </li>
                ))}
              </ul>
              <form
                action={addCustomMonsterToEncounter.bind(null, encounter.id)}
                className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-700 pt-3"
              >
                <Input name="name" required placeholder={t("campaign.encounters.monsterPh")} className="!w-36 !py-1" />
                <Input name="count" type="number" min={1} max={20} defaultValue={1} title={t("campaign.encounters.countTitle")} className="!w-14 !py-1" />
                <Input name="maxHp" type="number" min={1} placeholder="HP" className="!w-16 !py-1" />
                <Input name="dexMod" type="number" min={-5} max={10} placeholder="DEX±" title={t("campaign.encounters.dexTitle")} className="!w-16 !py-1" />
                <Button type="submit" className="!px-3 !py-1 text-xs">
                  {t("common.add")}
                </Button>
              </form>
            </Card>
          );
        })}
      </div>
      <Card>
        <form action={createEncounter.bind(null, campaignId)} className="flex gap-2">
          <Input name="name" required placeholder={t("campaign.encounters.namePh")} />
          <Button type="submit" className="shrink-0">
            {t("campaign.encounters.new")}
          </Button>
        </form>
      </Card>
    </section>
  );
}

/**
 * The face of the thing on the roster line, when the compendium has drawn one.
 *
 * Local plates only. `getMonsterArt` will happily fall back to a Wikimedia
 * photograph, but that fallback carries an attribution line the picture must
 * be shown with, and a 32px mark in a list of six is no place to print one.
 * A credit of null is exactly the test for "this engraving is ours", so a
 * monster we have no plate for simply goes unillustrated — as does every
 * homebrew line, which was never in the compendium to begin with.
 */
function MonsterMark({ srdIndex }: { srdIndex: string | null }) {
  const art = srdIndex ? getMonsterArt(srdIndex) : undefined;
  if (!art || art.credit !== null) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.thumb}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-8 w-8 shrink-0 rounded-sm border border-ink-600 object-cover"
    />
  );
}
