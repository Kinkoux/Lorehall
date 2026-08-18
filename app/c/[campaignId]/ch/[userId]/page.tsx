import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  characters,
  characterItems,
  characterAbilities,
  campaignMembers,
  users,
  type Character,
} from "@/lib/db";
import { ABILITIES, ABILITY_LABELS, fmt, hasScores, statBlock } from "@/lib/dnd";
import { SKILLS } from "@/lib/srd";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import {
  addAbility,
  addItem,
  adjustItemQty,
  approveCharacter,
  deleteAbility,
  deleteItem,
  longRest,
  rejectCharacter,
  setCharacterStatus,
  upsertCharacter,
  useAbility,
} from "@/lib/character-actions";
import Link from "next/link";
import { getT } from "@/lib/locale";
import type { T } from "@/lib/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import { IconMoon, IconSkull } from "@/components/Icons";
import {
  BackLink,
  Button,
  Card,
  GhostButton,
  Input,
  Label,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui";

const KIND_STYLES: Record<string, string> = {
  spell: "bg-sky-100 text-sky-900 border-sky-700/50",
  ability: "bg-amber-100 text-amber-900 border-amber-700/50",
  trait: "bg-purple-100 text-purple-900 border-purple-700/50",
};

export default async function CharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; userId: string }>;
  searchParams: Promise<{ ch?: string }>;
}) {
  const viewer = await requireUser();
  const { t } = await getT();
  const { campaignId, userId } = await params;
  const { ch } = await searchParams;

  const access = await getCampaignAccess(campaignId, viewer.id);
  if (!access?.canView) notFound();
  const owner = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!owner) notFound();
  // The sheet route is campaign-scoped: any user id would otherwise render a
  // page naming a stranger who has nothing to do with this table.
  if (userId !== access.campaign.dmUserId) {
    const atThisTable = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    if (!atThisTable) notFound();
  }

  const editable = viewer.id === userId || access.isDm;
  const allCharacters = await db
    .select()
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, userId)))
    .orderBy(asc(characters.updatedAt));
  // Pending sheets are private to their owner and the DM.
  const visibleCharacters = allCharacters.filter(
    (c) => c.approval === "approved" || editable
  );
  const character =
    (ch ? visibleCharacters.find((c) => c.id === ch) : undefined) ??
    visibleCharacters.find((c) => c.approval === "approved") ??
    visibleCharacters[0];

  const items = character
    ? await db
        .select()
        .from(characterItems)
        .where(eq(characterItems.characterId, character.id))
        .orderBy(asc(characterItems.createdAt))
    : [];
  const abilities = character
    ? await db
        .select()
        .from(characterAbilities)
        .where(eq(characterAbilities.characterId, character.id))
        .orderBy(asc(characterAbilities.createdAt))
    : [];

  const ownerName = owner.displayName ?? owner.username;

  return (
    <>
      <SiteHeader user={viewer} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href={`/c/${campaignId}`}>{access.campaign.name}</BackLink>

        {!character ? (
          <div className="mt-6">
            <h1 className="mb-2 font-display text-2xl font-bold tracking-wide text-parchment-100">
              {editable
                ? t("character.sheet.createTitle")
                : t("character.sheet.noCharacterYet", { name: ownerName })}
            </h1>
            {editable ? (
              <Card className="mt-4">
                <SheetForm campaignId={campaignId} userId={userId} t={t} />
              </Card>
            ) : (
              <p className="text-parchment-500">{t("character.sheet.checkBackLater")}</p>
            )}
          </div>
        ) : (
          <>
            {visibleCharacters.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {visibleCharacters.map((c) => (
                  <Link
                    key={c.id}
                    href={`/c/${campaignId}/ch/${userId}?ch=${c.id}`}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      c.id === character.id
                        ? "border-gold-500 bg-gold-500/15 text-gold-300"
                        : "border-ink-600 text-parchment-500 hover:border-gold-500 hover:text-gold-300"
                    }`}
                  >
                    {c.name}
                    {c.approval === "pending" && ` · ${t("character.sheet.pendingTab")}`}
                  </Link>
                ))}
              </div>
            )}

            {character.approval === "pending" && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-gold-500/60 bg-gold-500/10 px-4 py-3">
                <p className="flex-1 text-sm font-bold text-gold-300">
                  {t("character.sheet.pendingBanner")}
                </p>
                {access.isDm && (
                  <span className="flex gap-2">
                    <form action={approveCharacter.bind(null, character.id)}>
                      <button
                        type="submit"
                        className="rounded-sm border border-emerald-700/60 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
                      >
                        {t("character.sheet.approve")}
                      </button>
                    </form>
                    <form action={rejectCharacter.bind(null, character.id)}>
                      <button
                        type="submit"
                        className="rounded-sm border border-blood-500 px-3 py-1.5 text-xs font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
                      >
                        {t("character.sheet.reject")}
                      </button>
                    </form>
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
                  {character.name}
                </h1>
                <p className="mt-1 text-sm text-parchment-500">
                  {[
                    t("character.sheet.levelN", { n: character.level }),
                    character.race,
                    character.klass,
                    t("character.sheet.playedBy", { name: ownerName }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex gap-2 font-mono text-sm font-bold">
                {character.maxHp !== null && (
                  <span className="rounded-md border border-blood-500/50 bg-blood-500/10 px-3 py-1.5 text-blood-400">
                    {character.maxHp} HP
                  </span>
                )}
                {character.armorClass !== null && (
                  <span className="rounded-md border border-ink-600 px-3 py-1.5 text-parchment-300">
                    AC {character.armorClass}
                  </span>
                )}
              </div>
            </div>

            {character.status === "dead" ? (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-sm border border-blood-500 bg-blood-500/10 px-4 py-3">
                <IconSkull size={22} className="shrink-0 text-blood-400" />
                <p className="flex-1 font-display text-sm font-bold uppercase tracking-wide text-blood-400">
                  {t("character.sheet.deadBanner")}
                </p>
                {access.isDm && (
                  <form action={setCharacterStatus.bind(null, character.id, "alive")}>
                    <button
                      type="submit"
                      className="rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
                    >
                      {t("character.sheet.markAlive")}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              access.isDm && (
                <form
                  action={setCharacterStatus.bind(null, character.id, "dead")}
                  className="mb-6"
                >
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-bold text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
                  >
                    <IconSkull size={14} />
                    {t("character.sheet.markDead")}
                  </button>
                </form>
              )
            )}
            {character.notes && (
              <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
                {character.notes}
              </p>
            )}

            {hasScores(character) ? (
              <StatBlockCard character={character} t={t} />
            ) : (
              editable && (
                <p className="mb-6 rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-parchment-500">
                  {t("character.sheet.fillScoresHint")}
                </p>
              )
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-4">
                <SectionTitle>{t("character.sheet.inventory")}</SectionTitle>
                <Card>
                  {items.length === 0 && (
                    <p className="text-sm text-parchment-500">{t("character.sheet.backpackEmpty")}</p>
                  )}
                  <ul className="divide-y divide-ink-700">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                        <div className="flex-1">
                          <p className="font-semibold text-parchment-100">
                            {item.name}
                            {item.qty > 1 && (
                              <span className="ml-1.5 text-sm text-parchment-500">×{item.qty}</span>
                            )}
                          </p>
                          {item.notes && <p className="text-xs text-parchment-500">{item.notes}</p>}
                        </div>
                        {editable && (
                          <div className="flex items-center gap-1">
                            <form action={adjustItemQty.bind(null, item.id, -1)}>
                              <IconButton label="−" />
                            </form>
                            <form action={adjustItemQty.bind(null, item.id, 1)}>
                              <IconButton label="+" />
                            </form>
                            <form action={deleteItem.bind(null, item.id)}>
                              <IconButton label="✕" danger />
                            </form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <form action={addItem.bind(null, character.id)} className="mt-4 space-y-2 border-t border-ink-700 pt-4">
                      <div className="flex gap-2">
                        <Input name="name" required placeholder={t("character.sheet.itemNamePh")} />
                        <Input name="qty" type="number" min={1} max={9999} defaultValue={1} className="!w-20" />
                      </div>
                      <Input name="notes" placeholder={t("character.sheet.notesOptionalPh")} />
                      <Button type="submit">{t("character.sheet.addItem")}</Button>
                    </form>
                  )}
                </Card>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>{t("character.sheet.spellsAbilities")}</SectionTitle>
                  {editable && abilities.some((a) => a.usesMax !== null) && (
                    <form action={longRest.bind(null, character.id)}>
                      <GhostButton type="submit" className="!px-3 !py-1.5 text-xs">
                        <IconMoon size={14} /> {t("character.sheet.longRest")}
                      </GhostButton>
                    </form>
                  )}
                </div>
                <Card>
                  {abilities.length === 0 && (
                    <p className="text-sm text-parchment-500">
                      {t("character.sheet.noAbilities")}
                    </p>
                  )}
                  <ul className="divide-y divide-ink-700">
                    {abilities.map((ability) => (
                      <li key={ability.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${KIND_STYLES[ability.kind]}`}
                          >
                            {t(`character.sheet.kind.${ability.kind}`)}
                          </span>
                          <p className="flex-1 font-semibold text-parchment-100">{ability.name}</p>
                          {ability.usesMax !== null && (
                            <span className="font-mono text-sm font-bold text-gold-300">
                              {ability.usesLeft}/{ability.usesMax}
                            </span>
                          )}
                          {editable && (
                            <div className="flex items-center gap-1">
                              {ability.usesMax !== null && (
                                <form action={useAbility.bind(null, ability.id)}>
                                  <button
                                    type="submit"
                                    disabled={ability.usesLeft === 0}
                                    className="rounded border border-gold-500 px-2 py-1 text-xs font-bold text-gold-300 transition hover:bg-gold-500/10 disabled:opacity-40 cursor-pointer"
                                  >
                                    {t("character.sheet.use")}
                                  </button>
                                </form>
                              )}
                              <form action={deleteAbility.bind(null, ability.id)}>
                                <IconButton label="✕" danger />
                              </form>
                            </div>
                          )}
                        </div>
                        {ability.notes && (
                          <p className="mt-1 text-xs text-parchment-500">{ability.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <form action={addAbility.bind(null, character.id)} className="mt-4 space-y-2 border-t border-ink-700 pt-4">
                      <div className="flex gap-2">
                        <Input name="name" required placeholder={t("character.sheet.abilityNamePh")} />
                        <Select name="kind" className="!w-28">
                          <option value="spell">{t("character.sheet.kind.spell")}</option>
                          <option value="ability">{t("character.sheet.kind.ability")}</option>
                          <option value="trait">{t("character.sheet.kind.trait")}</option>
                        </Select>
                        <Input name="usesMax" type="number" min={1} max={99} placeholder={t("character.sheet.usesPh")} className="!w-20" />
                      </div>
                      <Input name="notes" placeholder={t("character.sheet.abilityNotesPh")} />
                      <Button type="submit">{t("common.add")}</Button>
                    </form>
                  )}
                </Card>
              </section>
            </div>

            {editable && (
              <details className="mt-8">
                <summary className="cursor-pointer font-display text-sm uppercase tracking-wide text-gold-300 hover:text-gold-400">
                  {t("character.sheet.editSheet")}
                </summary>
                <Card className="mt-4">
                  <SheetForm campaignId={campaignId} userId={userId} character={character} t={t} />
                </Card>
              </details>
            )}
          </>
        )}
      </main>
    </>
  );
}

function StatBlockCard({ character, t }: { character: Character; t: T }) {
  const stats = statBlock(character);
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.abilities.map((ability) => (
          <div
            key={ability.key}
            className="rounded-md border border-ink-700 bg-ink-950/60 px-2 py-2 text-center"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
              {ability.label}
            </p>
            <p className="font-display text-xl font-bold text-parchment-100">{fmt(ability.mod)}</p>
            <p className="text-[11px] text-parchment-500">{ability.score}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="rounded-md border border-gold-500/60 bg-gold-500/10 px-2 py-0.5 font-bold text-gold-300">
          {t("character.sheet.passivePerception", { n: stats.passivePerception })}
        </span>
        <span className="text-parchment-500">
          {t("character.sheet.proficiency")}{" "}
          <strong className="text-parchment-100">{fmt(stats.profBonus)}</strong>
        </span>
        <span className="text-parchment-500">
          {t("character.sheet.saves")}{" "}
          {stats.saves.map((save, i) => (
            <span key={save.label}>
              {i > 0 && " · "}
              <span className={save.proficient ? "font-bold text-parchment-100" : ""}>
                {save.label} {fmt(save.bonus)}
              </span>
            </span>
          ))}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-ink-700 pt-3 sm:grid-cols-3">
        {stats.skills.map((skill) => (
          <p key={skill.name} className="flex justify-between text-sm">
            <span className={skill.proficient ? "font-bold text-parchment-100" : "text-parchment-300"}>
              {skill.proficient && <span className="mr-1 text-gold-400">●</span>}
              {skill.name}
            </span>
            <span className="font-mono text-parchment-100">{fmt(skill.bonus)}</span>
          </p>
        ))}
      </div>
    </Card>
  );
}

function IconButton({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <button
      type="submit"
      className={`h-7 w-7 rounded border text-xs font-bold transition cursor-pointer ${
        danger
          ? "border-ink-600 text-parchment-500 hover:border-blood-500 hover:text-blood-400"
          : "border-ink-600 text-parchment-300 hover:border-gold-500 hover:text-gold-300"
      }`}
    >
      {label}
    </button>
  );
}

function SheetForm({
  campaignId,
  userId,
  character,
  t,
}: {
  campaignId: string;
  userId: string;
  character?: Character;
  t: T;
}) {
  const profSkills = new Set(
    (character?.profSkills ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  const profSaves = new Set(
    (character?.profSaves ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  return (
    <form action={upsertCharacter.bind(null, campaignId, userId)} className="space-y-4">
      {character && <input type="hidden" name="characterId" value={character.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label>{t("character.sheet.form.nameLabel")}</Label>
          <Input name="name" required defaultValue={character?.name} placeholder={t("character.sheet.form.namePh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.level")}</Label>
          <Input name="level" type="number" min={1} max={30} defaultValue={character?.level ?? 1} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.classLabel")}</Label>
          <Input name="klass" defaultValue={character?.klass ?? ""} placeholder={t("character.sheet.form.classPh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.raceLabel")}</Label>
          <Input name="race" defaultValue={character?.race ?? ""} placeholder={t("character.sheet.form.racePh")} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.maxHp")}</Label>
          <Input name="maxHp" type="number" min={1} max={9999} defaultValue={character?.maxHp ?? ""} />
        </label>
        <label className="block">
          <Label>{t("character.sheet.form.armorClass")}</Label>
          <Input name="armorClass" type="number" min={1} max={40} defaultValue={character?.armorClass ?? ""} />
        </label>
      </div>

      <div>
        <Label>{t("character.sheet.form.abilityScores")}</Label>
        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((key) => (
            <label key={key} className="block">
              <span className="mb-0.5 block text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500">
                {ABILITY_LABELS[key]}
              </span>
              <Input
                name={key}
                type="number"
                min={1}
                max={30}
                defaultValue={character?.[key] ?? ""}
                className="text-center"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("character.sheet.form.saveProfs")}</Label>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {ABILITIES.map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-sm text-parchment-300">
              <input
                type="checkbox"
                name="profSaves"
                value={key}
                defaultChecked={profSaves.has(key)}
                className="accent-[#8a6516]"
              />
              {ABILITY_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("character.sheet.form.skillProfs")}</Label>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {SKILLS.map((skill) => (
            <label key={skill.name} className="flex items-center gap-1.5 text-sm text-parchment-300">
              <input
                type="checkbox"
                name="profSkills"
                value={skill.name}
                defaultChecked={profSkills.has(skill.name)}
                className="accent-[#8a6516]"
              />
              {skill.name}
              <span className="text-[10px] text-parchment-500">{skill.ability}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="block">
        <Label>{t("character.sheet.form.notesLabel")}</Label>
        <Textarea name="notes" rows={5} defaultValue={character?.notes ?? ""} />
      </label>
      <Button type="submit">
        {character ? t("character.sheet.form.saveSheet") : t("character.sheet.form.createButton")}
      </Button>
    </form>
  );
}
