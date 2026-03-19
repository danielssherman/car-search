import type { ScrapedVehicle } from "../types";
import type { ScraperModule, ScraperConfig } from "./types";
import { parseAlgoliaHits } from "./algolia-parser";
import { loadAlgoliaDealers, type AlgoliaDealerConfig } from "./dealer-config";

async function scrapeAlgoliaDealer(
  dealer: AlgoliaDealerConfig
): Promise<ScrapedVehicle[]> {
  const vehicles: ScrapedVehicle[] = [];
  const url = `https://${dealer.appId}-dsn.algolia.net/1/indexes/${dealer.indexName}/query`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-API-Key": dealer.apiKey,
        "X-Algolia-Application-Id": dealer.appId,
      },
      body: JSON.stringify({
        query: "",
        hitsPerPage: 1000,
        facetFilters: [["type:New"]],
        attributesToRetrieve: [
          "year",
          "make",
          "model",
          "trim",
          "vin",
          "stock",
          "msrp",
          "our_price",
          "ext_color",
          "int_color",
          "type",
          "packages",
          "link",
          "in_transit",
          "body_style",
          "drivetrain",
          "engine",
          "fuel",
          "mileage",
        ],
      }),
    });

    if (!resp.ok) {
      console.log(`  [Algolia] ${dealer.name}: API error ${resp.status}`);
      return vehicles;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json();
    const hits = data.hits || [];
    console.log(
      `  [Algolia] ${dealer.name}: ${hits.length} hits (${data.nbHits} total)`
    );

    return parseAlgoliaHits(hits, dealer);
  } catch (err) {
    console.log(`  [Algolia] ${dealer.name} error: ${(err as Error).message}`);
  }

  return [];
}

const algoliaScraper: ScraperModule = {
  name: "dealer_algolia",

  async scrape(_config: ScraperConfig): Promise<ScrapedVehicle[]> {
    const allVehicles: ScrapedVehicle[] = [];

    const dealers = loadAlgoliaDealers();
    for (const dealer of dealers) {
      console.log(`[Algolia] Scraping ${dealer.name}...`);
      try {
        const vehicles = await scrapeAlgoliaDealer(dealer);
        console.log(`[Algolia] ${dealer.name}: ${vehicles.length} vehicles`);
        allVehicles.push(...vehicles);
      } catch (err) {
        console.error(
          `[Algolia] ${dealer.name} failed: ${(err as Error).message}`
        );
      }
    }

    return allVehicles;
  },
};

export default algoliaScraper;
