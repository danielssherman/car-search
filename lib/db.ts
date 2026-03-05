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

const DB_PATH = process.env.DATABASE_PATH || "./data/inventory.db";

let db: Database.Database | null = null;

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
      model TEXT,
      trim TEXT,
      exterior_color TEXT,
      interior_color TEXT,
      msrp INTEGER,
      dealer_name TEXT,
      dealer_city TEXT,
      status TEXT,
      packages TEXT,
      stock_number TEXT,
      detail_url TEXT,
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
  `);

  return db;
}

export function getVehicles(filters: InventoryFilters): Vehicle[] {
  const db = getDb();
  const conditions: string[] = ["removed_at IS NULL"];
  const params: unknown[] = [];

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
      "(vin LIKE ? OR exterior_color LIKE ? OR dealer_name LIKE ? OR trim LIKE ?)"
    );
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  let orderBy = "last_seen DESC";
  if (filters.sort === "price_asc") orderBy = "msrp ASC";
  else if (filters.sort === "price_desc") orderBy = "msrp DESC";
  else if (filters.sort === "newest") orderBy = "first_seen DESC";

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM vehicles ${where} ORDER BY ${orderBy}`;

  return db.prepare(sql).all(...params) as Vehicle[];
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
      SUM(CASE WHEN model = '330i' THEN 1 ELSE 0 END) as count_330i,
      SUM(CASE WHEN model = 'M340i' THEN 1 ELSE 0 END) as count_m340i,
      COALESCE(ROUND(AVG(msrp)), 0) as avg_msrp,
      COALESCE(MIN(msrp), 0) as min_msrp,
      COALESCE(MAX(msrp), 0) as max_msrp
    FROM vehicles WHERE removed_at IS NULL`
    )
    .get() as {
    total: number;
    count_330i: number;
    count_m340i: number;
    avg_msrp: number;
    min_msrp: number;
    max_msrp: number;
  };

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

  return { ...counts, color_distribution };
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
    INSERT INTO vehicles (vin, year, model, trim, exterior_color, interior_color, msrp, dealer_name, dealer_city, status, packages, stock_number, detail_url, first_seen, last_seen, last_scraped, removed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(vin) DO UPDATE SET
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
        v.model,
        v.trim,
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
