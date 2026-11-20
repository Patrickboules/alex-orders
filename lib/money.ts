// Money helpers. All stored amounts are integers in piasters (1 EGP = 100 piasters).

import type { Multiplier } from "@/lib/types";

/** Converts an EGP amount (e.g. 37.5) to integer piasters (3750). */
export function toPiasters(egp: number): number {
  if (!Number.isFinite(egp)) return 0;
  return Math.round(egp * 100);
}

/** Converts piasters to EGP as a number (3750 -> 37.5). */
export function toEGP(piasters: number): number {
  return piasters / 100;
}

/** "124 EGP", "42.75 EGP", "1,250 EGP". */
export function formatEGP(piasters: number): string {
  const p = Math.round(piasters);
  const whole = p % 100 === 0;
  const value = (p / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${value} EGP`;
}

/**
 * subtotal × multiplier, rounded UP to a whole EGP, in piasters.
 * Uses integer math (multiplier as hundredths) so 3750 × 1.14 is exactly 4275 -> 4300.
 */
export function applyMultiplier(subtotal: number, multiplier: Multiplier | number): number {
  if (subtotal <= 0) return 0;
  const hundredths = Math.round(multiplier * 100); // 114 or 126
  // subtotal (piasters) × hundredths / 100 = piasters; / 100 again = EGP.
  return Math.ceil((subtotal * hundredths) / 10000) * 100;
}
