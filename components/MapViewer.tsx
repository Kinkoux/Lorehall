"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { IconExpand } from "@/components/Icons";
import { makeT, type Locale } from "@/lib/i18n";

type Transform = { x: number; y: number; scale: number };
type Labels = {
  zoomIn: string;
  zoomOut: string;
  reset: string;
  fullscreen: string;
  /** Optional — falls back to `campaign.maps.viewer.wheelHint` in the page's language. */
  wheelHint?: string;
  /** Optional — falls back to `campaign.maps.viewer.label` in the page's language. */
  viewerLabel?: string;
};
/** Square grid in pixels of the ORIGINAL image, aligned by the DM. */
export type MapGrid = { size: number; offsetX: number; offsetY: number };

const MAX_SCALE = 10;
/** Never let the map slide fully off: this much of it stays on each axis. */
const KEEP_VISIBLE = 0.18;
/** Softens button/double-click zoom only — drag and pinch stay direct. */
const SMOOTH_MS = 180;
/** Arrow-key pan, in screen pixels; Shift takes a page-sized stride instead. */
const PAN_STEP = 40;
const PAN_STEP_FAST = 200;
/** One press of the +/− keys or the toolbar buttons. */
const KEY_ZOOM = 1.3;
/** <html lang> is fixed for the life of the document — nothing to subscribe to. */
const NEVER_CHANGES = () => () => {};

/**
 * Wheel delta → zoom factor. Trackpads emit a stream of small deltas, so the
 * factor follows the delta magnitude instead of jumping a fixed step per tick.
 * `viewportHeight` only matters for page-mode (deltaMode 2) wheels.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, viewportHeight: number) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1;
  return Math.min(1.6, Math.max(1 / 1.6, Math.exp(-deltaY * unit * 0.0015)));
}

/**
 * Arrow key → transform delta, or null for a key the viewer does not pan with.
 * The keys move the *view*, so the image translates the other way: pressing
 * ArrowRight reveals what lies to the right by sliding the map left.
 */
export function keyboardPan(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? PAN_STEP_FAST : PAN_STEP;
  if (key === "ArrowLeft") return { dx: step, dy: 0 };
  if (key === "ArrowRight") return { dx: -step, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: step };
  if (key === "ArrowDown") return { dx: 0, dy: -step };
  return null;
}

/**
 * Pan/zoom image viewer for uploaded maps: drag to pan, wheel or pinch to
 * zoom, arrow keys to pan, double-click to refit, fullscreen for the table TV.
 * Pure CSS transform with origin 0 0 — screen = translate + scale * imagePoint.
 * The optional grid is drawn in image space so it pans and zooms with the map.
 *
 * Embedded in a page the viewer is a good neighbour and never eats the page's
 * own scroll: the wheel zooms only with Ctrl/Cmd held, and a lone finger scrolls
 * the page (`touch-pan-y`) while two fingers pinch and pan the map. Fullscreen
 * is the map's own screen, so there every gesture goes straight to the map.
 */
export function MapViewer({
  src,
  alt,
  labels,
  grid = null,
  className = "",
}: {
  src: string;
  alt: string;
  labels: Labels;
  grid?: MapGrid | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [smooth, setSmooth] = useState(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; midX: number; midY: number; start: Transform } | null>(null);
  const dragging = useRef(false);
  /** Scale that fits the whole map — the floor for zooming out is half of it. */
  const fitScale = useRef(0);
  const smoothTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patternId = `mapgrid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Gesture rules differ inside fullscreen, so the viewer has to know it is
  // there. Both of these read the DOM rather than React state, and both must
  // start out false/"en" on the server to hydrate without a mismatch.
  const subscribeFullscreen = useCallback((onChange: () => void) => {
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const isFull = useSyncExternalStore(
    subscribeFullscreen,
    // The ref is still empty on the first render, and an unset fullscreenElement
    // is null too — without the guard `null === null` would claim fullscreen.
    () => containerRef.current !== null && document.fullscreenElement === containerRef.current,
    () => false
  );

  // The page's language lives on <html lang>, and the two call sites pass their
  // own strings in `labels`; this is the fallback when they do not.
  const locale = useSyncExternalStore<Locale>(
    NEVER_CHANGES,
    () => (document.documentElement.lang === "tr" ? "tr" : "en"),
    () => "en"
  );

  const t9n = makeT(locale);
  const wheelHint = labels.wheelHint ?? t9n("campaign.maps.viewer.wheelHint");
  const viewerLabel = labels.viewerLabel ?? t9n("campaign.maps.viewer.label");

  const clampScale = useCallback((s: number) => {
    const fitS = fitScale.current;
    const min = fitS > 0 ? fitS * 0.5 : 0.05;
    const max = Math.max(MAX_SCALE, fitS);
    return Math.min(max, Math.max(min, s));
  }, []);

  /** Clamp scale, then keep a slice of the image inside the viewport. */
  const clampT = useCallback(
    (next: Transform): Transform => {
      const container = containerRef.current;
      const img = imgRef.current;
      const scale = clampScale(next.scale);
      if (!container || !img?.naturalWidth) return { ...next, scale };
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const keepX = Math.min(dw, cw) * KEEP_VISIBLE;
      const keepY = Math.min(dh, ch) * KEEP_VISIBLE;
      return {
        scale,
        x: Math.min(cw - keepX, Math.max(keepX - dw, next.x)),
        y: Math.min(ch - keepY, Math.max(keepY - dh, next.y)),
      };
    },
    [clampScale]
  );

  const stopSmooth = useCallback(() => {
    if (smoothTimer.current) clearTimeout(smoothTimer.current);
    smoothTimer.current = null;
    setSmooth(false);
  }, []);

  /** Animate the next transform commit, unless the reader asked for less motion. */
  const startSmooth = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (smoothTimer.current) clearTimeout(smoothTimer.current);
    setSmooth(true);
    smoothTimer.current = setTimeout(() => setSmooth(false), SMOOTH_MS + 60);
  }, []);

  useEffect(() => () => stopSmooth(), [stopSmooth]);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img?.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    fitScale.current = scale;
    setT({
      scale,
      x: (cw - img.naturalWidth * scale) / 2,
      y: (ch - img.naturalHeight * scale) / 2,
    });
  }, []);

  /** Zoom by `factor`, keeping the container point (px, py) fixed. */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setT((prev) => {
        const scale = clampScale(prev.scale * factor);
        const k = scale / prev.scale;
        return clampT({ scale, x: px - k * (px - prev.x), y: py - k * (py - prev.y) });
      });
    },
    [clampScale, clampT]
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      startSmooth();
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
    },
    [startSmooth, zoomAt]
  );

  // React's onWheel is passive — attach manually so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // In the page, a plain wheel belongs to the page: let it through untouched
      // so scrolling past a tall map still works. Ctrl/Cmd asks for zoom, and a
      // trackpad pinch arrives as a ctrlKey wheel, so that lands here too.
      if (!isFull && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      stopSmooth();
      const rect = el.getBoundingClientRect();
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, el.clientHeight);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isFull, stopSmooth, zoomAt]);

  const handleLoaded = useCallback(() => {
    const img = imgRef.current;
    if (img?.naturalWidth) setNat({ w: img.naturalWidth, h: img.naturalHeight });
    fit();
  }, [fit]);

  // A cached image can already be decoded before React attaches onLoad, so the
  // event never fires — without this the map opens unfitted at scale 1.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) handleLoaded();
  }, [src, handleLoaded]);

  // Refit whenever the container changes size (fullscreen toggle, resize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => fit());
    obs.observe(el);
    return () => obs.disconnect();
  }, [fit]);

  function containerPoint(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startPinchIfTwo() {
    if (pointers.current.size !== 2) return;
    const [a, b] = [...pointers.current.values()];
    const mid = containerPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      midX: mid.x,
      midY: mid.y,
      start: tRef.current,
    };
    dragging.current = false;
  }

  /**
   * One finger on an embedded map scrolls the page (see `touch-pan-y`), so only
   * two-finger gestures reach the map there. A mouse or pen has no such duty and
   * drags with one pointer everywhere, as does a finger in fullscreen.
   */
  function canDragWithOne(pointerType: string) {
    return isFull || pointerType !== "touch";
  }

  function onPointerDown(e: React.PointerEvent) {
    stopSmooth();
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1 && canDragWithOne(e.pointerType)) dragging.current = true;
    startPinchIfTwo();
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = containerPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const { start, dist: d0, midX, midY } = pinch.current;
      const scale = clampScale(start.scale * (dist / Math.max(d0, 1)));
      const k = scale / start.scale;
      // Anchor the image point under the initial midpoint to the current one.
      setT(clampT({ scale, x: mid.x - k * (midX - start.x), y: mid.y - k * (midY - start.y) }));
      return;
    }

    if (dragging.current && pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setT((p) => clampT({ ...p, x: p.x + dx, y: p.y + dy }));
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) dragging.current = false;
  }

  function refit() {
    startSmooth();
    fit();
  }

  /**
   * Keyboard driving for the focused viewer. Only the container's own key
   * presses count — while a toolbar button has focus its keys stay its own.
   */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    const pan = keyboardPan(e.key, e.shiftKey);
    if (pan) {
      e.preventDefault();
      stopSmooth();
      setT((p) => clampT({ ...p, x: p.x + pan.dx, y: p.y + pan.dy }));
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomCenter(KEY_ZOOM);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomCenter(1 / KEY_ZOOM);
    } else if (e.key === "0") {
      e.preventDefault();
      refit();
    }
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const btn =
    "flex h-8 w-8 items-center justify-center rounded-sm border border-ink-600 bg-ink-900/85 " +
    "font-bold text-parchment-100 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer";

  const layerStyle = {
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
    transition: smooth ? `transform ${SMOOTH_MS}ms ease-out` : "none",
  };

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={viewerLabel}
      tabIndex={0}
      className={
        "relative select-none overflow-hidden rounded-sm border border-ink-600 bg-ink-950 " +
        "cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:-outline-offset-2 " +
        `focus-visible:outline-gold-400 ${isFull ? "touch-none" : "touch-pan-y"} ${className}`
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={refit}
      onKeyDown={onKeyDown}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={handleLoaded}
        className="absolute left-0 top-0 max-w-none origin-top-left"
        style={layerStyle}
      />
      {grid && nat && (
        <svg
          aria-hidden
          width={nat.w}
          height={nat.h}
          viewBox={`0 0 ${nat.w} ${nat.h}`}
          className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
          style={layerStyle}
        >
          <defs>
            <pattern
              id={patternId}
              x={grid.offsetX}
              y={grid.offsetY}
              width={grid.size}
              height={grid.size}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`}
                fill="none"
                stroke="rgba(51,38,26,0.35)"
                strokeWidth={1.5}
              />
            </pattern>
          </defs>
          <rect x={0} y={0} width={nat.w} height={nat.h} fill={`url(#${patternId})`} />
        </svg>
      )}
      <div
        className="absolute right-2 top-2 flex gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" title={labels.zoomIn} aria-label={labels.zoomIn} className={btn} onClick={() => zoomCenter(1.3)}>
          +
        </button>
        <button type="button" title={labels.zoomOut} aria-label={labels.zoomOut} className={btn} onClick={() => zoomCenter(1 / 1.3)}>
          −
        </button>
        <button type="button" title={labels.reset} aria-label={labels.reset} className={btn} onClick={refit}>
          ⟲
        </button>
        <button type="button" title={labels.fullscreen} aria-label={labels.fullscreen} className={btn} onClick={toggleFullscreen}>
          <IconExpand size={15} />
        </button>
      </div>
      {/* Says why a plain wheel scrolls past the map. Fullscreen zooms freely, so
          there the badge would be a lie — and clutter on the table screen. */}
      {!isFull && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-ink-700/60 bg-ink-950/70 px-2 py-1 text-[11px] leading-none text-parchment-500/80"
        >
          {wheelHint}
        </div>
      )}
    </div>
  );
}
