import { nanoid } from "nanoid";
import { db, campaignEvents } from "@/lib/db";
import type { T } from "@/lib/i18n";

/**
 * The DM's change-log feed. Every player-side change writes one row here, and
 * so does a DM's write to someone else's sheet — the point is observability,
 * not authority: the DM reads the feed instead of policing sheets. Append-only
 * by design (no delete path, reads are capped).
 *
 * Messages are stored as JSON {k, p} — exactly like the session log — so the
 * line is rendered through the dictionary in the *viewer's* locale, and the
 * params carry only entity names/numbers. The actor's display name is never
 * baked in; it comes from the join at render time.
 */

/** Which lane a given event key belongs to — drives icons and the filter chips. */
const KIND_BY_EVENT = {
  sheetSaved: "sheet",
  sheetSavedByDm: "sheet",
  portraitChanged: "sheet",
  portraitRemoved: "sheet",
  itemAdded: "item",
  itemRemoved: "item",
  itemQty: "item",
  srdItemAdded: "item",
  abilityAdded: "ability",
  abilityRemoved: "ability",
  longRest: "ability",
  spellAdded: "ability",
  statusChanged: "status",
  characterCreated: "character",
  characterApproved: "character",
  characterRejected: "character",
  goldChanged: "gold",
  lootAdded: "loot",
  lootQty: "loot",
} as const;

export type CampaignEventKey = keyof typeof KIND_BY_EVENT;

/**
 * Record one change. Never throws into the caller's flow — a feed write must
 * not be able to undo the mutation it describes.
 */
export async function campaignLog(
  campaignId: string,
  actorId: string | null,
  k: CampaignEventKey,
  p?: Record<string, string | number>
) {
  try {
    await db.insert(campaignEvents).values({
      id: nanoid(12),
      campaignId,
      actorId,
      kind: KIND_BY_EVENT[k],
      message: JSON.stringify(p ? { k, p } : { k }),
      createdAt: Date.now(),
    });
  } catch {
    // Swallow: the change itself already happened and matters more.
  }
}

export type RenderedCampaignEvent = { text: string; key?: string };

/**
 * Mirror of renderEventMessage: parse the stored {k, p} and look the line up
 * in the viewer's dictionary. Anything unparseable renders as raw text.
 */
export function renderCampaignEvent(message: string, t: T): RenderedCampaignEvent {
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as {
        k?: string;
        p?: Record<string, string | number>;
      };
      if (parsed && typeof parsed.k === "string") {
        const p = parsed.p ?? {};
        if (parsed.k === "statusChanged") {
          // The status word is a dictionary key, not data — resolve it first.
          const status = t(`campaign.feed.status.${String(p.status ?? "alive")}`);
          return {
            key: parsed.k,
            text: t("campaign.feed.events.statusChanged", { ...p, status }),
          };
        }
        return { key: parsed.k, text: t(`campaign.feed.events.${parsed.k}`, p) };
      }
    } catch {
      // fall through — treat as plain text
    }
  }
  return { text: message };
}
