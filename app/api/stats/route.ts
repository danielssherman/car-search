import { NextResponse } from "next/server";
import { getStats, getLastScrapeTime } from "@/lib/db";

export async function GET() {
  try {
    const stats = getStats();
    const lastScraped = getLastScrapeTime();
    return NextResponse.json({ ...stats, last_scraped: lastScraped });
  } catch (err) {
    console.error("Error fetching stats:", err);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
