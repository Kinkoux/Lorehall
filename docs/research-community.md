# Community research: companion tools, Reddit wisdom, DM/player balance

Researched 2026-08-18 (71 Reddit threads via Arctic Shift archive + tool docs,
ENWorld, D&D Beyond forums). Complements `roadmap-vtt-ideas.md` (VTT features)
and `design-economy.md` (items/trade epic) — no overlap with either.

## Steal-worthy patterns per tool (high-fit only)

- **D&D Beyond** — "DM can open every player sheet in one place" is the
  single most-cited reason DMs adopt it. Sheet math + roll-from-sheet.
- **Adventurer's Codex** — Party Dashboard: DM sees live party HP/slots
  read-only; DM pushes images/text to players; rest buttons reset resources.
  Closest existing model to our balance goal: *DM sees everything, edits nothing.*
- **Improved Initiative** — Player View at a separate URL for the table TV;
  statblocks inline in tracker rows.
- **Kanka** — best permission model in the space: role + per-entity grants,
  and "creator owns what they created". Campaign Secrets / Player Theories
  as first-class objects.
- **LegendKeeper** — fast wiki interlinking; map pins; hidden GM notes
  revealed later. Users pick it over World Anvil for *speed and less bloat*.
- **World Anvil** — Secrets model (hidden chunks revealed to subscriber
  groups, propagates everywhere) is best-in-class; its UX is the cautionary
  tale (caching lag, unmanageable at scale).
- **5e.tools** — modular DM screen: user-arranged panels on ONE screen
  ("stop managing numerous tabs").

## Reddit pain points that matter to us

1. Post-session notes exhaust DMs; player notes don't substitute (they don't
   know what mattered). → recap workflows, change feeds.
2. DMs want to *see* party sheets for secret checks/languages — not edit them.
3. Tool fragmentation ("3 versions of the same town in 3 tools") → one home.
4. Browser-tool distrust: offline resilience is a real wish.
5. Anti-tracking consensus: don't police player resources; trust + audit.
6. But quiet HP visibility helps the DM steer tension.
7. Initiative gets lost mid-combat; community fix: *delegate it to a player*.
8. Minimal beats powerful (Owlbear > Roll20 sentiment; interface wrestling).
9. Loot goblins: community fix is party-pool-on-pickup with claims.
10. D&D Beyond's combat tracker doesn't sync HP live — a gap we already cover.

## Permission principles adopted for Lorehall

1. Players own their sheet; DM has full read + rare, confirmed write
   (ideally logged).
2. Prefer a **DM change-log feed** (HP/gold/item/sheet edits, "since last
   session" filter) over DM editing powers — trust-but-verify.
3. HP: exact numbers for your own character; descriptors (healthy/bloodied/
   down) for others — ENWorld poll: 72% of tables use descriptors.
4. Delegate table jobs via **named roles** (Scribe, Quartermaster,
   Initiative-caller, Loot-master), permissions scoped to the job.
5. Gold/XP player-tracked, DM-auditable; treasury stays append-only.
6. Party loot is party-owned on pickup, then claimed.
7. Three visibility tiers everywhere (public / party / dm) + an explicit,
   instant **Reveal** verb with a ledger of who saw what.
8. Creator owns what they created (Kanka rule).
9. Players get a private notes layer the DM can read (theories board —
   reading it tells the DM what players think is happening).
10. "Private" means hidden from peers, never from the DM — label it plainly.

## Top integration candidates (ranked, deduped vs existing docs)

| # | Candidate | Effort |
|---|-----------|--------|
| 1 | Table roles with scoped permissions (Scribe/Quartermaster/Initiative-caller/Loot-master) | M |
| 2 | DM change-log feed (all player-side changes, read-only, filterable) | S |
| 3 | Player-authored recap ritual + Inspiration economy | M |
| 4 | Party notes & theories board (party-visible, DM-readable, DM can pin) | M |
| 5 | Visibility tiers + reveal ledger (data layer under handout push) | M |
| 6 | Remote seat: read-only live table view for one absent player | M |
| 7 | In-world calendar + campaign timeline fed by sessions/quests | M |
| 8 | Session-zero charter + safety tools (lines & veils, X-card) | S |
| 9 | Offline resilience (PWA cache) + printable one-page session sheet | S |
| 10 | NPC attitude tracker (disposition + what changed it) | M |

**Core insight:** the community's answer to DM/player balance is not more
controls for either side — it is *move work to players via named roles, and
give the DM observability instead of authority.* (#1 + #2 together.)
