import { describe, expect, it } from "vitest";

import { matchClass } from "@/lib/class-match";

/**
 * The needle list is order-sensitive: `includes` knows no word borders, so a
 * compound like "kara büyücü" is only read as a warlock because it is asked
 * about before the "büyücü" inside it. These pin that ordering — and the two
 * folds that keep ALL-CAPS Turkish from slipping past everything.
 */
describe("matchClass", () => {
  it("reads a class out of surrounding prose in either language", () => {
    expect(matchClass("Level 3 Wizard")).toBe("wizard");
    expect(matchClass("büyücü/hırsız")).toBe("wizard");
    expect(matchClass("SAVAŞÇI")).toBe("fighter");
  });

  it("reads a Turkish compound as its own class, not the word inside it", () => {
    expect(matchClass("Kara Büyücü")).toBe("warlock");
    expect(matchClass("KARA BÜYÜCÜ")).toBe("warlock");
    expect(matchClass("Doğuştan Büyücü")).toBe("sorcerer");
    // The bare word still means what it always meant.
    expect(matchClass("Büyücü")).toBe("wizard");
  });

  it("answers null for a class nobody recognises", () => {
    expect(matchClass("Muhasebeci")).toBeNull();
    expect(matchClass(null)).toBeNull();
  });
});
