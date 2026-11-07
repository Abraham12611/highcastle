import { describe, expect, it } from "vitest";
import { nextTrapIndex, rovingIndex } from "./focus.js";

describe("nextTrapIndex (modal focus trap)", () => {
  it("wraps forward past the last item", () => {
    expect(nextTrapIndex(2, 3, 1)).toBe(0);
  });
  it("wraps backward before the first item", () => {
    expect(nextTrapIndex(0, 3, -1)).toBe(2);
  });
  it("moves within bounds", () => {
    expect(nextTrapIndex(0, 3, 1)).toBe(1);
    expect(nextTrapIndex(2, 3, -1)).toBe(1);
  });
  it("enters the trap when nothing is focused", () => {
    expect(nextTrapIndex(-1, 3, 1)).toBe(0);
    expect(nextTrapIndex(-1, 3, -1)).toBe(2);
  });
  it("returns -1 when there is nothing to focus", () => {
    expect(nextTrapIndex(0, 0, 1)).toBe(-1);
  });
});

describe("rovingIndex (tabs)", () => {
  const none = [false, false, false];

  it("moves right/left in horizontal orientation", () => {
    expect(rovingIndex(0, 3, "ArrowRight", "horizontal", none)).toBe(1);
    expect(rovingIndex(1, 3, "ArrowLeft", "horizontal", none)).toBe(0);
  });
  it("wraps at the edges", () => {
    expect(rovingIndex(2, 3, "ArrowRight", "horizontal", none)).toBe(0);
    expect(rovingIndex(0, 3, "ArrowLeft", "horizontal", none)).toBe(2);
  });
  it("uses up/down in vertical orientation", () => {
    expect(rovingIndex(0, 3, "ArrowDown", "vertical", none)).toBe(1);
    expect(rovingIndex(1, 3, "ArrowUp", "vertical", none)).toBe(0);
  });
  it("skips disabled items", () => {
    const disabled = [false, true, false];
    expect(rovingIndex(0, 3, "ArrowRight", "horizontal", disabled)).toBe(2);
    expect(rovingIndex(2, 3, "ArrowRight", "horizontal", disabled)).toBe(0);
  });
  it("honors Home and End", () => {
    expect(rovingIndex(1, 3, "Home", "horizontal", none)).toBe(0);
    expect(rovingIndex(1, 3, "End", "horizontal", none)).toBe(2);
    const disabled = [true, false, false];
    expect(rovingIndex(1, 3, "Home", "horizontal", disabled)).toBe(1);
  });
  it("ignores unhandled keys", () => {
    expect(rovingIndex(1, 3, "Enter", "horizontal", none)).toBe(1);
    expect(rovingIndex(1, 3, "a", "horizontal", none)).toBe(1);
  });
});
