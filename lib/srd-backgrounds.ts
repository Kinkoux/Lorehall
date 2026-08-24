/**
 * The thirteen backgrounds the 2014 Player's Handbook prints, by name.
 *
 * A background is the one question on a character sheet that is answered in
 * prose rather than in numbers — where they were before the adventure started
 * — and the numbers it does carry (two skills, a language or a tool, a
 * trinket, a feature with a name and a paragraph) are the book's text and stay
 * in the book. This file is a list of thirteen nouns, offered to a player
 * staring at an empty box, and nothing more.
 *
 * Only Acolyte is in the SRD 5.1 (Wizards of the Coast, CC-BY-4.0), which is
 * why the rest arrive as names alone: a name is a reference to a thing that
 * exists, the way a bibliography is, and reprinting what a Guild Artisan's
 * feature does would be a different act entirely.
 *
 * The form treats every one of them as a suggestion — a datalist beside a text
 * box — because "Retired Hexblood Cartographer" is a perfectly good answer to
 * this question and no list will ever contain it.
 */
export const BACKGROUNDS: readonly string[] = [
  "Acolyte",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Sailor",
  "Soldier",
  "Urchin",
];

/** The one the SRD publishes, and so the one this app can speak for. */
export const SRD_BACKGROUND = "Acolyte";
