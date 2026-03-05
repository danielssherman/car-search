import { runScrape } from "../lib/cron";

async function main() {
  console.log("Starting initial scrape...");
  try {
    const result = await runScrape();
    console.log(`Done! Found ${result.found} vehicles, ${result.newCount} new.`);
  } catch (err) {
    console.error("Scrape failed:", err);
    process.exit(1);
  }
}

main();
