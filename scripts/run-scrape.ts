import { scrapeAll } from "../lib/scraper";
import { getDb, upsertVehicles, logScrape } from "../lib/db";

async function main() {
  getDb();
  const startedAt = new Date().toISOString();

  try {
    const vehicles = await scrapeAll();

    console.log("\n--- Results Summary ---");
    console.log("Total vehicles:", vehicles.length);

    // Show some samples with data quality
    const withPrice = vehicles.filter((v) => v.msrp > 0);
    const withColor = vehicles.filter((v) => v.exterior_color !== "Unknown");
    console.log(`With MSRP: ${withPrice.length}/${vehicles.length}`);
    console.log(`With color: ${withColor.length}/${vehicles.length}`);

    if (vehicles.length > 0) {
      console.log("\nSample vehicles:");
      for (const v of vehicles.slice(0, 3)) {
        console.log(
          `  ${v.year} ${v.trim} | ${v.exterior_color} | $${v.msrp} | ${v.dealer_name} | ${v.status} | ${v.packages.join(", ") || "no pkgs"}`
        );
        console.log(`    VIN: ${v.vin} | URL: ${v.detail_url}`);
      }
    }

    // Save to DB
    const { found, newCount } = upsertVehicles(vehicles);
    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: found,
      vehicles_new: newCount,
      status: "success",
      error_message: null,
      source: null,
    });

    console.log("\nSaved to DB:", found, "found,", newCount, "new");

    // Breakdown
    const byDealer: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    for (const v of vehicles) {
      byDealer[v.dealer_name] = (byDealer[v.dealer_name] || 0) + 1;
      byModel[v.model] = (byModel[v.model] || 0) + 1;
    }
    console.log("\nBy dealer:", byDealer);
    console.log("By model:", byModel);
  } catch (err) {
    console.error("Scrape failed:", err);
    logScrape({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      vehicles_found: 0,
      vehicles_new: 0,
      status: "error",
      error_message: (err as Error).message,
      source: null,
    });
  }
}

main();
