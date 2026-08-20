import Link from "next/link";
import type { Encounter, EncounterMonster } from "@/lib/db";
import {
  addCustomMonsterToEncounter,
  createEncounter,
  deleteEncounter,
  removeEncounterMonster,
} from "@/lib/compendium-actions";
import type { T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { IconX } from "@/components/Icons";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

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
    <section className="mt-10 space-y-4">
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
                <form action={deleteEncounter.bind(null, encounter.id)}>
                  <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                </form>
              </div>
              <ul className="mt-2 space-y-1">
                {rows.length === 0 && (
                  <li className="text-sm text-parchment-500">{t("campaign.encounters.empty")}</li>
                )}
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 text-sm">
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
                    <form action={removeEncounterMonster.bind(null, row.id)}>
                      <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                    </form>
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
