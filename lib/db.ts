import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  Vehicle,
  Listing,
  PriceHistory,
  InventoryFilters,
  InventoryStats,
  DealerInfo,
  ScrapedVehicle,
  ScrapeLog,
} from "./types";
import { calculateQualityScore } from "./scoring";

let db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.DATABASE_PATH || "./data/inventory.db";
}

function migrateSchema(database: Database.Database): void {
  const columns = database
    .prepare("PRAGMA table_info(vehicles)")
    .all() as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  const newColumns: { name: string; def: string }[] = [
    { name: "make", def: "TEXT DEFAULT ''" },
    { name: "body_style", def: "TEXT DEFAULT ''" },
    { name: "drivetrain", def: "TEXT DEFAULT ''" },
    { name: "engine", def: "TEXT DEFAULT ''" },
    { name: "fuel_type", def: "TEXT DEFAULT ''" },
    { name: "mileage", def: "INTEGER DEFAULT 0" },
    { name: "condition", def: "TEXT DEFAULT 'New'" },
    { name: "quality_score", def: "INTEGER DEFAULT 50" },
    { name: "re_listed_at", def: "DATETIME" },
  ];

  for (const col of newColumns) {
    if (!existing.has(col.name)) {
      database.exec(
        `ALTER TABLE vehicles ADD COLUMN ${col.name} ${col.def}`
      );
    }
  }

  // Migrate scrape_log: add source column
  const scrapeLogCols = database
    .prepare("PRAGMA table_info(scrape_log)")
    .all() as { name: string }[];
  const scrapeLogExisting = new Set(scrapeLogCols.map((c) => c.name));
  if (!scrapeLogExisting.has("source")) {
    database.exec("ALTER TABLE scrape_log ADD COLUMN source TEXT");
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create vehicles table (keeps legacy listing columns for backward compat)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      vin TEXT PRIMARY KEY,
      year INTEGER,
      make TEXT DEFAULT '',
      model TEXT,
      trim TEXT,
      body_style TEXT DEFAULT '',
      drivetrain TEXT DEFAULT '',
      engine TEXT DEFAULT '',
      fuel_type TEXT DEFAULT '',
      mileage INTEGER DEFAULT 0,
      condition TEXT DEFAULT 'New',
      exterior_color TEXT,
      interior_color TEXT,
      msrp INTEGER,
      dealer_name TEXT,
      dealer_city TEXT,
      status TEXT,
      packages TEXT,
      stock_number TEXT,
      detail_url TEXT,
      quality_score INTEGER DEFAULT 50,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_scraped DATETIME DEFAULT CURRENT_TIMESTAMP,
      removed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME,
      completed_at DATETIME,
      vehicles_found INTEGER,
      vehicles_new INTEGER,
      status TEXT,
      error_message TEXT,
      source TEXT
    );

  `);

  // Migrate schema before creating indexes that reference new columns
  migrateSchema(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vehicles_quality ON vehicles(quality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_vehicles_make ON vehicles(make);
    CREATE INDEX IF NOT EXISTS idx_vehicles_removed ON vehicles(removed_at);
  `);

  // Phase 2: listings and price_history tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vin TEXT NOT NULL REFERENCES vehicles(vin),
      source TEXT NOT NULL DEFAULT 'dealer',
      dealer_name TEXT NOT NULL,
      dealer_city TEXT DEFAULT '',
      price INTEGER DEFAULT 0,
      msrp INTEGER DEFAULT 0,
      status TEXT DEFAULT '',
      detail_url TEXT DEFAULT '',
      stock_number TEXT DEFAULT '',
      packages TEXT DEFAULT '[]',
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      removed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vin, source, dealer_name)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vin TEXT NOT NULL REFERENCES vehicles(vin),
      source TEXT NOT NULL,
      dealer_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_listings_vin ON listings(vin);
    CREATE INDEX IF NOT EXISTS idx_listings_removed ON listings(removed_at);
    CREATE INDEX IF NOT EXISTS idx_listings_dealer ON listings(dealer_name);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
    CREATE INDEX IF NOT EXISTS idx_price_history_vin ON price_history(vin);
    CREATE INDEX IF NOT EXISTS idx_listings_vin_active_price ON listings(vin, removed_at, price);
    CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON price_history(vin, source, dealer_name, recorded_at);
  `);

  // One-time migration: copy existing vehicle data into listings
  const listingCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM listings").get() as { cnt: number }
  ).cnt;
  if (listingCount === 0) {
    const vehicleCount = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM vehicles WHERE dealer_name IS NOT NULL AND dealer_name != ''"
        )
        .get() as { cnt: number }
    ).cnt;
    if (vehicleCount > 0) {
      console.log(`Migrating ${vehicleCount} vehicles to listings table...`);
      db.exec(`
        INSERT OR IGNORE INTO listings
          (vin, source, dealer_name, dealer_city, price, msrp, status,
           detail_url, stock_number, packages, first_seen, last_seen, removed_at)
        SELECT
          vin, 'dealer', COALESCE(dealer_name, ''), COALESCE(dealer_city, ''),
          COALESCE(msrp, 0), COALESCE(msrp, 0), COALESCE(status, ''),
          COALESCE(detail_url, ''), COALESCE(stock_number, ''),
          COALESCE(packages, '[]'), first_seen, last_seen, removed_at
        FROM vehicles
        WHERE dealer_name IS NOT NULL AND dealer_name != ''
      `);
      console.log("Migration complete.");
    }
  }

  return db;
}

/** Reset the singleton — used only in tests to get a fresh DB per test. */
export function _resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// CTE fragments for best-listing and listing-count joins
const BEST_LISTINGS_CTE = `
  best_listings AS (
    SELECT vin, id, price, msrp, source, dealer_name, dealer_city,
           status, detail_url, stock_number, packages,
           ROW_NUMBER() OVER (
             PARTITION BY vin
             ORDER BY CASE WHEN price > 0 THEN 0 ELSE 1 END, price ASC
           ) as rn
    FROM listings WHERE removed_at IS NULL
  )`;

const LISTING_COUNTS_CTE = `
  listing_counts AS (
    SELECT vin, COUNT(*) as listing_count
    FROM listings WHERE removed_at IS NULL
    GROUP BY vin
  )`;

const VEHICLE_COLUMNS = `
    v.vin, v.year, v.make, v.model, v.trim, v.body_style, v.drivetrain,
    v.engine, v.fuel_type, v.mileage, v.condition, v.exterior_color, v.interior_color,
    v.quality_score, v.first_seen, v.last_seen, v.removed_at,
    COALESCE(bl.price, 0) as price,
    COALESCE(bl.msrp, 0) as msrp,
    COALESCE(bl.source, '') as source,
    COALESCE(bl.dealer_name, '') as dealer_name,
    COALESCE(bl.dealer_city, '') as dealer_city,
    COALESCE(bl.status, '') as status,
    COALESCE(bl.detail_url, '') as detail_url,
    COALESCE(bl.stock_number, '') as stock_number,
    COALESCE(bl.packages, '[]') as packages,
    COALESCE(lc.listing_count, 0) as listing_count`;

/**
 * Build a full vehicle query using CTEs for best listing and listing counts.
 * Returns the WITH + SELECT + FROM + JOINs portion — caller appends WHERE/ORDER/LIMIT.
 */
function buildVehicleQuery(): string {
  return `
  WITH ${BEST_LISTINGS_CTE},
  ${LISTING_COUNTS_CTE}
  SELECT ${VEHICLE_COLUMNS}
  FROM vehicles v
  LEFT JOIN best_listings bl ON bl.vin = v.vin AND bl.rn = 1
  LEFT JOIN listing_counts lc ON lc.vin = v.vin`;
}

/**
 * Build a count query using the best_listings CTE (needed for price/status/dealer filters).
 */
function buildCountQuery(): string {
  return `
  WITH ${BEST_LISTINGS_CTE}
  SELECT COUNT(*) as total
  FROM vehicles v
  LEFT JOIN best_listings bl ON bl.vin = v.vin AND bl.rn = 1`;
}

function buildFilterConditions(filters: InventoryFilters): {
  where: string;
  params: unknown[];
} {
  const conditions: string[] = ["v.removed_at IS NULL"];
  const params: unknown[] = [];

  if (filters.make && filters.make !== "all") {
    conditions.push("v.make = ?");
    params.push(filters.make);
  }

  if (filters.models && filters.models.length > 0) {
    const placeholders = filters.models.map(() => "?").join(", ");
    conditions.push(`v.model IN (${placeholders})`);
    params.push(...filters.models);
  } else if (filters.model && filters.model !== "all") {
    conditions.push("v.model = ?");
    params.push(filters.model);
  }

  if (filters.dealers && filters.dealers.length > 0) {
    const placeholders = filters.dealers.map(() => "?").join(", ");
    conditions.push(
      `EXISTS (SELECT 1 FROM listings WHERE vin = v.vin AND removed_at IS NULL AND dealer_name IN (${placeholders}))`
    );
    params.push(...filters.dealers);
  } else if (filters.dealer) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings WHERE vin = v.vin AND removed_at IS NULL AND dealer_name LIKE ?)"
    );
    params.push(`%${filters.dealer}%`);
  }

  if (filters.colors && filters.colors.length > 0) {
    const placeholders = filters.colors.map(() => "?").join(", ");
    conditions.push(`v.exterior_color IN (${placeholders})`);
    params.push(...filters.colors);
  } else if (filters.color) {
    conditions.push("v.exterior_color LIKE ?");
    params.push(`%${filters.color}%`);
  }

  if (filters.conditions && filters.conditions.length > 0) {
    const placeholders = filters.conditions.map(() => "?").join(", ");
    conditions.push(`v.condition IN (${placeholders})`);
    params.push(...filters.conditions);
  } else if (filters.condition && filters.condition !== "all") {
    conditions.push("v.condition = ?");
    params.push(filters.condition);
  }

  if (filters.minPrice) {
    conditions.push("bl.price >= ?");
    params.push(filters.minPrice);
  }

  if (filters.maxPrice) {
    conditions.push("bl.price <= ?");
    params.push(filters.maxPrice);
  }

  if (filters.status && filters.status !== "all") {
    conditions.push("bl.status = ?");
    params.push(filters.status === "in_stock" ? "In Stock" : "In Transit");
  }

  if (filters.search) {
    conditions.push(
      "(v.vin LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR v.exterior_color LIKE ? OR bl.dealer_name LIKE ? OR v.trim LIKE ?)"
    );
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function getVehicles(filters: InventoryFilters): Vehicle[] {
  const db = getDb();
  const { where, params } = buildFilterConditions(filters);

  let orderBy = "v.quality_score DESC";
  if (filters.sort === "price_asc") orderBy = "COALESCE(bl.price, 999999999) ASC";
  else if (filters.sort === "price_desc") orderBy = "COALESCE(bl.price, 0) DESC";
  else if (filters.sort === "newest") orderBy = "v.first_seen DESC";
  else if (filters.sort === "best_value") orderBy = "v.quality_score DESC";

  const limit = filters.limit || 100;
  const limitOffsetParams: unknown[] = [limit];

  let limitClause = "LIMIT ?";
  if (filters.offset !== undefined) {
    limitClause += " OFFSET ?";
    limitOffsetParams.push(filters.offset);
  }

  const sql = `${buildVehicleQuery()} ${where} ORDER BY ${orderBy} ${limitClause}`;

  return db.prepare(sql).all(...params, ...limitOffsetParams) as Vehicle[];
}

export function countVehicles(filters: InventoryFilters): number {
  const db = getDb();
  const { where, params } = buildFilterConditions(filters);

  const sql = `${buildCountQuery()} ${where}`;

  const row = db.prepare(sql).get(...params) as { total: number };
  return row.total;
}

export function getVehicleByVin(vin: string): Vehicle | undefined {
  const db = getDb();
  return db
    .prepare(`${buildVehicleQuery()} WHERE v.vin = ?`)
    .get(vin) as Vehicle | undefined;
}

export function getListingsForVin(vin: string): Listing[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM listings WHERE vin = ? AND removed_at IS NULL ORDER BY price ASC"
    )
    .all(vin) as Listing[];
}

export function getPriceHistory(vin: string): PriceHistory[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM price_history WHERE vin = ? ORDER BY recorded_at ASC"
    )
    .all(vin) as PriceHistory[];
}

export function getNewVehicles(since: string, limit: number = 50): Vehicle[] {
  const db = getDb();
  return db
    .prepare(
      `${buildVehicleQuery()} WHERE v.removed_at IS NULL AND v.first_seen >= ? ORDER BY v.first_seen DESC LIMIT ?`
    )
    .all(since, limit) as Vehicle[];
}

export function getPriceDrops(
  since: string,
  limit: number = 50
): Array<{
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  dealer_name: string;
  source: string;
  old_price: number;
  new_price: number;
  drop_amount: number;
  drop_pct: number;
  changed_at: string;
}> {
  const db = getDb();
  return db
    .prepare(
      `WITH price_changes AS (
        SELECT vin, source, dealer_name, price, recorded_at,
          LAG(price) OVER (PARTITION BY vin, source, dealer_name ORDER BY recorded_at) as prev_price
        FROM price_history
      )
      SELECT pc.vin, v.year, v.make, v.model, v.trim,
        pc.dealer_name, pc.source,
        pc.prev_price as old_price,
        pc.price as new_price,
        (pc.prev_price - pc.price) as drop_amount,
        ROUND(CAST(pc.prev_price - pc.price AS REAL) / pc.prev_price * 100, 1) as drop_pct,
        pc.recorded_at as changed_at
      FROM price_changes pc
      JOIN vehicles v ON v.vin = pc.vin
      WHERE pc.recorded_at >= ?
        AND pc.prev_price IS NOT NULL
        AND pc.price < pc.prev_price
        AND pc.prev_price > 0
        AND v.removed_at IS NULL
      ORDER BY drop_amount DESC
      LIMIT ?`
    )
    .all(since, limit) as Array<{
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    dealer_name: string;
    source: string;
    old_price: number;
    new_price: number;
    drop_amount: number;
    drop_pct: number;
    changed_at: string;
  }>;
}

export function getStats(): InventoryStats {
  const db = getDb();

  const counts = db
    .prepare(
      `WITH ${BEST_LISTINGS_CTE}
      SELECT
        COUNT(*) as total,
        COALESCE(ROUND(AVG(bl.price)), 0) as avg_price,
        COALESCE(MIN(CASE WHEN bl.price > 0 THEN bl.price END), 0) as min_price,
        COALESCE(MAX(bl.price), 0) as max_price
      FROM vehicles v
      LEFT JOIN best_listings bl ON bl.vin = v.vin AND bl.rn = 1
      WHERE v.removed_at IS NULL`
    )
    .get() as {
    total: number;
    avg_price: number;
    min_price: number;
    max_price: number;
  };

  const dealerCount = db
    .prepare(
      "SELECT COUNT(DISTINCT dealer_name) as total FROM listings WHERE removed_at IS NULL"
    )
    .get() as { total: number };

  const makeRows = db
    .prepare(
      `SELECT make, COUNT(*) as count
      FROM vehicles WHERE removed_at IS NULL AND make != ''
      GROUP BY make ORDER BY count DESC`
    )
    .all() as { make: string; count: number }[];

  const count_by_make: Record<string, number> = {};
  for (const row of makeRows) {
    count_by_make[row.make] = row.count;
  }

  const modelRows = db
    .prepare(
      `SELECT model, COUNT(*) as count
      FROM vehicles WHERE removed_at IS NULL AND model != ''
      GROUP BY model ORDER BY count DESC`
    )
    .all() as { model: string; count: number }[];

  const count_by_model: Record<string, number> = {};
  for (const row of modelRows) {
    count_by_model[row.model] = row.count;
  }

  const conditionRows = db
    .prepare(
      `SELECT condition, COUNT(*) as count
      FROM vehicles WHERE removed_at IS NULL AND condition != ''
      GROUP BY condition ORDER BY count DESC`
    )
    .all() as { condition: string; count: number }[];

  const count_by_condition: Record<string, number> = {};
  for (const row of conditionRows) {
    count_by_condition[row.condition] = row.count;
  }

  const colors = db
    .prepare(
      `SELECT exterior_color, COUNT(*) as count
      FROM vehicles WHERE removed_at IS NULL
      GROUP BY exterior_color ORDER BY count DESC`
    )
    .all() as { exterior_color: string; count: number }[];

  const color_distribution: Record<string, number> = {};
  for (const c of colors) {
    color_distribution[c.exterior_color] = c.count;
  }

  return {
    ...counts,
    total_dealers: dealerCount.total,
    count_by_make,
    count_by_model,
    count_by_condition,
    makes: Object.keys(count_by_make).sort(),
    models: Object.keys(count_by_model).sort(),
    color_distribution,
  };
}

export function getDealers(): DealerInfo[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT dealer_name, dealer_city, COUNT(DISTINCT vin) as vehicle_count
      FROM listings WHERE removed_at IS NULL
      GROUP BY dealer_name, dealer_city
      ORDER BY vehicle_count DESC`
    )
    .all() as DealerInfo[];
}

export function upsertVehicles(vehicles: ScrapedVehicle[]): {
  found: number;
  newCount: number;
} {
  const db = getDb();
  const now = new Date().toISOString();
  let newCount = 0;

  const checkVehicleStmt = db.prepare("SELECT vin FROM vehicles WHERE vin = ?");

  const upsertVehicleStmt = db.prepare(`
    INSERT INTO vehicles (vin, year, make, model, trim, body_style, drivetrain, engine,
      fuel_type, mileage, condition, exterior_color, interior_color, quality_score,
      first_seen, last_seen, removed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 50, ?, ?, NULL)
    ON CONFLICT(vin) DO UPDATE SET
      make = excluded.make,
      model = excluded.model,
      trim = excluded.trim,
      body_style = excluded.body_style,
      drivetrain = excluded.drivetrain,
      engine = excluded.engine,
      fuel_type = excluded.fuel_type,
      mileage = excluded.mileage,
      condition = excluded.condition,
      exterior_color = excluded.exterior_color,
      interior_color = excluded.interior_color,
      last_seen = excluded.last_seen,
      first_seen = CASE
        WHEN vehicles.removed_at IS NOT NULL THEN excluded.first_seen
        ELSE vehicles.first_seen
      END,
      re_listed_at = CASE
        WHEN vehicles.removed_at IS NOT NULL THEN excluded.last_seen
        ELSE vehicles.re_listed_at
      END,
      removed_at = NULL
  `);

  const checkListingStmt = db.prepare(
    "SELECT id, price FROM listings WHERE vin = ? AND source = ? AND dealer_name = ?"
  );

  const upsertListingStmt = db.prepare(`
    INSERT INTO listings (vin, source, dealer_name, dealer_city, price, msrp, status,
      detail_url, stock_number, packages, first_seen, last_seen, removed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(vin, source, dealer_name) DO UPDATE SET
      dealer_city = excluded.dealer_city,
      price = CASE WHEN excluded.price > 0 THEN excluded.price ELSE listings.price END,
      msrp = CASE WHEN excluded.msrp > 0 THEN excluded.msrp ELSE listings.msrp END,
      status = excluded.status,
      detail_url = excluded.detail_url,
      stock_number = excluded.stock_number,
      packages = excluded.packages,
      last_seen = excluded.last_seen,
      updated_at = excluded.updated_at,
      removed_at = NULL
  `);

  const insertPriceHistoryStmt = db.prepare(`
    INSERT INTO price_history (vin, source, dealer_name, price, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const lastPriceHistoryStmt = db.prepare(
    "SELECT price FROM price_history WHERE vin = ? AND source = ? AND dealer_name = ? ORDER BY recorded_at DESC LIMIT 1"
  );

  const transaction = db.transaction(() => {
    for (const v of vehicles) {
      const exists = checkVehicleStmt.get(v.vin);
      if (!exists) newCount++;

      // 1. Upsert vehicle (canonical data)
      upsertVehicleStmt.run(
        v.vin, v.year, v.make, v.model, v.trim, v.body_style,
        v.drivetrain, v.engine, v.fuel_type, v.mileage, v.condition,
        v.exterior_color, v.interior_color, now, now
      );

      const price = v.asking_price || v.msrp; // Use asking price, fall back to MSRP

      // 2. Check existing listing for price change
      const existing = checkListingStmt.get(v.vin, v.source, v.dealer_name) as
        | { id: number; price: number }
        | undefined;

      // 3. Record price history if price changed (or new listing), with dedup
      if (price > 0) {
        // Check last recorded price in price_history to prevent duplicates
        const lastHistoryRow = lastPriceHistoryStmt.get(v.vin, v.source, v.dealer_name) as
          | { price: number }
          | undefined;

        const lastHistoryPrice = lastHistoryRow?.price;

        if (!existing && lastHistoryPrice !== price) {
          // New listing — record initial price (skip if already recorded)
          insertPriceHistoryStmt.run(v.vin, v.source, v.dealer_name, price, now);
        } else if (existing && existing.price !== price && lastHistoryPrice !== price) {
          // Price changed — append to history (skip if already recorded)
          insertPriceHistoryStmt.run(v.vin, v.source, v.dealer_name, price, now);
        }
      }

      // 4. Upsert listing
      upsertListingStmt.run(
        v.vin, v.source, v.dealer_name, v.dealer_city,
        price, v.msrp || price,
        v.status, v.detail_url, v.stock_number,
        JSON.stringify(v.packages), now, now, now, now
      );
    }
  });

  transaction();
  return { found: vehicles.length, newCount };
}

export function updateQualityScores(): void {
  const db = getDb();

  // Market averages per make/model/year using best listing price (CTE-based)
  const avgPrices = db
    .prepare(
      `WITH ${BEST_LISTINGS_CTE}
      SELECT v.make, v.model, v.year, AVG(bl.price) as avg_price
      FROM vehicles v
      INNER JOIN best_listings bl ON bl.vin = v.vin AND bl.rn = 1
      WHERE v.removed_at IS NULL AND bl.price > 0
      GROUP BY v.make, v.model, v.year`
    )
    .all() as {
    make: string;
    model: string;
    year: number;
    avg_price: number;
  }[];

  const priceMap = new Map<string, number>();
  for (const row of avgPrices) {
    priceMap.set(`${row.make}|${row.model}|${row.year}`, row.avg_price);
  }

  const vehicles = db
    .prepare(
      `WITH ${BEST_LISTINGS_CTE}
      SELECT v.vin, v.make, v.model, v.year, v.first_seen, v.mileage, v.condition,
        COALESCE(bl.price, 0) as price,
        COALESCE(bl.status, '') as status,
        COALESCE(bl.packages, '[]') as packages
      FROM vehicles v
      LEFT JOIN best_listings bl ON bl.vin = v.vin AND bl.rn = 1
      WHERE v.removed_at IS NULL`
    )
    .all() as {
    vin: string;
    make: string;
    model: string;
    year: number;
    price: number;
    first_seen: string;
    mileage: number;
    condition: string;
    status: string;
    packages: string;
  }[];

  const updateStmt = db.prepare(
    "UPDATE vehicles SET quality_score = ? WHERE vin = ?"
  );

  const transaction = db.transaction(() => {
    for (const v of vehicles) {
      const marketAvg =
        priceMap.get(`${v.make}|${v.model}|${v.year}`) || 0;
      const score = calculateQualityScore(v, marketAvg);
      updateStmt.run(score, v.vin);
    }
  });

  transaction();
  console.log(`Quality scores updated for ${vehicles.length} vehicles`);
}

export function markMissingAsRemoved(scrapedVehicles: ScrapedVehicle[]): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Determine which dealers we actually scraped successfully
  const scrapedDealers = new Set(scrapedVehicles.map((v) => v.dealer_name));
  if (scrapedDealers.size === 0) return; // Nothing scraped, don't remove anything

  const seenListingKeys = new Set(
    scrapedVehicles.map((v) => `${v.vin}|${v.source}|${v.dealer_name}`)
  );

  // Only check listings for dealers we successfully scraped
  const dealerPlaceholders = [...scrapedDealers].map(() => "?").join(", ");
  const activeListings = db
    .prepare(
      `SELECT id, vin, source, dealer_name FROM listings
       WHERE removed_at IS NULL AND dealer_name IN (${dealerPlaceholders})`
    )
    .all(...scrapedDealers) as { id: number; vin: string; source: string; dealer_name: string }[];

  const markListingRemoved = db.prepare(
    "UPDATE listings SET removed_at = ? WHERE id = ?"
  );

  // For vehicles: mark as removed only if the vehicle has NO active listings
  // remaining after we process the listing removals
  const markVehicleRemoved = db.prepare(
    "UPDATE vehicles SET removed_at = ? WHERE vin = ?"
  );
  const countActiveListingsStmt = db.prepare(
    "SELECT COUNT(*) as cnt FROM listings WHERE vin = ? AND removed_at IS NULL"
  );

  const transaction = db.transaction(() => {
    // 1. Mark listings as removed if they belong to a scraped dealer but weren't seen
    const affectedVins = new Set<string>();
    for (const listing of activeListings) {
      const key = `${listing.vin}|${listing.source}|${listing.dealer_name}`;
      if (!seenListingKeys.has(key)) {
        markListingRemoved.run(now, listing.id);
        affectedVins.add(listing.vin);
      }
    }

    // 2. For each affected VIN, check if it has ANY remaining active listings
    //    If not, mark the vehicle itself as removed
    for (const vin of affectedVins) {
      const remaining = countActiveListingsStmt.get(vin) as { cnt: number };
      if (remaining.cnt === 0) {
        markVehicleRemoved.run(now, vin);
      }
    }
  });

  transaction();
}

export function logScrape(log: Omit<ScrapeLog, "id">): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scrape_log (started_at, completed_at, vehicles_found, vehicles_new, status, error_message, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    log.started_at,
    log.completed_at,
    log.vehicles_found,
    log.vehicles_new,
    log.status,
    log.error_message,
    log.source
  );
}

export function getLastScrapeTime(): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT completed_at FROM scrape_log WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1"
    )
    .get() as { completed_at: string } | undefined;
  return row?.completed_at ?? null;
}
