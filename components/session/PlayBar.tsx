import type { ReactNode } from "react";
import type { Combatant } from "@/lib/db";
import type { T } from "@/lib/i18n";
import { nextTurn } from "@/lib/session-actions";
import { IconChevron, IconDie, IconParty, IconScroll, IconSwords } from "@/components/Icons";
import { turnFocus } from "@/components/session/turn-focus";
import { Button } from "@/components/ui";

/**
 * The strip that stays on screen while the table plays.
 *
 * A live session is one long scroll, so the three things a player asks every
 * few seconds — which round, whose turn, who is next — used to depend on where
 * the page happened to be parked. This pins them to the top, with the DM's
 * "next turn" within thumb reach and jump marks to the three places the table
 * actually goes: the initiative order, the dice, the log.
 *
 * It sticks at `z-40`, the same layer as the site navbar and later in the
 * document, so while the page is scrolled the bar sits over the navbar instead
 * of disappearing behind it. At rest (scroll top) the two do not overlap.
 */
export function PlayBar({
  title,
  live,
  combatActive,
  round,
  turnIndex,
  order,
  isDm,
  sessionId,
  t,
}: {
  title: string;
  live: boolean;
  /** Combat is running: the bar swaps the session title for the turn tracker. */
  combatActive: boolean;
  round: number;
  turnIndex: number;
  /** The initiative order, exactly as the list below renders it. */
  order: readonly Combatant[];
  isDm: boolean;
  sessionId: string;
  t: T;
}) {
  const { current, next } = turnFocus(order, turnIndex);

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-6 border-b border-ink-600/80 bg-ink-900 px-4 py-1.5 shadow-sm shadow-[#5e4420]/10">
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* The 3s refresh rewrites this text in place, so a screen reader hears
            the turn change instead of only sighted players seeing it. */}
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"
        >
          {combatActive ? (
            <span className="shrink-0 rounded-sm border border-blood-500 bg-blood-500/15 px-2 py-1 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-blood-400">
              {t("session.playBar.round", { n: round })}
            </span>
          ) : live ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-700/60 bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-900">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              {t("session.live")}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-ink-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-parchment-500">
              {t("session.ended")}
            </span>
          )}

          {current ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="hidden text-xs font-semibold uppercase tracking-wider text-parchment-500 sm:inline">
                {t("session.playBar.turn")}:{" "}
              </span>
              {/* Gold reads at 4.24:1 on parchment — fine for the marker, not
                  for the one name everyone squints at from across the table. */}
              <span aria-hidden className="mr-1 text-gold-400">
                ▶
              </span>
              <span className="font-display text-base font-bold text-parchment-100 sm:text-lg">
                {current.name}
              </span>
              {next && (
                <span className="hidden text-xs text-parchment-500 sm:inline">
                  {" · "}
                  {t("session.playBar.next")}: {next.name}
                </span>
              )}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate font-display text-base font-bold text-parchment-100">
              {title}
            </span>
          )}
        </div>

        {!combatActive && (
          <span
            className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-parchment-500 sm:flex"
            title={t("session.playBar.participants", { n: order.length })}
          >
            <IconParty size={14} />
            <span className="sr-only">
              {t("session.playBar.participants", { n: order.length })}
            </span>
            <span aria-hidden>{order.length}</span>
          </span>
        )}

        {combatActive && isDm && current && (
          <form action={nextTurn.bind(null, sessionId)} className="shrink-0">
            {/* Only min-* is added: a px/text override would lose to the
                Button's own utilities, which sort later in the stylesheet. */}
            <Button
              type="submit"
              aria-label={t("session.playBar.advance")}
              className="min-h-11 min-w-11"
            >
              <IconChevron size={16} className="sm:hidden" />
              <span className="hidden sm:inline">{t("session.initiative.nextTurn")}</span>
            </Button>
          </form>
        )}

        <nav
          aria-label={t("session.playBar.jumpTo")}
          className="flex shrink-0 items-center gap-0.5"
        >
          <JumpLink href="#initiative" label={t("session.playBar.jump.initiative")}>
            <IconSwords size={16} />
          </JumpLink>
          {live && (
            <JumpLink href="#dice" label={t("session.playBar.jump.dice")}>
              <IconDie size={16} />
            </JumpLink>
          )}
          <JumpLink href="#log" label={t("session.playBar.jump.log")}>
            <IconScroll size={16} />
          </JumpLink>
        </nav>
      </div>
    </div>
  );
}

/** A 44x44 mark that drops the page at one of the session's three landmarks. */
function JumpLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-11 w-9 items-center justify-center rounded-sm text-parchment-500 transition hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-gold-400 sm:w-11"
    >
      {children}
    </a>
  );
}
