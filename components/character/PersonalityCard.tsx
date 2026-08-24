import type { Character } from "@/lib/db";
import type { T } from "@/lib/i18n";
import { Card } from "@/components/ui";

/**
 * The four ruled boxes the printed sheet gives to the person rather than to
 * the numbers: traits, ideals, bonds, flaws.
 *
 * They are four boxes and not one because four prompts get answered and one
 * blank page does not — which is the whole reason the book prints them
 * separately, and the reason they are four columns in the database instead of
 * four paragraphs buried in `notes`.
 *
 * A box nobody filled in is not drawn. On a sheet where all four are empty the
 * card disappears entirely: a reader learns nothing from four empty rules, and
 * the player who would fill them in is looking at the edit form anyway.
 */
export function PersonalityCard({ character, t }: { character: Character; t: T }) {
  const boxes = (
    [
      ["traits", character.traits],
      ["ideals", character.ideals],
      ["bonds", character.bonds],
      ["flaws", character.flaws],
    ] as const
  ).filter(([, value]) => (value ?? "").trim() !== "");

  if (boxes.length === 0) return null;

  return (
    <Card className="!p-4">
      <dl className="space-y-3">
        {boxes.map(([key, value]) => (
          <div key={key} className="border-b border-ink-700/70 pb-3 last:border-0 last:pb-0">
            <dt className="mb-1 text-[10px] font-bold uppercase tracking-wide text-parchment-500">
              {t(`character.sheet.${key}`)}
            </dt>
            <dd className="whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
