import { chromium, type Browser } from "playwright";
import type { ScrapedVehicle } from "../types";
import type { ScraperModule, ScraperConfig } from "./types";
import { loadDDCDealers, type DDCDealerConfig } from "./dealer-config";

export type { DDCDealerConfig } from "./dealer-config";

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
export function parseDDCInventory(data: any, dealer: DDCDealerConfig): ScrapedVehicle[] {
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

      const tp = item.trackingPricing;
      const parsePrice = (v: unknown) =>
        v ? parseInt(String(v).replace(/[^0-9]/g, "")) || 0 : 0;

      const msrp = parsePrice(tp?.msrp) || parsePrice(item.pricing?.retailPrice) || 0;
      const askingPrice = parsePrice(tp?.askingPrice)
        || parsePrice(tp?.internetPrice)
        || parsePrice(tp?.salePrice)
        || parsePrice(item.pricing?.dprice?.[0]?.value)
        || msrp;

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
        asking_price: askingPrice,
        source: "dealer_ddc",
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: isInTransit ? "In Transit" : "In Stock",
        packages: pkgs,
        stock_number: stockNumber,
        detail_url: detailUrl,
      });
    } catch (err) {
      console.warn(`[DDC:parse] Skipped item for ${dealer.name}: ${(err as Error).message}`);
      continue;
    }
  }

  return vehicles;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCosmosInventory(data: any, dealer: DDCDealerConfig): ScrapedVehicle[] {
  const vehicles: ScrapedVehicle[] = [];
  const cards = data?.DisplayCards || [];

  for (const card of cards) {
    try {
      const vc = card?.VehicleCard;
      if (!vc) continue;

      const vin = vc.VehicleVin || "";
      if (!vin) continue;

      const make = vc.VehicleMake || dealer.defaultMake;
      const model = vc.VehicleModel || "";
      const trim = vc.VehicleTrim || vc.VehicleRuleAdjustedTrim || model;
      if (!model && !trim) continue;

      const msrp = vc.VehicleMsrp || 0;
      const askingPrice = vc.TaggingPrice || vc.VehicleInternetPrice || msrp;

      vehicles.push({
        vin,
        year: vc.VehicleYear || vc.VehicleRuleAdjustedYear || new Date().getFullYear(),
        make,
        model,
        trim,
        body_style: vc.VehicleBodyStyle || vc.TaggingItemType || "",
        drivetrain: "",
        engine: vc.VehicleEngine || "",
        fuel_type: vc.VehicleFuelType || "",
        mileage: parseInt(String(vc.Mileage || "0").replace(/[^0-9]/g, "")) || 0,
        condition: vc.VehicleCondition || "New",
        exterior_color: (vc.ExteriorColorLabel || vc.VehicleGenericColor || "Unknown")
          .replace(/ Exterior$/, ""),
        interior_color: (vc.InteriorColorLabel || "Unknown")
          .replace(/ Interior$/, ""),
        msrp,
        asking_price: askingPrice,
        source: "dealer_ddc",
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: vc.VehicleInTransit ? "In Transit" : "In Stock",
        packages: ((vc.Features || []) as string[]).filter((f: string) =>
          /package|edition|kit|option/i.test(f)
        ),
        stock_number: vc.VehicleStockNumber || "",
        detail_url: vc.VehicleDetailUrl || `${dealer.baseUrl}/new-inventory/index.htm?search=${vin}`,
      });
    } catch (err) {
      console.warn(`[Cosmos:parse] Skipped item for ${dealer.name}: ${(err as Error).message}`);
      continue;
    }
  }

  return vehicles;
}

async function scrapeDealer(
  browser: Browser,
  dealer: DDCDealerConfig
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
  let cosmosApiUrl: string | null = null;
  let useCosmos = false;

  // Intercept classic DDC API
  page.on("request", (req) => {
    if (
      req.url().includes("getInventory") &&
      req.method() === "POST" &&
      !capturedRequestBody
    ) {
      capturedRequestBody = req.postData() || null;
    }
    // Detect Cosmos API
    if (req.url().includes("vhcliaa") && req.url().includes("vehicles") && !cosmosApiUrl) {
      cosmosApiUrl = req.url();
      useCosmos = true;
    }
  });

  page.on("response", async (resp) => {
    // Classic DDC API
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
      } catch (err) {
        console.warn(`[DDC:response] Failed to parse getInventory for ${dealer.name}: ${(err as Error).message}`);
      }
    }
    // Cosmos API
    if (
      resp.url().includes("vhcliaa") &&
      resp.url().includes("vehicles") &&
      resp.status() === 200
    ) {
      try {
        const data = await resp.json();
        const vehicles = parseCosmosInventory(data, dealer);
        for (const v of vehicles) {
          vehicleMap.set(v.vin, v);
        }
        const paging = data?.Paging?.PaginationDataModel;
        if (paging?.TotalCount) {
          totalCount = paging.TotalCount;
        }
      } catch (err) {
        console.warn(`[Cosmos:response] Failed to parse response for ${dealer.name}: ${(err as Error).message}`);
      }
    }
  });

  try {
    await page.goto(dealer.searchUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Wait for either Classic DDC (getInventory) or Cosmos API response
    // instead of a fixed 8s timeout — handles slow local page loads
    try {
      await page.waitForResponse(
        (resp) =>
          ((resp.url().includes("getInventory") && resp.request().method() === "POST") ||
           (resp.url().includes("vhcliaa") && resp.url().includes("vehicles"))) &&
          resp.status() === 200,
        { timeout: 20000 }
      );
    } catch {
      console.warn(`  [DDC] ${dealer.name}: no API response intercepted within 20s`);
    }
    // Brief extra wait for response handler to finish async JSON parsing
    await page.waitForTimeout(1000);

    const diagnostics = [
      !useCosmos && vehicleMap.size === 0 ? "(WARNING: no vehicles captured)" : "",
      !useCosmos && !capturedRequestBody ? "(no request body for pagination)" : "",
    ].filter(Boolean).join(" ");
    console.log(
      `  [DDC] ${dealer.name}: ${vehicleMap.size} vehicles (${totalCount} total) [${useCosmos ? "cosmos" : "classic"}]${diagnostics ? " " + diagnostics : ""}`
    );

    // Paginate: Cosmos API
    if (useCosmos && cosmosApiUrl && totalCount > vehicleMap.size) {
      const pageSize = 96; // Cosmos supports 12, 24, 48, 96
      // Strip any existing pn/pt params, add pn=96 for max page size
      const cosmosBase = cosmosApiUrl
        .replace(/[&?]pn=\d+/g, "")
        .replace(/[&?]pt=\d+/g, "")
        .replace(/[&?]displayCardsShown=[^&]*/g, "");
      const separator = cosmosBase.includes("?") ? "&" : "?";
      let pageNum = 2;
      const maxPages = Math.ceil(totalCount / pageSize) + 1; // safety cap

      while (vehicleMap.size < totalCount && pageNum <= maxPages) {
        const fetchUrl = `${cosmosBase}${separator}pn=${pageSize}&pt=${pageNum}&displayCardsShown=${vehicleMap.size}`;
        console.log(`  [DDC] ${dealer.name}: cosmos page ${pageNum} (have ${vehicleMap.size}/${totalCount})...`);

        const prevSize = vehicleMap.size;
        const pageData = await page.evaluate(async (url: string) => {
          try {
            const resp = await fetch(url);
            return await resp.json();
          } catch {
            return null;
          }
        }, fetchUrl);

        if (pageData?.DisplayCards?.length > 0) {
          const vehicles = parseCosmosInventory(pageData, dealer);
          for (const v of vehicles) {
            vehicleMap.set(v.vin, v);
          }
        } else {
          break;
        }

        // If no new VINs were added, stop to avoid infinite loop
        if (vehicleMap.size === prevSize) break;

        pageNum++;
        await randomDelay(1000, 2000);
      }
    }

    // Paginate: Classic DDC API
    if (!useCosmos && totalCount > 18 && capturedRequestBody) {
      const apiUrl = `${dealer.baseUrl}/api/widget/ws-inv-data/getInventory`;
      let start = 18;
      const pageSize = 18;

      while (start < totalCount) {
        console.log(`  [DDC] ${dealer.name}: fetching offset ${start}...`);

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
            `  [DDC] ${dealer.name}: +${vehicles.length}, total: ${vehicleMap.size}`
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
    console.log(`  [DDC] ${dealer.name} error: ${msg}`);
  } finally {
    await page.close();
    await context.close();
  }

  return Array.from(vehicleMap.values());
}

/**
 * Run async tasks with a concurrency limit using a worker-pool pattern.
 * Each worker pulls from a shared queue until empty.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Max number of dealers to scrape in parallel. Each gets its own browser context. */
const DDC_CONCURRENCY = 3;

const ddcScraper: ScraperModule = {
  name: "dealer_ddc",

  async scrape(_config: ScraperConfig): Promise<ScrapedVehicle[]> {
    const allVehicles = new Map<string, ScrapedVehicle>();
    let browser: Browser | null = null;
    const dealers = loadDDCDealers();

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      const browserRef = browser;

      console.log(`[DDC] Scraping ${dealers.length} dealers with concurrency ${DDC_CONCURRENCY}...`);

      await runWithConcurrency(dealers, DDC_CONCURRENCY, async (dealer) => {
        console.log(`[DDC] Scraping ${dealer.name}...`);
        try {
          const vehicles = await scrapeDealer(browserRef, dealer);
          console.log(`[DDC] ${dealer.name}: ${vehicles.length} vehicles`);
          for (const v of vehicles) {
            allVehicles.set(v.vin, v);
          }
        } catch (err) {
          console.error(`[DDC] ${dealer.name} failed: ${(err as Error).message}`);
        }
        await randomDelay(2000, 4000);
      });
    } finally {
      if (browser) await browser.close();
    }

    return Array.from(allVehicles.values());
  },
};

export default ddcScraper;
