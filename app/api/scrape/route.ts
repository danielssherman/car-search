import { NextRequest, NextResponse } from "next/server";
import { runScrape } from "@/lib/cron";

const REJECTED_DEFAULTS = [
  "bmw-tracker-secret-key-2024",
  "your-secret-key-here",
];

export async function POST(request: NextRequest) {
  const expectedKey = process.env.SCRAPE_API_KEY;

  if (!expectedKey || REJECTED_DEFAULTS.includes(expectedKey)) {
    return NextResponse.json(
      {
        error:
          "SCRAPE_API_KEY is not configured or is still set to a default value. " +
          "Set a strong random key in your environment variables.",
      },
      { status: 500 }
    );
  }

  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScrape();
    return NextResponse.json({
      message: "Scrape completed successfully",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
