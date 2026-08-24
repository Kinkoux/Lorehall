import { ABILITY_LABELS, fmt, weaponAttack } from "@/lib/dnd";
import type { Spellcasting } from "@/lib/srd-classes";
import { getItem } from "@/lib/srd-data";
import type { T } from "@/lib/i18n";
import { Card } from "@/components/ui";
import { Plate } from "@/components/character/SheetVitals";
import type { EquippedPiece } from "@/components/character/EquipmentPanel";

/**
 * "Attacks & Spellcasting" — the box in the middle of the printed sheet that a
 * player actually reads during a fight, and the one thing the app was making
 * everybody work out in their head every round.
 *
 * Every row is arithmetic the sheet already knows: the proficiency bonus its
 * level implies, the modifier its worn scores come to, and which of the two
 * abilities the weapon in hand asks for. Which ability — the ranged, finesse
 * and Strength ladder — is `weaponAttack` in lib/dnd.ts, where it can be
 * tested and reused; this card's own job is to look the compendium entry up
 * for each worn piece and draw the answer as a row.
 *
 * What the numbers deliberately do *not* know is whether the character was
 * ever trained on the weapon: the SRD grants weapon proficiency by class and
 * background, neither of which this sheet models, so proficiency is counted in
 * and the column heading's tooltip says so out loud.
 *
 * A hand-typed line has no compendium entry at all, so it falls to Strength
 * and to a dash for damage. That is an approximate table reference and nothing
 * more — the point is to save a player the lookup, not to referee them.
 */

type AttackRow = {
  key: string;
  name: string;
  /** Null when the sheet has no ability scores to read a modifier off. */
  bonus: number | null;
  damage: string;
};

function weaponRow(
  piece: EquippedPiece,
  strMod: number | null,
  dexMod: number | null,
  profBonus: number
): AttackRow {
  const attack = weaponAttack(
    piece.srdIndex ? getItem(piece.srdIndex) : null,
    { str: strMod, dex: dexMod },
    profBonus
  );
  return { key: piece.id, name: piece.name, bonus: attack.bonus, damage: attack.damage };
}

export function AttacksCard({
  equipped,
  strMod,
  dexMod,
  profBonus,
  casting,
  t,
}: {
  equipped: EquippedPiece[];
  strMod: number | null;
  dexMod: number | null;
  profBonus: number;
  /** The caster's numbers, or null for a sheet with nothing to cast. */
  casting: Spellcasting | null;
  t: T;
}) {
  const rows = equipped
    .filter((piece) => piece.slot === "weapon")
    .map((piece) => weaponRow(piece, strMod, dexMod, profBonus));
  // A caster's spell attack is the last line of the same box on the printed
  // sheet, and belongs there for the same reason: it is one more thing to roll
  // to hit with.
  if (casting) {
    rows.push({
      key: "spell-attack",
      name: t("character.sheet.spellAttack"),
      bonus: casting.attack,
      damage: "—",
    });
  }

  return (
    <Card className="!p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-parchment-500">{t("character.sheet.noAttacks")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-parchment-500">
              <th scope="col" className="pb-1 font-bold">
                {t("character.sheet.attackName")}
              </th>
              <th
                scope="col"
                className="pb-1 pl-2 text-right font-bold"
                title={t("character.sheet.attackHint")}
              >
                {t("character.sheet.attackBonus")}
              </th>
              <th scope="col" className="pb-1 pl-2 text-right font-bold">
                {t("character.sheet.attackDamage")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-ink-700/70 last:border-0">
                <th
                  scope="row"
                  className="py-1.5 pr-1 text-left font-semibold text-parchment-100"
                >
                  {row.name}
                </th>
                <td className="py-1.5 pl-2 text-right font-mono font-bold text-parchment-100">
                  {row.bonus === null ? "—" : fmt(row.bonus)}
                </td>
                <td className="py-1.5 pl-2 text-right text-parchment-300">{row.damage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/**
 * The caster's two numbers, which every player writes at the top of their
 * sheet on the first night and then mis-copies for the rest of the campaign.
 *
 * Both are read off the *worn* score rather than the stored one, because
 * `spellcasting` was handed the effective block: an amulet of health that pins
 * a cleric's Constitution changes nothing here, but a headband of intellect
 * that pins a wizard's Intelligence moves the save DC with it — which is
 * exactly the sort of arithmetic a table gets wrong at eleven at night.
 */
export function SpellcastingCard({ casting, t }: { casting: Spellcasting; t: T }) {
  return (
    <Card className="!p-4">
      <p className="mb-3 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {t("character.sheet.castingAbility")}
        <span className="font-display text-sm text-parchment-100">
          {ABILITY_LABELS[casting.ability]}
        </span>
      </p>
      <div className="space-y-2">
        <Plate label={t("character.sheet.saveDc")} value={String(casting.dc)} gilt />
        <Plate label={t("character.sheet.spellAttack")} value={fmt(casting.attack)} />
      </div>
    </Card>
  );
}
