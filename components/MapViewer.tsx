"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconExpand } from "@/components/Icons";

type Transform = { x: number; y: number; scale: number };
type Labels = { zoomIn: string; zoomOut: string; reset: string; fullscreen: string };

/**
 * Pan/zoom image viewer for uploaded maps: drag to pan, wheel or pinch to
 * zoom, double-click to refit, fullscreen for the table TV. Pure CSS
 * transform with origin 0 0 — screen = translate + scale * imagePoint.
 */
export function MapViewer({
  src,
  alt,
  labels,
  className = "",
}: {
  src: string;
  alt: string;
  labels: Labels;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; midX: number; midY: number; start: Transform } | null>(null);
  const dragging = useRef(false);

  const clamp = (s: number) => Math.min(10, Math.max(0.05, s));

  function fit() {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    setT({
      scale,
      x: (cw - img.naturalWidth * scale) / 2,
      y: (ch - img.naturalHeight * scale) / 2,
    });
  }

  /** Zoom by `factor`, keeping the container point (px, py) fixed. */
  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setT((prev) => {
      const scale = Math.min(10, Math.max(0.05, prev.scale * factor));
      const k = scale / prev.scale;
      return { scale, x: px - k * (px - prev.x), y: py - k * (py - prev.y) };
    });
  }, []);

  function zoomCenter(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
  }

  // React's onWheel is passive — attach manually so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Refit whenever the container changes size (fullscreen toggle, resize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => fit());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

  function onPointerDown(e: React.PointerEvent) {
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) dragging.current = true;
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
      const scale = clamp(start.scale * (dist / Math.max(d0, 1)));
      const k = scale / start.scale;
      // Anchor the image point under the initial midpoint to the current one.
      setT({ scale, x: mid.x - k * (midX - start.x), y: mid.y - k * (midY - start.y) });
      return;
    }

    if (dragging.current && pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) dragging.current = false;
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

  return (
    <div
      ref={containerRef}
      className={`relative touch-none select-none overflow-hidden rounded-sm border border-ink-600 bg-ink-950 cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={fit}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={fit}
        className="absolute left-0 top-0 max-w-none origin-top-left"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
      />
      <div className="absolute right-2 top-2 flex gap-1">
        <button type="button" title={labels.zoomIn} aria-label={labels.zoomIn} className={btn} onClick={() => zoomCenter(1.3)}>
          +
        </button>
        <button type="button" title={labels.zoomOut} aria-label={labels.zoomOut} className={btn} onClick={() => zoomCenter(1 / 1.3)}>
          −
        </button>
        <button type="button" title={labels.reset} aria-label={labels.reset} className={btn} onClick={fit}>
          ⟲
        </button>
        <button type="button" title={labels.fullscreen} aria-label={labels.fullscreen} className={btn} onClick={toggleFullscreen}>
          <IconExpand size={15} />
        </button>
      </div>
    </div>
  );
}
