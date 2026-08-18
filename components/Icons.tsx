import type { ComponentProps } from "react";

/**
 * Monoline icon set drawn for Lorehall — replaces emoji throughout the UI.
 * All icons inherit currentColor and size via the `size` prop (default 18).
 */
type IconProps = ComponentProps<"svg"> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** d20 — hexagonal silhouette with facet lines. */
export function IconDie(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" />
      <path d="M12 2l4.8 7.4M12 2L7.2 9.4M12 22l4.8-12.6M12 22L7.2 9.4M16.8 9.4H7.2M20.5 7l-3.7 2.4M3.5 7l3.7 2.4M20.5 17l-3.7-7.6M3.5 17l3.7-7.6" />
    </Svg>
  );
}

/** Crossed swords. */
export function IconSwords(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l11 11M4 4v3.5M4 4h3.5M13 17l2 2M17 15l2 2M14.5 19.5l2-2M20 4L9 15M20 4v3.5M20 4h-3.5M9 15l-2 2M11 17l-2 2M5 15l4 4M5 15l-1.5 4.5L8 18" />
    </Svg>
  );
}

/** Open book. */
export function IconBook(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6c-1.8-1.6-4.4-2.2-8-2v14c3.6-.2 6.2.4 8 2 1.8-1.6 4.4-2.2 8-2V4c-3.6-.2-6.2.4-8 2z" />
      <path d="M12 6v14" />
    </Svg>
  );
}

/** Ribbon bookmark (plot points in the story book). */
export function IconBookmark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.3-6.5 4.3v-16a1 1 0 0 1 1-1z" />
    </Svg>
  );
}

/** Quill pen. */
export function IconQuill(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 4c-6 .5-10.5 3-13 8-1.3 2.6-2 5.3-2 8 2.7 0 5.4-.7 8-2 5-2.5 7.5-7 8-13l-1-1z" />
      <path d="M5 19C9 13 13 9 17 7" />
    </Svg>
  );
}

/** Coin. */
export function IconCoin(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 9.5v5" />
    </Svg>
  );
}

/** Crescent moon (long rest). */
export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5z" />
    </Svg>
  );
}

/** Shield. */
export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7.5 2.5v6c0 4.5-3 8-7.5 9.5C7.5 19.5 4.5 16 4.5 11.5v-6L12 3z" />
    </Svg>
  );
}

/** Rolled scroll (journal / reference). */
export function IconScroll(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h11a2 2 0 0 1 2 2v1h-4" />
      <path d="M16 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1h11" />
      <path d="M7 4a2 2 0 0 0-2 2v11M7.5 10h5M7.5 13.5h5" />
    </Svg>
  );
}

/** Three claw slashes (monsters). */
export function IconClaw(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3c2 4.5 3 9.5 3 18M12 3c1.4 4.5 2 9.5 2 18M19 3c.7 4.5 1 9.5 1 18" transform="rotate(18 12 12)" />
    </Svg>
  );
}

/** Two figures (the party). */
export function IconParty(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.5-4 2.6-6 5.5-6s5 2 5.5 6" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16 14.2c2.7.2 4.2 2 4.6 5.3" />
    </Svg>
  );
}

/** Barbute helm — stands in for a character with no portrait. */
export function IconHelm(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 11.5a7.5 7.5 0 0 1 15 0v4.5a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4v-4.5z" />
      <path d="M4.5 12.5h15" />
      <path d="M12 12.5V20" />
      <path d="M7.5 15.5h1.8M14.7 15.5h1.8" />
    </Svg>
  );
}

/** Skull (death, dead combatants). */
export function IconSkull(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.2 4.7 3 6v3h9v-3c1.8-1.3 3-3.4 3-6A7.5 7.5 0 0 0 12 3z" />
      <circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10.5 19.5V17M13.5 19.5V17" />
    </Svg>
  );
}

/** Compass rose — the wayfinding mark used on the landing hero and brand. */
export function IconCompass(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
      <path d="M12 6.5L14 12l-2 5.5L10 12l2-5.5z" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Folded map with fold lines. */
export function IconMap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </Svg>
  );
}

/** Four expanding corners (fullscreen). */
export function IconExpand(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  );
}

/** Banded treasure chest (items / equipment). */
export function IconChest(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4V19H3v-8.5z" />
      <path d="M3 12.5h18M10 12.5v-2h4v2" />
      <path d="M10 15.5h4" />
    </Svg>
  );
}

/** Round-bottomed flask (potions, magic items). */
export function IconFlask(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 3h5M10.5 3v6L5.6 16.6A3 3 0 0 0 8.1 21h7.8a3 3 0 0 0 2.5-4.4L13.5 9V3" />
      <path d="M7.4 14h9.2" />
    </Svg>
  );
}

/** Two-wheeled cart (mounts and vehicles). */
export function IconCart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7h3l2.5 8h9l2.5-6H7" />
      <circle cx="10" cy="19" r="1.8" />
      <circle cx="17" cy="19" r="1.8" />
    </Svg>
  );
}

/** Right-pointing chevron — disclosure marker for collapsible sections. */
export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

/** Diagonal cross (delete / remove) — replaces raw ✕ glyphs. */
export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

// ---------- spell school sigils ----------

const SIGILS: Record<string, (props: IconProps) => React.ReactElement> = {
  Abjuration: (p) => (
    <Svg {...p}>
      <path d="M12 3l8 14H4l8-14z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </Svg>
  ),
  Conjuration: (p) => (
    <Svg {...p}>
      <rect x="5" y="5" width="14" height="14" />
      <circle cx="12" cy="12" r="4.5" />
    </Svg>
  ),
  Divination: (p) => (
    <Svg {...p}>
      <path d="M2.5 12C5.5 7 8.5 5 12 5s6.5 2 9.5 7c-3 5-6 7-9.5 7s-6.5-2-9.5-7z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Enchantment: (p) => (
    <Svg {...p}>
      <circle cx="9.5" cy="12" r="5.5" />
      <circle cx="14.5" cy="12" r="5.5" />
    </Svg>
  ),
  Evocation: (p) => (
    <Svg {...p}>
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M18.7 5.3l-3.5 3.5M8.8 15.2l-3.5 3.5" />
    </Svg>
  ),
  Illusion: (p) => (
    <Svg {...p}>
      <path d="M14 4a8 8 0 1 0 0 16 6.5 6.5 0 0 1 0-16z" />
      <path d="M16.5 8.5a4 4 0 0 1 0 7" />
    </Svg>
  ),
  Necromancy: (p) => <IconSkull {...p} />,
  Transmutation: (p) => (
    <Svg {...p}>
      <path d="M12 4l7 12H5l7-12z" />
      <circle cx="12" cy="4" r="1.8" />
      <circle cx="19" cy="16" r="1.8" />
      <circle cx="5" cy="16" r="1.8" />
    </Svg>
  ),
};

export function SchoolSigil({ school, ...props }: IconProps & { school: string }) {
  const Sigil = SIGILS[school];
  if (!Sigil) return <IconDie {...props} />;
  return <Sigil {...props} />;
}

// ---------- item category marks ----------

const ITEM_ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  weapon: IconSwords,
  armor: IconShield,
  gear: IconChest,
  tool: IconQuill,
  vehicle: IconCart,
  magic: IconFlask,
};

/** Category mark for an SRD item (`weapon`, `armor`, `gear`, …). */
export function ItemIcon({ category, ...props }: IconProps & { category: string }) {
  const Mark = ITEM_ICONS[category] ?? IconChest;
  return <Mark {...props} />;
}
