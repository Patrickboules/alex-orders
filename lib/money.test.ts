import { describe, expect, it } from "vitest";
import { applyMultiplier, formatEGP, toPiasters } from "./money";

describe("toPiasters", () => {
  it("converts EGP to integer piasters", () => {
    expect(toPiasters(124)).toBe(12400);
    expect(toPiasters(37.5)).toBe(3750);
    expect(toPiasters(42.75)).toBe(4275);
    expect(toPiasters(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996
    expect(toPiasters(1.005)).toBe(100);
  });
});

describe("formatEGP", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatEGP(12400)).toBe("124 EGP");
    expect(formatEGP(4275)).toBe("42.75 EGP");
    expect(formatEGP(4250)).toBe("42.50 EGP");
    expect(formatEGP(0)).toBe("0 EGP");
    expect(formatEGP(125000)).toBe("1,250 EGP");
  });
});

describe("applyMultiplier", () => {
  it("rounds up to whole EGP", () => {
    expect(applyMultiplier(10000, 1.14)).toBe(11400);
    expect(applyMultiplier(20000, 1.14)).toBe(22800);
    expect(applyMultiplier(10000, 1.26)).toBe(12600);
    expect(applyMultiplier(3750, 1.14)).toBe(4300);
    expect(applyMultiplier(1, 1.14)).toBe(100);
    expect(applyMultiplier(0, 1.26)).toBe(0);
  });
  it("has no float error on exact multiples", () => {
    // 50 EGP × 1.14 = 57 exactly; naive float math gives 56.99999… or 57.0000001
    expect(applyMultiplier(5000, 1.14)).toBe(5700);
    expect(applyMultiplier(35000, 1.14)).toBe(39900);
    expect(applyMultiplier(15000, 1.26)).toBe(18900);
  });
});
