# Design: items, equipment, trade & portraits (queued epic)

Requested 2026-08-18. One coherent system in four phases — each phase ships
alone and the next builds on it. Not started yet.

## Phase 1 — SRD item compendium

- `scripts/fetch-srd.mjs` pattern: pull SRD 5.1 **equipment + magic items**
  (5e SRD API, CC-BY-4.0 — same license note as spells/monsters) into
  `lib/data/items.json`.
- `/compendium/items` list + detail pages mirroring monsters/spells:
  filter by category (weapon/armor/gear/tool/magic), search by name.
- "Add to my sheet" button (existing characterItems insert, notes from
  item summary) — replaces guess-typing item names.

## Phase 2 — world item library (DM-crafted items)

- New `world_items` table: worldId, name, description, category, image
  (optional — reuses `lib/storage.ts` + a permission-checked file route),
  stat effects (Phase 3 JSON), createdBy, visibility.
- DM creates/edits items on the world page ("Item forge"); browsable by
  players like a private compendium extension.
- DM "give to player": inserts into a character's inventory (source
  reference kept so the item card can show its image/description).

## Phase 3 — equipment slots & stat effects

- `character_items` += `slot` (head/armor/hands/ring/boots/weapon/none)
  and `equipped` flag; equipping enforces one-per-slot.
- Stat effects as a small JSON on the item (worldItem or SRD armor):
  `{ac: +2, str: +1, speed: +10, note: "..."}` — `lib/dnd.ts` statBlock()
  folds equipped bonuses into AC/scores/passives; sheet shows the delta.
- Keep it shallow on purpose: flat bonuses only, no conditions/attunement
  engine (Owlbear lesson — depth kills).

## Phase 4 — trade (Baldur's Gate style)

- New `trades` table: campaignId, two sides (each side = userId or
  trader/DM), status (draft/offered/accepted/cancelled), and
  `trade_lines` (side, kind gold|item, ref, qty).
- Flow: either side opens a trade → both add gold/items from their
  inventory/treasury → each presses **Accept**; when BOTH sides have
  accepted the current revision, the swap executes atomically (any edit
  clears both accepts — the BG rule). 3s polling already gives
  live-enough updates.
- **Traders**: `traders` table (campaignId, name, portrait image, gold,
  inventory of world items). DM plays the trader side of the trade UI;
  traders are listed on the campaign page with their portraits.
- Player↔player trade falls out of the same model later if wanted.

## Portraits (small, orthogonal — can ship any time)

- `characters.imageFile` + upload on the sheet (reuse MapUploadForm
  pattern, storage abstraction, ~2MB cap, square-crop hint) + serve via
  permission-checked route; show on sheet, party list, initiative rows,
  and the characters hub. Same mechanism later for trader portraits
  (Phase 4) and story-beat images (cinema mode idea).

## Order of work

Portraits (S) → Phase 1 (S/M) → Phase 2 (M) → Phase 3 (M) → Phase 4 (L).
