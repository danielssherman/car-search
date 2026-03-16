import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateQualityScore } from "@/lib/scoring";

// Fixed reference time: 2026-03-16T00:00:00.000Z
const NOW = new Date("2026-03-16T00:00:00.000Z").getTime();

/** Helper to build a vehicle object with sensible defaults that can be overridden. */
function makeVehicle(overrides: Partial<{
  price: number;
  first_seen: string;
  mileage: number;
  condition: string;
  status: string;
  packages: string;
}> = {}) {
  return {
    price: 50000,
    first_seen: new Date(NOW).toISOString(),         // today (0 days on lot)
    mileage: 0,
    condition: "New",
    status: "In Stock",
    packages: "[]",
    ...overrides,
  };
}

describe("calculateQualityScore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------
  // Composite / end-to-end scores
  // ---------------------------------------------------------------

  describe("composite scores", () => {
    it("returns 100 for a perfect-score vehicle", () => {
      // price 20% below market -> 35pts
      // 61 days on lot -> 20pts (capped)
      // New -> 15pts condition + 10pts mileage
      // In Stock -> 10pts
      // 5 packages -> 10pts
      const vehicle = makeVehicle({
        price: 40000,
        first_seen: new Date(NOW - 61 * 86400000).toISOString(),
        condition: "New",
        mileage: 0,
        status: "In Stock",
        packages: JSON.stringify(["M Sport", "Premium", "Executive", "Tech", "Driver Assist"]),
      });
      expect(calculateQualityScore(vehicle, 50000)).toBe(100);
    });

    it("returns 9 for a minimum-score vehicle", () => {
      // price 20% above market -> 0pts
      // 0 days on lot -> 0pts
      // Used -> 5pts condition
      // 60000+ mileage (Used) -> 1pt
      // Not In Stock -> 3pts
      // no packages -> 0pts
      const vehicle = makeVehicle({
        price: 60000,
        first_seen: new Date(NOW).toISOString(),
        condition: "Used",
        mileage: 100000,
        status: "In Transit",
        packages: "[]",
      });
      expect(calculateQualityScore(vehicle, 50000)).toBe(9);
    });
  });

  // ---------------------------------------------------------------
  // Factor 1: Price vs market average (0-35 pts)
  // ---------------------------------------------------------------

  describe("price vs market average", () => {
    // Use baseline: New, 0 days, In Stock, no packages
    // Non-price factors contribute: 0 (days) + 15 (New) + 10 (mileage) + 10 (status) + 0 (pkgs) = 35
    const BASE = 35;

    it("gives 17.5pts (rounds to 18) when price equals market avg", () => {
      const v = makeVehicle({ price: 50000 });
      // 17.5 + 0 * 87.5 = 17.5 -> round(17.5 + 35) = round(52.5) = 53
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(17.5 + BASE));
    });

    it("gives 35pts (max) when price is 20% below market", () => {
      const v = makeVehicle({ price: 40000 });
      // pctDiff = (50000-40000)/50000 = 0.2
      // 17.5 + 0.2 * 87.5 = 35
      expect(calculateQualityScore(v, 50000)).toBe(35 + BASE);
    });

    it("gives 35pts (max) when price is >20% below market (clamped)", () => {
      const v = makeVehicle({ price: 30000 });
      // pctDiff = 0.4 -> 17.5 + 35 = 52.5 -> min(35, 52.5) = 35
      expect(calculateQualityScore(v, 50000)).toBe(35 + BASE);
    });

    it("gives 0pts when price is 20% above market", () => {
      const v = makeVehicle({ price: 60000 });
      // pctDiff = (50000-60000)/50000 = -0.2
      // 17.5 + (-0.2) * 87.5 = 0
      expect(calculateQualityScore(v, 50000)).toBe(0 + BASE);
    });

    it("gives 0pts when price is 40% above market (clamped)", () => {
      const v = makeVehicle({ price: 70000 });
      // pctDiff = -0.4 -> 17.5 + (-35) = -17.5 -> max(0, -17.5) = 0
      expect(calculateQualityScore(v, 50000)).toBe(0 + BASE);
    });

    it("gives 17pts fallback when marketAvg is 0", () => {
      const v = makeVehicle({ price: 50000 });
      expect(calculateQualityScore(v, 0)).toBe(17 + BASE);
    });

    it("gives 17pts fallback when price is 0", () => {
      const v = makeVehicle({ price: 0 });
      expect(calculateQualityScore(v, 50000)).toBe(17 + BASE);
    });

    it("gives 17pts fallback when both price and marketAvg are 0", () => {
      const v = makeVehicle({ price: 0 });
      expect(calculateQualityScore(v, 0)).toBe(17 + BASE);
    });

    it("gives correct fractional score for 10% below market", () => {
      const v = makeVehicle({ price: 45000 });
      // pctDiff = 0.1 -> 17.5 + 0.1 * 87.5 = 26.25
      // total = 26.25 + 35 = 61.25 -> round = 61
      expect(calculateQualityScore(v, 50000)).toBe(61);
    });

    it("gives correct fractional score for 10% above market", () => {
      const v = makeVehicle({ price: 55000 });
      // pctDiff = -0.1 -> 17.5 + (-8.75) = 8.75
      // total = 8.75 + 35 = 43.75 -> round = 44
      expect(calculateQualityScore(v, 50000)).toBe(44);
    });
  });

  // ---------------------------------------------------------------
  // Factor 2: Days on lot (0-20 pts)
  // ---------------------------------------------------------------

  describe("days on lot", () => {
    // Use: price at market avg (17.5pts), New (15+10), In Stock (10), no pkgs (0)
    // Non-days factors = 17.5 + 15 + 10 + 10 + 0 = 52.5
    const BASE = 52.5;

    it("gives 0pts for 0 days on lot (listed today)", () => {
      const v = makeVehicle({ first_seen: new Date(NOW).toISOString() });
      // 0 * 0.33 = 0
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(0 + BASE));
    });

    it("gives ~9.9pts for 30 days on lot", () => {
      const v = makeVehicle({
        first_seen: new Date(NOW - 30 * 86400000).toISOString(),
      });
      // 30 * 0.33 = 9.9
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(9.9 + BASE));
    });

    it("gives 20pts (max) for 61 days on lot", () => {
      const v = makeVehicle({
        first_seen: new Date(NOW - 61 * 86400000).toISOString(),
      });
      // 61 * 0.33 = 20.13 -> min(20, 20.13) = 20
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(20 + BASE));
    });

    it("caps at 20pts for 120 days on lot", () => {
      const v = makeVehicle({
        first_seen: new Date(NOW - 120 * 86400000).toISOString(),
      });
      // 120 * 0.33 = 39.6 -> min(20, 39.6) = 20
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(20 + BASE));
    });

    it("gives 0pts when first_seen is in the future (negative days clamped to 0)", () => {
      const v = makeVehicle({
        first_seen: new Date(NOW + 5 * 86400000).toISOString(),
      });
      // days = max(0, floor(negative)) = 0
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(0 + BASE));
    });

    it("gives fractional points for 10 days", () => {
      const v = makeVehicle({
        first_seen: new Date(NOW - 10 * 86400000).toISOString(),
      });
      // 10 * 0.33 = 3.3
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(3.3 + BASE));
    });
  });

  // ---------------------------------------------------------------
  // Factor 3: Condition (0-15 pts)
  // ---------------------------------------------------------------

  describe("condition scoring", () => {
    // Baseline: price at market avg (17.5), 0 days (0), In Stock (10), no pkgs (0)
    // Mileage depends on condition, so we test condition+mileage together
    // For "New": condition=15, mileage=10 -> cond+mile=25
    // For "CPO": condition=10, mileage depends on mileage value
    // For "Used": condition=5, mileage depends

    // Use: 0 mileage, so CPO/Used get 10pts mileage (< 15000)
    // Non-condition/mileage base: 17.5 (price) + 0 (days) + 10 (status) + 0 (pkgs) = 27.5

    const PRICE_DAYS_STATUS_PKG = 27.5;

    it("gives 15pts for New condition", () => {
      const v = makeVehicle({ condition: "New", mileage: 0 });
      // condition=15, mileage=10 (New always gets 10)
      expect(calculateQualityScore(v, 50000)).toBe(
        Math.round(PRICE_DAYS_STATUS_PKG + 15 + 10)
      );
    });

    it("gives 10pts for CPO condition", () => {
      const v = makeVehicle({ condition: "CPO", mileage: 0 });
      // condition=10, mileage=10 (0 < 15000)
      expect(calculateQualityScore(v, 50000)).toBe(
        Math.round(PRICE_DAYS_STATUS_PKG + 10 + 10)
      );
    });

    it("gives 5pts for Used condition", () => {
      const v = makeVehicle({ condition: "Used", mileage: 0 });
      // condition=5, mileage=10 (0 < 15000)
      expect(calculateQualityScore(v, 50000)).toBe(
        Math.round(PRICE_DAYS_STATUS_PKG + 5 + 10)
      );
    });

    it("gives 5pts for unknown condition string", () => {
      const v = makeVehicle({ condition: "Refurbished", mileage: 0 });
      // Falls to else: condition=5, mileage=10 (0 < 15000, non-New path)
      expect(calculateQualityScore(v, 50000)).toBe(
        Math.round(PRICE_DAYS_STATUS_PKG + 5 + 10)
      );
    });
  });

  // ---------------------------------------------------------------
  // Factor 4: Mileage (0-10 pts)
  // ---------------------------------------------------------------

  describe("mileage scoring", () => {
    // Use: price at market avg (17.5), 0 days (0), Used (5), In Stock (10), no pkgs (0)
    // Non-mileage base for Used: 17.5 + 0 + 5 + 10 + 0 = 32.5
    const USED_BASE = 32.5;

    it("gives 10pts for New regardless of mileage value", () => {
      // New base: 17.5 + 0 + 15 + 10 + 0 = 42.5
      const NEW_BASE = 42.5;
      const v = makeVehicle({ condition: "New", mileage: 50000 });
      // New always gets 10pts mileage
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(NEW_BASE + 10));
    });

    it("gives 10pts for 0 mileage (Used)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 0 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 10));
    });

    it("gives 10pts for 14999 mileage (Used, just under boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 14999 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 10));
    });

    it("gives 7pts for 15000 mileage (Used, at boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 15000 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 7));
    });

    it("gives 7pts for 29999 mileage (Used, just under next boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 29999 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 7));
    });

    it("gives 4pts for 30000 mileage (Used, at boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 30000 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 4));
    });

    it("gives 4pts for 59999 mileage (Used, just under next boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 59999 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 4));
    });

    it("gives 1pt for 60000 mileage (Used, at boundary)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 60000 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 1));
    });

    it("gives 1pt for very high mileage (Used)", () => {
      const v = makeVehicle({ condition: "Used", mileage: 200000 });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(USED_BASE + 1));
    });

    it("treats CPO mileage the same as Used", () => {
      // CPO base: 17.5 + 0 + 10 + 10 + 0 = 37.5
      const CPO_BASE = 37.5;
      const v = makeVehicle({ condition: "CPO", mileage: 25000 });
      // 15000 <= 25000 < 30000 -> 7pts
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(CPO_BASE + 7));
    });
  });

  // ---------------------------------------------------------------
  // Factor 5: Status (0-10 pts)
  // ---------------------------------------------------------------

  describe("status scoring", () => {
    // Use: price at market avg (17.5), 0 days (0), New (15+10), no pkgs (0)
    // Non-status base: 17.5 + 0 + 15 + 10 + 0 = 42.5
    const BASE = 42.5;

    it("gives 10pts for 'In Stock'", () => {
      const v = makeVehicle({ status: "In Stock" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 10));
    });

    it("gives 3pts for 'In Transit'", () => {
      const v = makeVehicle({ status: "In Transit" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 3));
    });

    it("gives 3pts for any non-'In Stock' string", () => {
      const v = makeVehicle({ status: "Ordered" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 3));
    });

    it("gives 3pts for empty status string", () => {
      const v = makeVehicle({ status: "" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 3));
    });
  });

  // ---------------------------------------------------------------
  // Factor 6: Packages (0-10 pts)
  // ---------------------------------------------------------------

  describe("packages scoring", () => {
    // Use: price at market avg (17.5), 0 days (0), New (15+10), In Stock (10)
    // Non-pkg base: 17.5 + 0 + 15 + 10 + 10 = 52.5
    const BASE = 52.5;

    it("gives 0pts for empty array '[]'", () => {
      const v = makeVehicle({ packages: "[]" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 0));
    });

    it("gives 2pts for 1 package", () => {
      const v = makeVehicle({
        packages: JSON.stringify(["M Sport"]),
      });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 2));
    });

    it("gives 6pts for 3 packages", () => {
      const v = makeVehicle({
        packages: JSON.stringify(["M Sport", "Premium", "Executive"]),
      });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 6));
    });

    it("gives 10pts (max) for 5 packages", () => {
      const v = makeVehicle({
        packages: JSON.stringify(["A", "B", "C", "D", "E"]),
      });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 10));
    });

    it("caps at 10pts for more than 5 packages", () => {
      const v = makeVehicle({
        packages: JSON.stringify(["A", "B", "C", "D", "E", "F", "G"]),
      });
      // 7 * 2 = 14 -> min(10, 14) = 10
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 10));
    });

    it("gives 0pts for invalid JSON (graceful fallback)", () => {
      const v = makeVehicle({ packages: "not valid json{" });
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 0));
    });

    it("gives 0pts for empty string (parsed as empty array)", () => {
      const v = makeVehicle({ packages: "" });
      // JSON.parse("" || "[]") = JSON.parse("[]") = [] -> length 0
      expect(calculateQualityScore(v, 50000)).toBe(Math.round(BASE + 0));
    });
  });

  // ---------------------------------------------------------------
  // Final clamping and rounding
  // ---------------------------------------------------------------

  describe("clamping and rounding", () => {
    it("never returns a score above 100", () => {
      // Even if somehow all factors maximized, it should cap at 100
      const v = makeVehicle({
        price: 10000,
        first_seen: new Date(NOW - 200 * 86400000).toISOString(),
        condition: "New",
        mileage: 0,
        status: "In Stock",
        packages: JSON.stringify(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]),
      });
      const score = calculateQualityScore(v, 50000);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("never returns a score below 0", () => {
      // Even with worst possible inputs
      const v = makeVehicle({
        price: 999999,
        first_seen: new Date(NOW).toISOString(),
        condition: "Junk",
        mileage: 500000,
        status: "Unknown",
        packages: "invalid",
      });
      const score = calculateQualityScore(v, 50000);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("returns an integer (rounded)", () => {
      const v = makeVehicle({ price: 45000 }); // produces fractional price score
      const score = calculateQualityScore(v, 50000);
      expect(Number.isInteger(score)).toBe(true);
    });

    it("rounds 0.5 up (Math.round behavior)", () => {
      // Construct a case where the raw total is X.5
      // price at market avg = 17.5, 0 days = 0, New = 15+10, In Stock = 10, 0 pkgs = 0
      // total = 52.5 -> Math.round(52.5) = 53
      const v = makeVehicle();
      expect(calculateQualityScore(v, 50000)).toBe(53);
    });
  });
});
