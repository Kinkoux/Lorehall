import { Fragment } from "react";
import type { T } from "@/lib/i18n";

/**
 * The nine, arranged the way every alignment chart since 1977 has arranged
 * them: lawful down the left, good across the top.
 *
 * Drawn as a grid of radio buttons rather than as a select or a text box for
 * one reason — the grid *is* the explanation. A player who has never met the
 * two axes learns them by seeing "Lawful Good" sit above "Lawful Neutral" and
 * beside "Neutral Good"; the same nine in a dropdown are nine unrelated
 * phrases to be memorised. The axis captions round the edge are the caption to
 * a picture, which is why they are faded and hidden from screen readers: each
 * cell already says its own whole name.
 *
 * There is no script here at all, deliberately. A radio group is a radio group
 * in the first byte of HTML, `:checked` is a CSS selector, and the field posts
 * under the same `alignment` name a text box would have used — so this works
 * before hydration, after hydration, and with scripting switched off, and the
 * builder's island does not have to grow a tenth piece of state to hold it.
 *
 * What goes on the wire is the canonical English, because the sheet's
 * `alignment` column is read by people in both locales and a row that says
 * "Kaotik İyi" is a row the English sheet cannot render. The Turkish is a
 * label drawn over an English value, which is how every other game term in
 * this app is handled.
 */
const ALIGNMENTS = [
  { value: "Lawful Good", sigil: "LG", key: "lawfulGood" },
  { value: "Neutral Good", sigil: "NG", key: "neutralGood" },
  { value: "Chaotic Good", sigil: "CG", key: "chaoticGood" },
  { value: "Lawful Neutral", sigil: "LN", key: "lawfulNeutral" },
  { value: "True Neutral", sigil: "TN", key: "trueNeutral" },
  { value: "Chaotic Neutral", sigil: "CN", key: "chaoticNeutral" },
  { value: "Lawful Evil", sigil: "LE", key: "lawfulEvil" },
  { value: "Neutral Evil", sigil: "NE", key: "neutralEvil" },
  { value: "Chaotic Evil", sigil: "CE", key: "chaoticEvil" },
] as const;

/** Column captions, left to right; row captions, top to bottom. */
const COLUMNS = ["axisLawful", "axisNeutral", "axisChaotic"] as const;
const ROWS = ["axisGood", "axisNeutral", "axisEvil"] as const;

const CAPTION = "text-[10px] uppercase tracking-wider text-parchment-500/80";

export function AlignmentWheel({ t }: { t: T }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-parchment-500">
        {t("character.builder.alignmentLabel")}
      </legend>
      <div className="grid max-w-md grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1">
        {/* The corner the two captions meet in stays empty. */}
        <span aria-hidden />
        {COLUMNS.map((key) => (
          <span key={key} aria-hidden className={`pb-0.5 text-center ${CAPTION}`}>
            {t(`character.builder.${key}`)}
          </span>
        ))}
        {ROWS.map((rowKey, row) => (
          <Fragment key={rowKey}>
            <span aria-hidden className={`self-center pr-1 text-right ${CAPTION}`}>
              {t(`character.builder.${rowKey}`)}
            </span>
            {ALIGNMENTS.slice(row * 3, row * 3 + 3).map((entry) => (
              <Cell key={entry.value} entry={entry} t={t} />
            ))}
          </Fragment>
        ))}
      </div>
      {/* The tenth answer, and the one the form starts on: a character whose
          alignment the player has not decided yet is the ordinary case, and a
          grid with no way back out of it would make the first accidental tap
          permanent. */}
      <label className="mt-1 flex max-w-md cursor-pointer items-center gap-2">
        <input type="radio" name="alignment" value="" defaultChecked className="peer sr-only" />
        <span className="flex min-h-11 w-full items-center justify-center rounded-sm border border-dashed border-ink-600 px-3 text-xs text-parchment-500 transition hover:border-gold-500/60 hover:text-parchment-300 peer-checked:border-gold-500/50 peer-checked:text-parchment-300 peer-focus-visible:outline-2 peer-focus-visible:outline-gold-400">
          {t("character.builder.alignmentNone")}
        </span>
      </label>
    </fieldset>
  );
}

/**
 * One square of the nine.
 *
 * Everything the selected state changes sits on the span that is the input's
 * *sibling*, because that is the only element `peer-checked:` can reach — the
 * two lines inside it take their colour by inheritance, which is also why the
 * sigil is faded with an opacity rather than a colour of its own.
 */
function Cell({ entry, t }: { entry: (typeof ALIGNMENTS)[number]; t: T }) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name="alignment" value={entry.value} className="peer sr-only" />
      <span className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-sm border border-ink-600 bg-ink-950/70 px-1 py-1.5 text-center text-parchment-300 transition hover:border-gold-500/60 peer-checked:border-gold-500 peer-checked:bg-gold-500/15 peer-checked:text-gold-200 peer-focus-visible:outline-2 peer-focus-visible:outline-gold-400">
        <span className="font-mono text-[11px] font-bold tracking-widest opacity-70">
          {entry.sigil}
        </span>
        <span className="text-[11px] font-semibold leading-tight">
          {t(`character.builder.alignments.${entry.key}`)}
        </span>
      </span>
    </label>
  );
}
