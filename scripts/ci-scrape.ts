import "../lib/env";
import { runScrape } from "../lib/cron";
import { getDb } from "../lib/db";

async function main() {
  // Random delay 0-30 minutes to avoid predictable scrape timing
  const jitterMs = Math.floor(Math.random() * 30 * 60 * 1000);
  console.log(`[CI] Jitter delay: ${Math.round(jitterMs / 1000)}s before starting scrape`);
  await new Promise((resolve) => setTimeout(resolve, jitterMs));

  console.log(`[CI] Starting scrape at ${new Date().toISOString()}`);

  try {
    const { found, newCount, results } = await runScrape();

    console.log(`\n--- CI Scrape Results ---`);
    console.log(`Total vehicles found: ${found}`);
    console.log(`New vehicles: ${newCount}`);
    console.log(`Sources: ${results.length}`);

    for (const r of results) {
      const status = r.error
        ? `ERROR: ${r.error}`
        : `${r.vehicles.length} vehicles`;
      console.log(`  ${r.source}: ${status} (${r.duration_ms}ms)`);
    }

    // Checkpoint WAL and close DB so the .db file is self-contained for upload
    const db = getDb();
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    console.log("[CI] Database checkpointed and closed");

    // Exit with error only if ALL scrapers failed (partial success is OK)
    const allFailed = results.every((r) => r.error);
    if (allFailed && results.length > 0) {
      console.error("[CI] All scrapers failed!");
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error("[CI] Fatal error:", err);
    // Still try to checkpoint on error (DB may have partial data worth keeping)
    try {
      const db = getDb();
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main();
