import { NextResponse } from "next/server";
import { getLastScrapeTime, getDb } from "@/lib/db";
import type { ScrapeLog, SourceHealth } from "@/lib/types";

export async function GET() {
  try {
    const lastScrapeTime = getLastScrapeTime();
    const db = getDb();

    const recentScrapes = db
      .prepare(
        `SELECT id, started_at, completed_at, vehicles_found, vehicles_new, status, error_message, source
         FROM scrape_log ORDER BY id DESC LIMIT 20`
      )
      .all() as ScrapeLog[];

    const vehicleCounts = db
      .prepare(
        `SELECT
          COUNT(*) as active,
          (SELECT COUNT(*) FROM vehicles WHERE removed_at IS NOT NULL) as removed
         FROM vehicles WHERE removed_at IS NULL`
      )
      .get() as { active: number; removed: number };

    // Per-source health summary
    const sourceHealthRows = db
      .prepare(
        `SELECT
          source,
          MAX(CASE WHEN status = 'success' THEN completed_at END) as last_success,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as errors,
          COUNT(*) as total_runs
         FROM scrape_log
         WHERE source IS NOT NULL
         GROUP BY source`
      )
      .all() as Array<{
      source: string;
      last_success: string | null;
      successes: number;
      errors: number;
      total_runs: number;
    }>;

    // Vehicle count from most recent successful run per source
    const lastRunVehicles = db
      .prepare(
        `SELECT source, vehicles_found as last_vehicles
         FROM scrape_log s1
         WHERE status = 'success' AND source IS NOT NULL
           AND id = (SELECT MAX(id) FROM scrape_log s2 WHERE s2.source = s1.source AND s2.status = 'success')`
      )
      .all() as Array<{ source: string; last_vehicles: number }>;

    const lastVehiclesBySource = Object.fromEntries(
      lastRunVehicles.map((r) => [r.source, r.last_vehicles])
    );

    const source_health: Record<string, SourceHealth> = {};
    for (const row of sourceHealthRows) {
      source_health[row.source] = {
        last_success: row.last_success,
        last_vehicles: lastVehiclesBySource[row.source] || 0,
        successes: row.successes,
        errors: row.errors,
        total_runs: row.total_runs,
      };
    }

    return NextResponse.json({
      last_successful_scrape: lastScrapeTime,
      active_vehicles: vehicleCounts.active,
      removed_vehicles: vehicleCounts.removed,
      recent_scrapes: recentScrapes,
      source_health,
    });
  } catch (err) {
    console.error("Error fetching scrape health:", err);
    return NextResponse.json(
      { error: "Failed to fetch scrape health" },
      { status: 500 }
    );
  }
}
