import type { ScrapedVehicle } from "../types";
import type { ScraperModule, ScraperConfig } from "./types";

interface AlgoliaDealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  defaultMake: string;
  appId: string;
  apiKey: string;
  indexName: string;
}

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || "";
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY || "";

export const ALGOLIA_DEALERS: AlgoliaDealerConfig[] = [
  {
    name: "Peter Pan BMW",
    city: "San Mateo",
    baseUrl: "https://www.peterpanbmw.com",
    defaultMake: "BMW",
    appId: ALGOLIA_APP_ID,
    apiKey: ALGOLIA_API_KEY,
    indexName: "peterpanbmw-sbm0125_production_inventory",
  },
  {
    name: "BMW of San Francisco",
    city: "San Francisco",
    baseUrl: "https://www.bmwsf.com",
    defaultMake: "BMW",
    appId: ALGOLIA_APP_ID,
    apiKey: ALGOLIA_API_KEY,
    indexName: "bmwofsanfrancisco_production_inventory",
  },
];

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

    for (const hit of hits) {
      const vin = hit.vin || "";
      if (!vin) continue;

      const make = hit.make || dealer.defaultMake;
      const model = hit.model || "";
      const trim = hit.trim || model;
      if (!model && !trim) continue;

      let msrp = parseInt(String(hit.msrp || 0).replace(/[^0-9]/g, ""));
      if (!msrp) {
        msrp = parseInt(String(hit.our_price || 0).replace(/[^0-9]/g, ""));
      }

      const link = hit.link || "";
      const detailUrl = link || `${dealer.baseUrl}/new-vehicles/?vin=${vin}`;

      vehicles.push({
        vin,
        year: hit.year || new Date().getFullYear(),
        make,
        model,
        trim,
        body_style: hit.body_style || "",
        drivetrain: hit.drivetrain || "",
        engine: hit.engine || "",
        fuel_type: hit.fuel || "",
        mileage: parseInt(String(hit.mileage || "0")) || 0,
        condition: "New",
        exterior_color: hit.ext_color || "Unknown",
        interior_color: hit.int_color || "Unknown",
        msrp,
        source: "dealer_algolia",
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: hit.in_transit ? "In Transit" : "In Stock",
        packages: hit.packages || [],
        stock_number: hit.stock || "",
        detail_url: detailUrl,
      });
    }
  } catch (err) {
    console.log(`  [Algolia] ${dealer.name} error: ${(err as Error).message}`);
  }

  return vehicles;
}

const algoliaScraper: ScraperModule = {
  name: "dealer_algolia",

  async scrape(_config: ScraperConfig): Promise<ScrapedVehicle[]> {
    const allVehicles: ScrapedVehicle[] = [];

    for (const dealer of ALGOLIA_DEALERS) {
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
