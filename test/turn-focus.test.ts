import { describe, expect, it } from "vitest";

import { turnFocus } from "@/components/session/turn-focus";

/**
 * The play bar names two creatures out loud — whoever is acting and whoever
 * follows — so it has to read the initiative ring exactly as the list does.
 */

const order = [{ name: "Thalia" }, { name: "Goblin #1" }, { name: "Bran" }];

describe("turnFocus", () => {
  it("names the creature acting and the one after it", () => {
    expect(turnFocus(order, 0)).toEqual({ current: order[0], next: order[1] });
    expect(turnFocus(order, 1)).toEqual({ current: order[1], next: order[2] });
  });

  it("wraps back to the top of the order on the last turn", () => {
    expect(turnFocus(order, 2)).toEqual({ current: order[2], next: order[0] });
  });

  it("makes a lone combatant both the current and the next turn", () => {
    const solo = [{ name: "Thalia" }];
    expect(turnFocus(solo, 0)).toEqual({ current: solo[0], next: solo[0] });
  });

  it("names nobody when the pointer falls outside the order", () => {
    // The initiative list highlights no row either — better silent than wrong.
    expect(turnFocus(order, 3)).toEqual({ current: null, next: null });
    expect(turnFocus(order, -1)).toEqual({ current: null, next: null });
    expect(turnFocus([], 0)).toEqual({ current: null, next: null });
  });
});
