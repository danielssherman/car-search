import { chromium, type Browser } from "playwright";
import type { ScrapedVehicle } from "./types";

interface DealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  searchUrl: string;
  defaultMake: string;
  timeout?: number;
}

interface AlgoliaDealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  defaultMake: string;
  appId: string;
  apiKey: string;
  indexName: string;
}

const DEALERS: DealerConfig[] = [
  {
    name: "Stevens Creek BMW",
    city: "San Jose",
    baseUrl: "https://www.stevenscreekbmw.com",
    searchUrl:
      "https://www.stevenscreekbmw.com/new-inventory/index.htm",
    defaultMake: "BMW",
  },
  {
    name: "BMW of Fremont",
    city: "Fremont",
    baseUrl: "https://www.bmwoffremont.com",
    searchUrl:
      "https://www.bmwoffremont.com/new-inventory/index.htm",
    defaultMake: "BMW",
  },
  {
    name: "BMW of San Rafael",
    city: "San Rafael",
    baseUrl: "https://www.bmwofsanrafael.com",
    searchUrl:
      "https://www.bmwofsanrafael.com/new-inventory/index.htm",
    defaultMake: "BMW",
  },
];

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || "";
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY || "";

const ALGOLIA_DEALERS: AlgoliaDealerConfig[] = [
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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function randomDelay(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTrackingAttr(
  attrs: Array<{ name: string; value?: string }>,
  name: string
): string {
  return attrs.find((a) => a.name === name)?.value || "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDDCInventory(data: any, dealer: DealerConfig): ScrapedVehicle[] {
  const vehicles: ScrapedVehicle[] = [];
  const items = data?.inventory || [];

  for (const item of items) {
    try {
      const vin = item.vin || "";
      if (!vin) continue;

      const make = item.make || dealer.defaultMake;
      const model = item.model || "";
      const trim = item.trim || model;
      if (!model && !trim) continue;

      // Colors
      const trackAttrs: Array<{ name: string; value?: string }> =
        item.trackingAttributes || [];
      const attrs: Array<{ name: string; value?: string }> =
        item.attributes || [];

      const extColor =
        attrs.find((a) => a.name === "exteriorColor")?.value ||
        getTrackingAttr(trackAttrs, "exteriorColor") ||
        "Unknown";
      const intColor =
        attrs.find((a) => a.name === "interiorColor")?.value ||
        getTrackingAttr(trackAttrs, "interiorColor") ||
        "Unknown";

      // MSRP
      let msrp = 0;
      const tp = item.trackingPricing;
      if (tp?.msrp) {
        msrp = parseInt(String(tp.msrp).replace(/[^0-9]/g, ""));
      }
      if (!msrp && tp?.askingPrice) {
        msrp = parseInt(String(tp.askingPrice).replace(/[^0-9]/g, ""));
      }
      if (!msrp && tp?.internetPrice) {
        msrp = parseInt(String(tp.internetPrice).replace(/[^0-9]/g, ""));
      }

      // Additional attributes
      const bodyStyle =
        attrs.find((a) => a.name === "bodyStyle")?.value ||
        getTrackingAttr(trackAttrs, "bodyStyle") ||
        "";
      const drivetrain =
        attrs.find((a) => a.name === "drivetrain")?.value ||
        getTrackingAttr(trackAttrs, "drivetrain") ||
        "";
      const engine =
        attrs.find((a) => a.name === "engine")?.value ||
        getTrackingAttr(trackAttrs, "engine") ||
        "";
      const fuelType =
        attrs.find((a) => a.name === "fuelType")?.value ||
        getTrackingAttr(trackAttrs, "fuelType") ||
        "";

      const stockNumber = item.stockNumber || "";
      const statusInt = item.statusInt;
      const isInTransit = statusInt === 7;

      const pkgs: string[] = item.packages || [];
      const link = item.link || "";
      const detailUrl = link
        ? `${dealer.baseUrl}${link}`
        : `${dealer.baseUrl}/new-inventory/index.htm?search=${vin}`;

      vehicles.push({
        vin,
        year: item.year || new Date().getFullYear(),
        make,
        model,
        trim,
        body_style: bodyStyle,
        drivetrain,
        engine,
        fuel_type: fuelType,
        mileage: parseInt(String(item.mileage || "0")) || 0,
        condition: "New",
        exterior_color: extColor
          .replace(/ Exterior$/, "")
          .replace(/ Metallic$/, " Metallic"),
        interior_color: intColor.replace(/ Interior$/, ""),
        msrp,
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: isInTransit ? "In Transit" : "In Stock",
        packages: pkgs,
        stock_number: stockNumber,
        detail_url: detailUrl,
      });
    } catch {
      continue;
    }
  }

  return vehicles;
}

async function scrapeDealer(
  browser: Browser,
  dealer: DealerConfig
): Promise<ScrapedVehicle[]> {
  const vehicleMap = new Map<string, ScrapedVehicle>();
  const timeout = dealer.timeout || 30000;

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  let totalCount = 0;
  let capturedRequestBody: string | null = null;

  page.on("request", (req) => {
    if (
      req.url().includes("getInventory") &&
      req.method() === "POST" &&
      !capturedRequestBody
    ) {
      capturedRequestBody = req.postData() || null;
    }
  });

  page.on("response", async (resp) => {
    if (
      resp.url().includes("getInventory") &&
      resp.status() === 200 &&
      resp.request().method() === "POST"
    ) {
      try {
        const data = await resp.json();
        if (data?.inventory?.length > 0) {
          const vehicles = parseDDCInventory(data, dealer);
          for (const v of vehicles) {
            vehicleMap.set(v.vin, v);
          }
          if (data.pageInfo?.totalCount) {
            totalCount = data.pageInfo.totalCount;
          }
        }
      } catch {
        /* empty */
      }
    }
  });

  try {
    await page.goto(dealer.searchUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    await page.waitForTimeout(8000);

    console.log(
      `  Initial: ${vehicleMap.size} vehicles (${totalCount} total in inventory)`
    );

    if (totalCount > 18 && capturedRequestBody) {
      const apiUrl = `${dealer.baseUrl}/api/widget/ws-inv-data/getInventory`;
      let start = 18;
      const pageSize = 18;

      while (start < totalCount) {
        console.log(`  Fetching offset ${start}...`);

        const pageData = await page.evaluate(
          async ({ apiUrl, requestBody, start, pageSize }) => {
            try {
              const body = JSON.parse(requestBody);
              if (!body.inventoryParameters) body.inventoryParameters = {};
              body.inventoryParameters.start = [String(start)];
              if (body.preferences) {
                body.preferences.pageSize = String(pageSize);
              }

              const resp = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              return await resp.json();
            } catch {
              return null;
            }
          },
          {
            apiUrl,
            requestBody: capturedRequestBody,
            start,
            pageSize,
          }
        );

        if (pageData?.inventory?.length > 0) {
          const vehicles = parseDDCInventory(pageData, dealer);
          for (const v of vehicles) {
            vehicleMap.set(v.vin, v);
          }
          console.log(
            `  Got ${vehicles.length} more, total: ${vehicleMap.size}`
          );
        } else {
          break;
        }

        start += pageSize;
        await randomDelay(1000, 2000);
      }
    }
  } catch (err) {
    const msg = (err as Error).message.split("\n")[0];
    console.log(`  Error: ${msg}`);
  } finally {
    await page.close();
    await context.close();
  }

  return Array.from(vehicleMap.values());
}

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
      console.log(`  Algolia API error: ${resp.status}`);
      return vehicles;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json();
    const hits = data.hits || [];
    console.log(
      `  Algolia returned ${hits.length} hits (${data.nbHits} total)`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: hit.in_transit ? "In Transit" : "In Stock",
        packages: hit.packages || [],
        stock_number: hit.stock || "",
        detail_url: detailUrl,
      });
    }
  } catch (err) {
    console.log(`  Algolia error: ${(err as Error).message}`);
  }

  return vehicles;
}

export async function scrapeAll(): Promise<ScrapedVehicle[]> {
  const allVehicles = new Map<string, ScrapedVehicle>();
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    for (const dealer of DEALERS) {
      console.log(`Scraping ${dealer.name}...`);

      try {
        const vehicles = await scrapeDealer(browser, dealer);
        console.log(`  Final: ${vehicles.length} vehicles`);

        for (const v of vehicles) {
          allVehicles.set(v.vin, v);
        }
      } catch (err) {
        console.error(`  Failed: ${(err as Error).message}`);
      }

      await randomDelay(2000, 4000);
    }
  } catch (err) {
    console.error("Scraper failed:", err);
  } finally {
    if (browser) await browser.close();
  }

  // Scrape Algolia-based dealers (no browser needed)
  for (const dealer of ALGOLIA_DEALERS) {
    console.log(`Scraping ${dealer.name} (Algolia)...`);

    try {
      const vehicles = await scrapeAlgoliaDealer(dealer);
      console.log(`  Final: ${vehicles.length} vehicles`);

      for (const v of vehicles) {
        allVehicles.set(v.vin, v);
      }
    } catch (err) {
      console.error(`  Failed: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal unique vehicles: ${allVehicles.size}`);
  return Array.from(allVehicles.values());
}
