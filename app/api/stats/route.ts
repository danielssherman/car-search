import { NextResponse } from "next/server";
import { getStats, getLastScrapeTime } from "@/lib/db";
import { apiError } from "@/lib/validation";

export async function GET() {
  try {
    const stats = getStats();
    const lastScraped = getLastScrapeTime();
    return NextResponse.json({ ...stats, last_scraped: lastScraped }, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    return apiError("Failed to fetch stats", 500);
  }
}
