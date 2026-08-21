import { describe, expect, it } from "vitest";
import { keyboardPan, wheelZoomFactor } from "@/components/MapViewer";

describe("wheelZoomFactor", () => {
  it("zooms in on a scroll up and out on a scroll down", () => {
    expect(wheelZoomFactor(-100, 0, 500)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, 500)).toBeLessThan(1);
    expect(wheelZoomFactor(0, 0, 500)).toBe(1);
  });

  it("stays within one step per tick, however violent the delta", () => {
    expect(wheelZoomFactor(-100_000, 0, 500)).toBeCloseTo(1.6, 5);
    expect(wheelZoomFactor(100_000, 0, 500)).toBeCloseTo(1 / 1.6, 5);
  });

  it("scales line and page deltas up to pixels", () => {
    // deltaMode 1 counts lines (16px each), 2 counts viewports.
    expect(wheelZoomFactor(-3, 1, 500)).toBeCloseTo(wheelZoomFactor(-48, 0, 500), 10);
    expect(wheelZoomFactor(-0.05, 2, 500)).toBeCloseTo(wheelZoomFactor(-25, 0, 500), 10);
  });
});

describe("keyboardPan", () => {
  it("moves the view toward the key, so the image slides the other way", () => {
    expect(keyboardPan("ArrowRight", false)).toEqual({ dx: -40, dy: 0 });
    expect(keyboardPan("ArrowLeft", false)).toEqual({ dx: 40, dy: 0 });
    expect(keyboardPan("ArrowDown", false)).toEqual({ dx: 0, dy: -40 });
    expect(keyboardPan("ArrowUp", false)).toEqual({ dx: 0, dy: 40 });
  });

  it("takes a long stride with shift held", () => {
    expect(keyboardPan("ArrowRight", true)).toEqual({ dx: -200, dy: 0 });
    expect(keyboardPan("ArrowUp", true)).toEqual({ dx: 0, dy: 200 });
  });

  it("ignores keys it does not pan with", () => {
    for (const key of ["a", "Enter", "Tab", "0", "+", "PageDown"]) {
      expect(keyboardPan(key, false)).toBeNull();
    }
  });
});
