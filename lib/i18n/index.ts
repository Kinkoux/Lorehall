// Lightweight dictionary i18n. Isomorphic — safe to import from client
// components (both locales ship in the bundle; they are small).
// Usage:  const t = makeT(locale);  t("session.nextTurn")
//         t("compendium.showing", { n: 60 })  →  "showing the first 60…"
import { common } from "./dict/common";
import { landing } from "./dict/landing";
import { auth } from "./dict/auth";
import { dashboard } from "./dict/dashboard";
import { world } from "./dict/world";
import { campaign } from "./dict/campaign";
import { session } from "./dict/session";
import { character } from "./dict/character";
import { compendium } from "./dict/compendium";
import { reference } from "./dict/reference";
import { legal } from "./dict/legal";
import { errors } from "./dict/errors";

export type Locale = "en" | "tr";
export const LOCALES: Locale[] = ["en", "tr"];
export const LOCALE_COOKIE = "lorehall_locale";

type Dict = Record<string, unknown>;
const NAMESPACES: Record<string, { en: Dict; tr: Dict }> = {
  common,
  landing,
  auth,
  dashboard,
  world,
  campaign,
  session,
  character,
  compendium,
  reference,
  legal,
  errors,
};

function lookup(dict: Dict | undefined, path: string[]): string | undefined {
  let node: unknown = dict;
  for (const part of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Dict)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(locale: Locale): T {
  return (key, vars) => {
    const [ns, ...path] = key.split(".");
    const bundle = NAMESPACES[ns];
    let text = lookup(bundle?.[locale], path) ?? lookup(bundle?.en, path) ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}
