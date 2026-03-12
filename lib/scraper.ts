/**
 * Thin backward-compatibility wrapper.
 * All scraping logic now lives in lib/scrapers/.
 */
import { runAllScrapers } from "./scrapers";
import type { ScrapedVehicle } from "./types";

export async function scrapeAll(): Promise<ScrapedVehicle[]> {
  const results = await runAllScrapers();
  const allVehicles = new Map<string, ScrapedVehicle>();

  for (const result of results) {
    for (const v of result.vehicles) {
      allVehicles.set(v.vin, v);
    }
  }

  return Array.from(allVehicles.values());
}
