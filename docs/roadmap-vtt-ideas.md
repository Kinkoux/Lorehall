# VTT feature research → Lorehall roadmap ideas

Researched 2026-08: Roll20, Foundry VTT, Owlbear Rodeo, Alchemy RPG,
D&D Beyond Maps, Fantasy Grounds, Talespire, MapTool, Battle Map TV, and
**Arkenforge** (the closest comp — purpose-built for in-person play:
second-display player screen, fog, true 1-inch grid calibrated to TV size).

Lorehall is a companion for a **physical table** — real dice, spoken play.
That filter kills most "online VTT" features (per-player vision, video chat)
and elevates the "shared TV at the table" pattern.

Two cautionary tales: Owlbear Rodeo wins by doing *less*, and WotC killed its
3D Sigil VTT (sunsets Oct 2026) after overbuilding. Manual fog is ~90% of
fog's value at ~10% of its complexity; wall-based dynamic lighting is every
VTT's heaviest subsystem and is pointless on one shared screen.

## Shipped

- **Map upload + viewer** (2026-08): DM uploads PNG/JPG/WebP per campaign,
  visibility everyone/dm, one map "on the table" shown on the live session
  screen (3s polling), pan/zoom/pinch/fullscreen viewer.

## Ranked backlog (fit = value at a physical table; effort S/M/L)

| # | Feature | Fit | Effort | Notes |
|---|---------|-----|--------|-------|
| 1 | **Table Display mode** — read-only fullscreen route for the table TV: initiative, round, whose turn + on deck, public-safe HP (healthy/bloodied/down), active map | high | S | The core in-person pattern (Arkenforge player screen, Foundry Common Display). All state already exists. |
| 2 | **Statblock drawer in initiative** — tap a combatant, see its SRD statblock inline | high | S | Compendium + encounters already linked via `srdIndex`. Kills the mid-combat tab shuffle. |
| 3 | **Condition markers with rules text** — toggleable condition chips on combatants, SRD text on tap | high | S | Conditions exist as free text today; SRD condition data already in `lib/srd.ts`. |
| 4 | **DM screen party dashboard** — passive stats strip (PP, AC, speeds, save DCs) | high | S | Ability scores already on sheets; PP chip exists, extend it. |
| 5 | **Encounter difficulty budget** — XP budget vs party level, easy→deadly gauge | high | S | SRD math only, prep-side, zero table friction. |
| 6 | **Turn timer + on-deck banner** | high | S | Social pressure speeds up live combat. |
| 7 | **Manual fog brush on maps** — DM paints hide/reveal, players see masked map | high | M | THE most-used map feature at tables (Roll20 free tier, D&D Beyond, Owlbear). Polygon/bitmap mask, no vision math. |
| 8 | **Cinema mode for story beats** — attach an image to a beat, one tap pushes it fullscreen to the table view | high | M | Alchemy RPG's whole product in one feature; beats + upload pipeline both exist now. |
| 9 | **Handout push & reveal** — send a codex image/doc to the table screen or players' phones, with history | high | M | Codex stores content; this adds the "show" verb. |
| 10 | **Session recap generator** — auto-draft journal recap from beats hit, encounters fought, rolls, treasury changes | high | M | No mainstream VTT composes recaps — differentiator; all ingredient data streams exist. |
| 11 | **Ambience & music per beat/encounter** | high | M | Audio lands harder in a shared room; needs upload + audio element on the table view. |
| 12 | **Physical-inch grid calibration** — enter TV size, grid renders at true 1" for real minis | high | S | Arkenforge's signature; meaningless online, magic in person. Needs grid overlay first. |
| 13 | **Ping/pointer on map** — tap to pulse "look here" on the table view | high | S | Needs a realtime-ish channel; with 3s polling a "last ping" row works. |
| 14 | Encounter-linked tokens on map (grid-snapped, no vision) | med | M | Competes with the physical minis the table already owns; do after fog. |
| 15 | Ruler + AoE spell templates | med | M | Settles fireball arguments; only matters once maps have grid scale. |
| 16 | UVTT import (.uvtt/.dd2vtt) — parse image + grid from Dungeondraft exports | med | S | Self-aligning maps for the Dungeondraft cohort; ignore walls/lights. |
| 17 | Map pins linked to codex entries | med | M | Great for region maps + recaps; prep feature more than live. |
| 18 | 3D dice on the table view | low | M | Real dice are the point; flourish only (dice-box lib if ever). |
| 19 | ~~Wall-based dynamic lighting / per-player vision~~ | low | L | **Rejected.** One shared screen = no per-player vision; heaviest subsystem in any VTT. |

## Suggested next slice

1–4 make one coherent "live table" upgrade (all S, all reuse existing state);
7 (fog brush) is the next map milestone; 8+9 turn story beats into a
presentation layer. 12 & 15 unlock together once maps get a grid overlay.
