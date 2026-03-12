import type { ScraperModule, ScraperConfig, ScraperResult } from "./types";
import ddcScraper from "./ddc";
import algoliaScraper from "./algolia";
import carscomScraper from "./carscom";

export type { ScraperModule, ScraperConfig, ScraperResult } from "./types";

// Registry of all available scraper modules
export const scraperRegistry: ScraperModule[] = [
  ddcScraper,
  algoliaScraper,
  carscomScraper,
];

const DEFAULT_TIMEOUT = 600_000; // 10 minutes per scraper (DDC paginates 1200+ vehicles)
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single scraper with timeout, retry (3 attempts, exponential backoff),
 * and per-source health reporting. Returns a ScraperResult regardless of success/failure.
 */
async function runScraperWorker(
  scraper: ScraperModule,
  config: ScraperConfig
): Promise<ScraperResult> {
  const timeout = config.timeout || DEFAULT_TIMEOUT;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();

    try {
      const result = await Promise.race([
        scraper.scrape(config),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeout}ms`)),
            timeout
          )
        ),
      ]);

      const duration_ms = Date.now() - start;
      console.log(
        `[Worker] ${scraper.name}: ${result.length} vehicles in ${duration_ms}ms`
      );

      return {
        source: scraper.name,
        vehicles: result,
        duration_ms,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const duration_ms = Date.now() - start;

      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s
        console.warn(
          `[Worker] ${scraper.name}: attempt ${attempt}/${MAX_RETRIES} failed (${lastError}), retrying in ${backoff}ms...`
        );
        await sleep(backoff);
      } else {
        console.error(
          `[Worker] ${scraper.name}: all ${MAX_RETRIES} attempts failed (${duration_ms}ms): ${lastError}`
        );
      }
    }
  }

  return {
    source: scraper.name,
    vehicles: [],
    duration_ms: 0,
    error: lastError,
  };
}

/**
 * Run all registered scrapers concurrently as independent workers.
 * One failing scraper does not block others.
 * Returns per-source results for health reporting.
 */
export async function runAllScrapers(): Promise<ScraperResult[]> {
  const config: ScraperConfig = {
    name: "all",
    city: "Bay Area",
    baseUrl: "",
    defaultMake: "",
    timeout: DEFAULT_TIMEOUT,
  };

  console.log(
    `[Scraper] Starting ${scraperRegistry.length} scrapers concurrently...`
  );

  const settled = await Promise.allSettled(
    scraperRegistry.map((scraper) => runScraperWorker(scraper, config))
  );

  const results: ScraperResult[] = settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") {
      return outcome.value;
    }
    // This shouldn't happen since runScraperWorker catches errors,
    // but handle it for safety
    return {
      source: scraperRegistry[i].name,
      vehicles: [],
      duration_ms: 0,
      error:
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason),
    };
  });

  const totalVehicles = results.reduce(
    (sum, r) => sum + r.vehicles.length,
    0
  );
  const succeeded = results.filter((r) => !r.error).length;
  console.log(
    `[Scraper] Complete: ${totalVehicles} vehicles from ${succeeded}/${results.length} sources`
  );

  return results;
}
