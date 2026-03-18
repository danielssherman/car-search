import { NextResponse } from "next/server";
import { getLastScrapeTime, getDb } from "@/lib/db";

export async function GET() {
  try {
    const lastScrapeTime = getLastScrapeTime();
    const db = getDb();

    const recentScrapes = db
      .prepare(
        `SELECT id, started_at, completed_at, vehicles_found, vehicles_new, status, error_message, source
         FROM scrape_log ORDER BY id DESC LIMIT 10`
      )
      .all() as Array<{
      id: number;
      started_at: string;
      completed_at: string;
      vehicles_found: number;
      vehicles_new: number;
      status: string;
      error_message: string | null;
      source: string | null;
    }>;

    const vehicleCounts = db
      .prepare(
        `SELECT
          COUNT(*) as active,
          (SELECT COUNT(*) FROM vehicles WHERE removed_at IS NOT NULL) as removed
         FROM vehicles WHERE removed_at IS NULL`
      )
      .get() as { active: number; removed: number };

    return NextResponse.json({
      last_successful_scrape: lastScrapeTime,
      active_vehicles: vehicleCounts.active,
      removed_vehicles: vehicleCounts.removed,
      recent_scrapes: recentScrapes,
    });
  } catch (err) {
    console.error("Error fetching scrape health:", err);
    return NextResponse.json(
      { error: "Failed to fetch scrape health" },
      { status: 500 }
    );
  }
}
