import cron from "node-cron";
import { scrapeAll } from "./scraper";
import {
  upsertVehicles,
  markMissingAsRemoved,
  updateQualityScores,
  logScrape,
} from "./db";

const INTERVAL_HOURS = parseInt(
  process.env.SCRAPE_INTERVAL_HOURS || "4",
  10
);

let isRunning = false;

export async function runScrape(): Promise<{
  found: number;
  newCount: number;
}> {
  if (isRunning) {
    throw new Error("Scrape already in progress");
  }

  isRunning = true;
  const startedAt = new Date().toISOString();

  try {
    const vehicles = await scrapeAll();
    const { found, newCount } = upsertVehicles(vehicles);

    // Mark vehicles not found in this scrape as removed
    const currentVins = new Set(vehicles.map((v) => v.vin));
    markMissingAsRemoved(currentVins);

    // Recalculate quality scores with fresh market data
    updateQualityScores();

    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: found,
      vehicles_new: newCount,
      status: "success",
      error_message: null,
    });

    console.log(
      `Scrape complete: ${found} vehicles found, ${newCount} new`
    );
    return { found, newCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: 0,
      vehicles_new: 0,
      status: "error",
      error_message: message,
    });
    throw err;
  } finally {
    isRunning = false;
  }
}

export function startCronJob(): void {
  // Run every N hours
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
