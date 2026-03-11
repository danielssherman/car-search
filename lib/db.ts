import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  Vehicle,
  InventoryFilters,
  InventoryStats,
  DealerInfo,
  ScrapedVehicle,
  ScrapeLog,
} from "./types";
import { calculateQualityScore } from "./scoring";

const DB_PATH = process.env.DATABASE_PATH || "./data/inventory.db";

let db: Database.Database | null = null;

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
  ];

  for (const col of newColumns) {
    if (!existing.has(col.name)) {
      database.exec(
        `ALTER TABLE vehicles ADD COLUMN ${col.name} ${col.def}`
      );
    }
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_quality ON vehicles(quality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_vehicles_make ON vehicles(make);
    CREATE INDEX IF NOT EXISTS idx_vehicles_removed ON vehicles(removed_at);
  `);

  migrateSchema(db);

  return db;
}

export function getVehicles(filters: InventoryFilters): Vehicle[] {
  const db = getDb();
  const conditions: string[] = ["removed_at IS NULL"];
  const params: unknown[] = [];

  if (filters.make && filters.make !== "all") {
    conditions.push("make = ?");
    params.push(filters.make);
  }

  if (filters.model && filters.model !== "all") {
    conditions.push("model = ?");
    params.push(filters.model);
  }

  if (filters.dealer) {
    conditions.push("dealer_name LIKE ?");
    params.push(`%${filters.dealer}%`);
  }

  if (filters.color) {
    conditions.push("exterior_color LIKE ?");
    params.push(`%${filters.color}%`);
  }

  if (filters.condition && filters.condition !== "all") {
    conditions.push("condition = ?");
    params.push(filters.condition);
  }

  if (filters.minPrice) {
    conditions.push("msrp >= ?");
    params.push(filters.minPrice);
  }

  if (filters.maxPrice) {
    conditions.push("msrp <= ?");
    params.push(filters.maxPrice);
  }

  if (filters.status && filters.status !== "all") {
    conditions.push("status = ?");
    params.push(filters.status === "in_stock" ? "In Stock" : "In Transit");
  }

  if (filters.search) {
    conditions.push(
      "(vin LIKE ? OR make LIKE ? OR model LIKE ? OR exterior_color LIKE ? OR dealer_name LIKE ? OR trim LIKE ?)"
    );
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }

  let orderBy = "quality_score DESC";
  if (filters.sort === "price_asc") orderBy = "msrp ASC";
  else if (filters.sort === "price_desc") orderBy = "msrp DESC";
  else if (filters.sort === "newest") orderBy = "first_seen DESC";
  else if (filters.sort === "best_value") orderBy = "quality_score DESC";

  const limit = filters.limit || 100;
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM vehicles ${where} ORDER BY ${orderBy} LIMIT ?`;

  return db.prepare(sql).all(...params, limit) as Vehicle[];
}

export function getVehicleByVin(vin: string): Vehicle | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM vehicles WHERE vin = ?").get(vin) as
    | Vehicle
    | undefined;
}

export function getStats(): InventoryStats {
  const db = getDb();

  const counts = db
    .prepare(
      `SELECT
      COUNT(*) as total,
      COALESCE(ROUND(AVG(msrp)), 0) as avg_msrp,
      COALESCE(MIN(msrp), 0) as min_msrp,
      COALESCE(MAX(msrp), 0) as max_msrp
    FROM vehicles WHERE removed_at IS NULL`
    )
    .get() as {
    total: number;
    avg_msrp: number;
    min_msrp: number;
    max_msrp: number;
  };

  const dealerCount = db
    .prepare(
      "SELECT COUNT(DISTINCT dealer_name) as total FROM vehicles WHERE removed_at IS NULL"
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

  const makes = db
    .prepare(
      "SELECT DISTINCT make FROM vehicles WHERE removed_at IS NULL AND make != '' ORDER BY make"
    )
    .all() as { make: string }[];

  const models = db
    .prepare(
      "SELECT DISTINCT model FROM vehicles WHERE removed_at IS NULL AND model != '' ORDER BY model"
    )
    .all() as { model: string }[];

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
    makes: makes.map((m) => m.make),
    models: models.map((m) => m.model),
    color_distribution,
  };
}

export function getDealers(): DealerInfo[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT dealer_name, dealer_city, COUNT(*) as vehicle_count
    FROM vehicles WHERE removed_at IS NULL
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

  const insertStmt = db.prepare(`
    INSERT INTO vehicles (vin, year, make, model, trim, body_style, drivetrain, engine, fuel_type, mileage, condition, exterior_color, interior_color, msrp, dealer_name, dealer_city, status, packages, stock_number, detail_url, quality_score, first_seen, last_seen, last_scraped, removed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 50, ?, ?, ?, NULL)
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
      msrp = excluded.msrp,
      status = excluded.status,
      dealer_name = excluded.dealer_name,
      dealer_city = excluded.dealer_city,
      packages = excluded.packages,
      detail_url = excluded.detail_url,
      last_seen = excluded.last_seen,
      last_scraped = excluded.last_scraped,
      removed_at = NULL
  `);

  const checkStmt = db.prepare("SELECT vin FROM vehicles WHERE vin = ?");

  const transaction = db.transaction(() => {
    for (const v of vehicles) {
      const exists = checkStmt.get(v.vin);
      if (!exists) newCount++;

      insertStmt.run(
        v.vin,
        v.year,
        v.make,
        v.model,
        v.trim,
        v.body_style,
        v.drivetrain,
        v.engine,
        v.fuel_type,
        v.mileage,
        v.condition,
        v.exterior_color,
        v.interior_color,
        v.msrp,
        v.dealer_name,
        v.dealer_city,
        v.status,
        JSON.stringify(v.packages),
        v.stock_number,
        v.detail_url,
        now,
        now,
        now
      );
    }
  });

  transaction();
  return { found: vehicles.length, newCount };
}

export function updateQualityScores(): void {
  const db = getDb();

  // Market averages per make/model/year
  const avgPrices = db
    .prepare(
      `SELECT make, model, year, AVG(msrp) as avg_price
    FROM vehicles WHERE removed_at IS NULL AND msrp > 0
    GROUP BY make, model, year`
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
      "SELECT vin, make, model, year, msrp, first_seen, mileage, condition, status, packages FROM vehicles WHERE removed_at IS NULL"
    )
    .all() as {
    vin: string;
    make: string;
    model: string;
    year: number;
    msrp: number;
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

export function markMissingAsRemoved(currentVins: Set<string>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const allActive = db
    .prepare("SELECT vin FROM vehicles WHERE removed_at IS NULL")
    .all() as { vin: string }[];

  const markRemoved = db.prepare(
    "UPDATE vehicles SET removed_at = ? WHERE vin = ?"
  );

  const transaction = db.transaction(() => {
    for (const row of allActive) {
      if (!currentVins.has(row.vin)) {
        markRemoved.run(now, row.vin);
      }
    }
  });

  transaction();
}

export function logScrape(log: Omit<ScrapeLog, "id">): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scrape_log (started_at, completed_at, vehicles_found, vehicles_new, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    log.started_at,
    log.completed_at,
    log.vehicles_found,
    log.vehicles_new,
    log.status,
    log.error_message
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
