import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// Each test gets a unique temp DB file via DATABASE_PATH env var.
// We must set it BEFORE importing db.ts so the module reads the right path.

let tmpDir: string;
let dbPath: string;

// Dynamic imports so we can set DATABASE_PATH first
let getDb: typeof import("@/lib/db").getDb;
let _resetDb: typeof import("@/lib/db")._resetDb;
let getVehicles: typeof import("@/lib/db").getVehicles;
let countVehicles: typeof import("@/lib/db").countVehicles;
let getVehicleByVin: typeof import("@/lib/db").getVehicleByVin;
let getStats: typeof import("@/lib/db").getStats;
let upsertVehicles: typeof import("@/lib/db").upsertVehicles;
let getPriceDrops: typeof import("@/lib/db").getPriceDrops;
let getNewVehicles: typeof import("@/lib/db").getNewVehicles;
let getDealers: typeof import("@/lib/db").getDealers;
let getPriceHistory: typeof import("@/lib/db").getPriceHistory;

import type { ScrapedVehicle } from "@/lib/types";

/** Build a ScrapedVehicle with sensible defaults. */
function makeScrapedVehicle(overrides: Partial<ScrapedVehicle> = {}): ScrapedVehicle {
  return {
    vin: "WBA00000000000001",
    year: 2025,
    make: "BMW",
    model: "X5",
    trim: "xDrive40i",
    body_style: "SUV",
    drivetrain: "AWD",
    engine: "3.0L I6",
    fuel_type: "Gasoline",
    mileage: 0,
    condition: "New",
    exterior_color: "Black Sapphire",
    interior_color: "Cognac",
    msrp: 65000,
    source: "dealer",
    dealer_name: "Stevens Creek BMW",
    dealer_city: "San Jose",
    status: "In Stock",
    packages: ["Premium Package", "M Sport"],
    stock_number: "SC12345",
    detail_url: "https://example.com/vehicle/1",
    ...overrides,
  };
}

beforeEach(async () => {
  // Create a unique temp dir per test for the DB file
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-test-"));
  dbPath = path.join(tmpDir, "test.db");
  process.env.DATABASE_PATH = dbPath;

  // Reset singleton so next getDb() picks up the new path
  const dbModule = await import("@/lib/db");
  getDb = dbModule.getDb;
  _resetDb = dbModule._resetDb;
  getVehicles = dbModule.getVehicles;
  countVehicles = dbModule.countVehicles;
  getVehicleByVin = dbModule.getVehicleByVin;
  getStats = dbModule.getStats;
  upsertVehicles = dbModule.upsertVehicles;
  getPriceDrops = dbModule.getPriceDrops;
  getNewVehicles = dbModule.getNewVehicles;
  getDealers = dbModule.getDealers;
  getPriceHistory = dbModule.getPriceHistory;

  _resetDb();
});

afterEach(() => {
  _resetDb();
  // Clean up temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }
});

describe("getVehicles", () => {
  it("returns empty array when no vehicles exist", () => {
    const vehicles = getVehicles({});
    expect(vehicles).toEqual([]);
  });

  it("returns inserted vehicles", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN001", msrp: 55000, model: "X3" });
    const v2 = makeScrapedVehicle({ vin: "VIN002", msrp: 75000, model: "X5" });
    upsertVehicles([v1, v2]);

    const vehicles = getVehicles({});
    expect(vehicles).toHaveLength(2);
    expect(vehicles.map((v) => v.vin).sort()).toEqual(["VIN001", "VIN002"]);
  });

  it("returns best (cheapest active) listing price per vehicle", () => {
    // Insert a vehicle with two listings at different dealers (different prices)
    const v1 = makeScrapedVehicle({
      vin: "VIN_BEST",
      msrp: 70000,
      dealer_name: "Dealer A",
      source: "dealer",
    });
    const v2 = makeScrapedVehicle({
      vin: "VIN_BEST",
      msrp: 65000,
      dealer_name: "Dealer B",
      source: "dealer",
    });
    upsertVehicles([v1]);
    upsertVehicles([v2]);

    const vehicles = getVehicles({});
    expect(vehicles).toHaveLength(1);
    // Should return the cheapest price (65000)
    expect(vehicles[0].price).toBe(65000);
    expect(vehicles[0].listing_count).toBe(2);
  });

  it("filters by make", () => {
    const bmw = makeScrapedVehicle({ vin: "VIN_BMW", make: "BMW" });
    const mb = makeScrapedVehicle({ vin: "VIN_MB", make: "Mercedes-Benz" });
    upsertVehicles([bmw, mb]);

    const result = getVehicles({ make: "BMW" });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_BMW");
  });

  it("filters by model", () => {
    const x3 = makeScrapedVehicle({ vin: "VIN_X3", model: "X3" });
    const x5 = makeScrapedVehicle({ vin: "VIN_X5", model: "X5" });
    upsertVehicles([x3, x5]);

    const result = getVehicles({ model: "X3" });
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("X3");
  });

  it("filters by multiple models", () => {
    const x3 = makeScrapedVehicle({ vin: "VIN_X3", model: "X3" });
    const x5 = makeScrapedVehicle({ vin: "VIN_X5", model: "X5" });
    const x7 = makeScrapedVehicle({ vin: "VIN_X7", model: "X7" });
    upsertVehicles([x3, x5, x7]);

    const result = getVehicles({ models: ["X3", "X5"] });
    expect(result).toHaveLength(2);
  });

  it("filters by dealer", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_SC", dealer_name: "Stevens Creek BMW" });
    const v2 = makeScrapedVehicle({ vin: "VIN_FR", dealer_name: "BMW of Fremont" });
    upsertVehicles([v1, v2]);

    const result = getVehicles({ dealer: "Fremont" });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_FR");
  });

  it("filters by price range", () => {
    const cheap = makeScrapedVehicle({ vin: "VIN_CHEAP", msrp: 40000 });
    const mid = makeScrapedVehicle({ vin: "VIN_MID", msrp: 60000 });
    const expensive = makeScrapedVehicle({ vin: "VIN_EXP", msrp: 90000 });
    upsertVehicles([cheap, mid, expensive]);

    const result = getVehicles({ minPrice: 50000, maxPrice: 70000 });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_MID");
  });

  it("filters by condition", () => {
    const newCar = makeScrapedVehicle({ vin: "VIN_NEW", condition: "New" });
    const usedCar = makeScrapedVehicle({ vin: "VIN_USED", condition: "Used" });
    upsertVehicles([newCar, usedCar]);

    const result = getVehicles({ condition: "New" });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_NEW");
  });

  it("filters by status", () => {
    const inStock = makeScrapedVehicle({ vin: "VIN_STOCK", status: "In Stock" });
    const inTransit = makeScrapedVehicle({ vin: "VIN_TRANSIT", status: "In Transit" });
    upsertVehicles([inStock, inTransit]);

    const result = getVehicles({ status: "in_stock" });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_STOCK");
  });

  it("filters by color", () => {
    const black = makeScrapedVehicle({ vin: "VIN_BLK", exterior_color: "Black Sapphire" });
    const white = makeScrapedVehicle({ vin: "VIN_WHT", exterior_color: "Alpine White" });
    upsertVehicles([black, white]);

    const result = getVehicles({ color: "Alpine" });
    expect(result).toHaveLength(1);
    expect(result[0].vin).toBe("VIN_WHT");
  });

  it("filters by search term", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_SEARCH1", model: "X5" });
    const v2 = makeScrapedVehicle({ vin: "VIN_SEARCH2", model: "3 Series" });
    upsertVehicles([v1, v2]);

    const result = getVehicles({ search: "X5" });
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("X5");
  });

  it("sorts by price ascending", () => {
    const cheap = makeScrapedVehicle({ vin: "VIN_C", msrp: 40000 });
    const exp = makeScrapedVehicle({ vin: "VIN_E", msrp: 90000 });
    upsertVehicles([exp, cheap]);

    const result = getVehicles({ sort: "price_asc" });
    expect(result[0].price).toBe(40000);
    expect(result[1].price).toBe(90000);
  });

  it("respects limit and offset", () => {
    const vehicles = Array.from({ length: 10 }, (_, i) =>
      makeScrapedVehicle({
        vin: `VIN_PAGE_${String(i).padStart(2, "0")}`,
        msrp: 50000 + i * 1000,
      })
    );
    upsertVehicles(vehicles);

    const page1 = getVehicles({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = getVehicles({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    // No overlap
    const page1Vins = new Set(page1.map((v) => v.vin));
    for (const v of page2) {
      expect(page1Vins.has(v.vin)).toBe(false);
    }
  });
});

describe("countVehicles", () => {
  it("returns 0 when no vehicles exist", () => {
    expect(countVehicles({})).toBe(0);
  });

  it("count matches actual results", () => {
    const vehicles = Array.from({ length: 5 }, (_, i) =>
      makeScrapedVehicle({ vin: `VIN_CNT_${i}` })
    );
    upsertVehicles(vehicles);

    const count = countVehicles({});
    const actual = getVehicles({ limit: 1000 });
    expect(count).toBe(actual.length);
    expect(count).toBe(5);
  });

  it("count matches filtered results", () => {
    const bmw1 = makeScrapedVehicle({ vin: "VIN_B1", make: "BMW" });
    const bmw2 = makeScrapedVehicle({ vin: "VIN_B2", make: "BMW" });
    const mb = makeScrapedVehicle({ vin: "VIN_M1", make: "Mercedes-Benz" });
    upsertVehicles([bmw1, bmw2, mb]);

    const filters = { make: "BMW" };
    const count = countVehicles(filters);
    const actual = getVehicles({ ...filters, limit: 1000 });
    expect(count).toBe(actual.length);
    expect(count).toBe(2);
  });
});

describe("getVehicleByVin", () => {
  it("returns undefined for non-existent VIN", () => {
    expect(getVehicleByVin("NONEXISTENT")).toBeUndefined();
  });

  it("returns vehicle with listing data", () => {
    const v = makeScrapedVehicle({ vin: "VIN_DETAIL", msrp: 72000, model: "X7" });
    upsertVehicles([v]);

    const result = getVehicleByVin("VIN_DETAIL");
    expect(result).toBeDefined();
    expect(result!.vin).toBe("VIN_DETAIL");
    expect(result!.price).toBe(72000);
    expect(result!.model).toBe("X7");
    expect(result!.listing_count).toBe(1);
  });
});

describe("getStats", () => {
  it("returns zeros when no vehicles exist", () => {
    const stats = getStats();
    expect(stats.total).toBe(0);
    expect(stats.avg_price).toBe(0);
    expect(stats.makes).toEqual([]);
    expect(stats.models).toEqual([]);
  });

  it("returns correct aggregates", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_S1", make: "BMW", model: "X3", msrp: 50000 });
    const v2 = makeScrapedVehicle({ vin: "VIN_S2", make: "BMW", model: "X5", msrp: 70000 });
    const v3 = makeScrapedVehicle({ vin: "VIN_S3", make: "Mercedes-Benz", model: "GLC", msrp: 60000 });
    upsertVehicles([v1, v2, v3]);

    const stats = getStats();
    expect(stats.total).toBe(3);
    expect(stats.avg_price).toBe(60000);
    expect(stats.min_price).toBe(50000);
    expect(stats.max_price).toBe(70000);
    expect(stats.makes).toContain("BMW");
    expect(stats.makes).toContain("Mercedes-Benz");
    expect(stats.models).toContain("X3");
    expect(stats.models).toContain("X5");
    expect(stats.models).toContain("GLC");
    expect(stats.count_by_make["BMW"]).toBe(2);
    expect(stats.count_by_make["Mercedes-Benz"]).toBe(1);
    expect(stats.total_dealers).toBe(1); // all from same dealer by default
  });

  it("counts distinct dealers", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_D1", dealer_name: "Dealer A" });
    const v2 = makeScrapedVehicle({ vin: "VIN_D2", dealer_name: "Dealer B" });
    upsertVehicles([v1, v2]);

    const stats = getStats();
    expect(stats.total_dealers).toBe(2);
  });

  it("makes list is sorted alphabetically", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_M1", make: "Volvo" });
    const v2 = makeScrapedVehicle({ vin: "VIN_M2", make: "BMW" });
    const v3 = makeScrapedVehicle({ vin: "VIN_M3", make: "Audi" });
    upsertVehicles([v1, v2, v3]);

    const stats = getStats();
    expect(stats.makes).toEqual(["Audi", "BMW", "Volvo"]);
  });
});

describe("price history dedup", () => {
  it("inserting same price twice creates only one price_history entry", () => {
    const v = makeScrapedVehicle({ vin: "VIN_DEDUP", msrp: 55000 });

    // First upsert — creates vehicle + listing + price_history
    upsertVehicles([v]);

    // Second upsert — same price, should NOT add another price_history row
    upsertVehicles([v]);

    const history = getPriceHistory("VIN_DEDUP");
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(55000);
  });

  it("different prices create separate price_history entries", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_PRICE_CHG", msrp: 55000 });
    upsertVehicles([v1]);

    const v2 = makeScrapedVehicle({ vin: "VIN_PRICE_CHG", msrp: 52000 });
    upsertVehicles([v2]);

    const history = getPriceHistory("VIN_PRICE_CHG");
    expect(history).toHaveLength(2);
    expect(history[0].price).toBe(55000);
    expect(history[1].price).toBe(52000);
  });

  it("price reverting to original creates a new entry", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_REVERT", msrp: 55000 });
    upsertVehicles([v1]);

    const v2 = makeScrapedVehicle({ vin: "VIN_REVERT", msrp: 52000 });
    upsertVehicles([v2]);

    const v3 = makeScrapedVehicle({ vin: "VIN_REVERT", msrp: 55000 });
    upsertVehicles([v3]);

    const history = getPriceHistory("VIN_REVERT");
    expect(history).toHaveLength(3);
  });
});

describe("getPriceDrops", () => {
  it("returns empty array when no price history exists", () => {
    const drops = getPriceDrops("2020-01-01");
    expect(drops).toEqual([]);
  });

  it("correctly identifies price decreases", () => {
    const db = getDb();

    // Insert vehicle directly with controlled timestamps
    db.prepare(`
      INSERT INTO vehicles (vin, year, make, model, trim, condition, exterior_color, interior_color, mileage, removed_at)
      VALUES ('VIN_DROP', 2025, 'BMW', 'X5', 'xDrive40i', 'New', 'Black', 'Cognac', 0, NULL)
    `).run();

    db.prepare(`
      INSERT INTO listings (vin, source, dealer_name, dealer_city, price, status, removed_at)
      VALUES ('VIN_DROP', 'dealer', 'Stevens Creek BMW', 'San Jose', 55000, 'In Stock', NULL)
    `).run();

    // Insert two price_history entries with controlled timestamps: 60000 first, then 55000
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_DROP", "dealer", "Stevens Creek BMW", 60000, "2026-03-15T00:00:00.000Z");
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_DROP", "dealer", "Stevens Creek BMW", 55000, "2026-03-16T00:00:00.000Z");

    const drops = getPriceDrops("2020-01-01");
    expect(drops.length).toBeGreaterThanOrEqual(1);

    const drop = drops.find((d) => d.vin === "VIN_DROP");
    expect(drop).toBeDefined();
    expect(drop!.old_price).toBe(60000);
    expect(drop!.new_price).toBe(55000);
    expect(drop!.drop_amount).toBe(5000);
    expect(drop!.drop_pct).toBeCloseTo(8.3, 0);
  });

  it("does not return price increases", () => {
    const db = getDb();

    // Insert vehicle directly
    db.prepare(`
      INSERT INTO vehicles (vin, year, make, model, trim, condition, exterior_color, interior_color, mileage, removed_at)
      VALUES ('VIN_INCREASE', 2025, 'BMW', 'X5', 'xDrive40i', 'New', 'Black', 'Cognac', 0, NULL)
    `).run();

    db.prepare(`
      INSERT INTO listings (vin, source, dealer_name, dealer_city, price, status, removed_at)
      VALUES ('VIN_INCREASE', 'dealer', 'Stevens Creek BMW', 'San Jose', 55000, 'In Stock', NULL)
    `).run();

    // Insert price_history: 50000 first, then 55000 (a price INCREASE)
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_INCREASE", "dealer", "Stevens Creek BMW", 50000, "2026-03-15T00:00:00.000Z");
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_INCREASE", "dealer", "Stevens Creek BMW", 55000, "2026-03-16T00:00:00.000Z");

    const drops = getPriceDrops("2020-01-01");
    const found = drops.find((d) => d.vin === "VIN_INCREASE");
    expect(found).toBeUndefined();
  });

  it("filters by since date", () => {
    const db = getDb();

    // Insert vehicle directly
    db.prepare(`
      INSERT INTO vehicles (vin, year, make, model, trim, condition, exterior_color, interior_color, mileage, removed_at)
      VALUES ('VIN_SINCE', 2025, 'BMW', 'X5', 'xDrive40i', 'New', 'Black', 'Cognac', 0, NULL)
    `).run();

    db.prepare(`
      INSERT INTO listings (vin, source, dealer_name, dealer_city, price, status, removed_at)
      VALUES ('VIN_SINCE', 'dealer', 'Stevens Creek BMW', 'San Jose', 55000, 'In Stock', NULL)
    `).run();

    // Price drop happened in 2025 (before the "since" date of 2026-01-01)
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_SINCE", "dealer", "Stevens Creek BMW", 60000, "2024-12-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO price_history (vin, source, dealer_name, price, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIN_SINCE", "dealer", "Stevens Creek BMW", 55000, "2025-01-01T00:00:00.000Z");

    const drops = getPriceDrops("2026-01-01");
    const found = drops.find((d) => d.vin === "VIN_SINCE");
    expect(found).toBeUndefined();
  });
});

describe("getNewVehicles", () => {
  it("returns vehicles added since a given date", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_NEW1" });
    upsertVehicles([v1]);

    // Get vehicles since a date in the past — should include our vehicle
    const result = getNewVehicles("2020-01-01");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.find((v) => v.vin === "VIN_NEW1")).toBeDefined();
  });

  it("does not return vehicles from before the since date", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_OLD1" });
    upsertVehicles([v1]);

    // Far future date — nothing should match
    const result = getNewVehicles("2099-01-01");
    expect(result).toHaveLength(0);
  });
});

describe("getDealers", () => {
  it("returns dealer info with vehicle counts", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_DLR1", dealer_name: "Dealer A", dealer_city: "San Jose" });
    const v2 = makeScrapedVehicle({ vin: "VIN_DLR2", dealer_name: "Dealer A", dealer_city: "San Jose" });
    const v3 = makeScrapedVehicle({ vin: "VIN_DLR3", dealer_name: "Dealer B", dealer_city: "Fremont" });
    upsertVehicles([v1, v2, v3]);

    const dealers = getDealers();
    expect(dealers).toHaveLength(2);

    const dealerA = dealers.find((d) => d.dealer_name === "Dealer A");
    expect(dealerA).toBeDefined();
    expect(dealerA!.vehicle_count).toBe(2);

    const dealerB = dealers.find((d) => d.dealer_name === "Dealer B");
    expect(dealerB).toBeDefined();
    expect(dealerB!.vehicle_count).toBe(1);
  });
});

describe("upsertVehicles", () => {
  it("reports correct found and new counts", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_UP1" });
    const v2 = makeScrapedVehicle({ vin: "VIN_UP2" });

    const result1 = upsertVehicles([v1, v2]);
    expect(result1.found).toBe(2);
    expect(result1.newCount).toBe(2);

    // Re-insert same VINs — should be 0 new
    const result2 = upsertVehicles([v1, v2]);
    expect(result2.found).toBe(2);
    expect(result2.newCount).toBe(0);
  });

  it("updates vehicle data on re-insert", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_UPDATE", exterior_color: "Black" });
    upsertVehicles([v1]);

    const v2 = makeScrapedVehicle({ vin: "VIN_UPDATE", exterior_color: "White" });
    upsertVehicles([v2]);

    const vehicle = getVehicleByVin("VIN_UPDATE");
    expect(vehicle).toBeDefined();
    expect(vehicle!.exterior_color).toBe("White");
  });

  it("does not overwrite price with 0", () => {
    const v1 = makeScrapedVehicle({ vin: "VIN_ZERO", msrp: 55000 });
    upsertVehicles([v1]);

    const v2 = makeScrapedVehicle({ vin: "VIN_ZERO", msrp: 0 });
    upsertVehicles([v2]);

    const vehicle = getVehicleByVin("VIN_ZERO");
    expect(vehicle).toBeDefined();
    expect(vehicle!.price).toBe(55000);
  });
});

describe("composite indexes", () => {
  it("idx_listings_vin_active_price index exists", () => {
    const db = getDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'listings'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_listings_vin_active_price");
  });

  it("idx_price_history_lookup index exists", () => {
    const db = getDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'price_history'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_price_history_lookup");
  });
});
