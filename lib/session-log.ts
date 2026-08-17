import type { T } from "@/lib/i18n";

/**
 * App-generated session-log messages are stored as JSON {k, p} and rendered
 * through the dictionary at display time, so the table log follows the
 * viewer's locale. Player-typed notes stay plain text. Rows written before
 * this scheme are plain English strings and render as-is.
 */
export function logMessage(k: string, p?: Record<string, string | number>) {
  return JSON.stringify(p ? { k, p } : { k });
}

export type RenderedEvent = {
  text: string;
  key?: string;
  /** For rolls: the individual dice, e.g. "[4, 2]" (may be empty). */
  rollDetail?: string;
  /** For rolls: the final total, styled by the renderer. */
  rollTotal?: number;
};

export function renderEventMessage(message: string, t: T): RenderedEvent {
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as {
        k?: string;
        p?: Record<string, string | number>;
      };
      if (parsed && typeof parsed.k === "string") {
        const p = parsed.p ?? {};
        if (parsed.k === "joinsInitiative") {
          const source = t(`session.logEvents.${String(p.src ?? "srcApp")}`, { mod: p.mod ?? "" });
          return { key: parsed.k, text: t("session.logEvents.joinsInitiative", { ...p, source }) };
        }
        if (parsed.k === "rolled") {
          return {
            key: parsed.k,
            text: t("session.logEvents.rolled", { notation: p.notation ?? "" }),
            rollDetail: p.detail ? String(p.detail) : undefined,
            rollTotal: p.total !== undefined ? Number(p.total) : undefined,
          };
        }
        return { key: parsed.k, text: t(`session.logEvents.${parsed.k}`, p) };
      }
    } catch {
      // fall through — treat as plain text
    }
  }
  return { text: message };
}
