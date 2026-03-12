import "./env";
import cron from "node-cron";
import { runAllScrapers, type ScraperResult } from "./scrapers";
import {
  upsertVehicles,
  markMissingAsRemoved,
  updateQualityScores,
  logScrape,
} from "./db";
import type { ScrapedVehicle } from "./types";

const INTERVAL_HOURS = parseInt(
  process.env.SCRAPE_INTERVAL_HOURS || "4",
  10
);

let isRunning = false;

export async function runScrape(): Promise<{
  found: number;
  newCount: number;
  results: ScraperResult[];
}> {
  if (isRunning) {
    throw new Error("Scrape already in progress");
  }

  isRunning = true;
  const startedAt = new Date().toISOString();

  try {
    // Run all scrapers concurrently — each is an independent worker
    const results = await runAllScrapers();

    // Aggregate all vehicles from all sources
    const allVehicles: ScrapedVehicle[] = [];
    for (const result of results) {
      allVehicles.push(...result.vehicles);
    }

    // Upsert into DB
    const { found, newCount } = upsertVehicles(allVehicles);

    // Mark missing vehicles/listings as removed
    markMissingAsRemoved(allVehicles);

    // Recalculate quality scores
    updateQualityScores();

    // Log per-source results
    for (const result of results) {
      logScrape({
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        vehicles_found: result.vehicles.length,
        vehicles_new: 0,
        status: result.error ? "error" : "success",
        error_message: result.error || null,
        source: result.source,
      });
    }

    // Log aggregate entry
    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: found,
      vehicles_new: newCount,
      status: results.every((r) => !r.error) ? "success" : "partial",
      error_message: results.some((r) => r.error)
        ? `Failed sources: ${results
            .filter((r) => r.error)
            .map((r) => `${r.source}: ${r.error}`)
            .join("; ")}`
        : null,
      source: null,
    });

    console.log(
      `Scrape complete: ${found} vehicles found, ${newCount} new`
    );
    return { found, newCount, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: 0,
      vehicles_new: 0,
      status: "error",
      error_message: message,
      source: null,
    });
    throw err;
  } finally {
    isRunning = false;
  }
}

export function startCronJob(): void {
  const cronExpression = `0 */${INTERVAL_HOURS} * * *`;

  cron.schedule(cronExpression, async () => {
    console.log(`[CRON] Starting scheduled scrape at ${new Date().toISOString()}`);
    try {
      await runScrape();
    } catch (err) {
      console.error("[CRON] Scrape failed:", err);
    }
  });

  console.log(`[CRON] Scheduled scrape every ${INTERVAL_HOURS} hours`);
}
