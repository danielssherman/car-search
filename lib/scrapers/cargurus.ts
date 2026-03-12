import { chromium, type Browser } from "playwright";
import type { ScrapedVehicle } from "../types";
import type { ScraperModule, ScraperConfig } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// CarGurus entity codes for BMW models
const BMW_ENTITY = "m3"; // All BMW

// Bay Area search
const SEARCH_ZIP = "94102";
const SEARCH_DISTANCE = 50;

const LISTING_URL =
  "https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action";

const AJAX_URL =
  "https://www.cargurus.com/Cars/inventorylisting/ajaxFetchSubsetInventoryListing.action";

function randomDelay(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchUrl(): string {
  const params = new URLSearchParams({
    zip: SEARCH_ZIP,
    maxDistance: String(SEARCH_DISTANCE),
    "entitySelectingHelper.selectedEntity": BMW_ENTITY,
    showNegotiable: "true",
    sortDir: "ASC",
    sourceContext: "carGurusHomePageModel",
    inventorySearchWidgetType: "AUTO",
  });
  return `${LISTING_URL}?${params.toString()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCarGurusListing(listing: any): ScrapedVehicle | null {
  try {
    const vin = listing.vehicleIdentifier || listing.vin || "";
    if (!vin || vin.length < 10) return null;

    const year = listing.carYear || listing.year || 0;
    if (!year) return null;

    const make = listing.makeName || "BMW";
    const model = listing.modelName || "";
    if (!model) return null;

    const trim = listing.trimName || listing.trims || model;

    const price =
      listing.price ||
      listing.expectedPrice ||
      parseInt(String(listing.priceString || "").replace(/[^0-9]/g, "")) ||
      0;

    const mileage =
      listing.mileage ||
      parseInt(String(listing.mileageString || "").replace(/[^0-9]/g, "")) ||
      0;

    const dealerName =
      listing.serviceProviderName ||
      listing.sellerName ||
      "Unknown Dealer";

    const dealerCity =
      listing.sellerCity || listing.localizedSellerCity || "Bay Area";

    const exteriorColor = listing.exteriorColorName || "Unknown";

    const condition =
      mileage === 0 || listing.isNew ? "New" : listing.isCpo ? "CPO" : "Used";

    const listingId = listing.id || listing.listingId || "";
    const detailUrl = listingId
      ? `https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?listingId=${listingId}`
      : "";

    return {
      vin,
      year,
      make,
      model,
      trim,
      body_style: listing.bodyTypeName || "",
      drivetrain: listing.drivetrainName || "",
      engine: listing.engineDisplayName || "",
      fuel_type: listing.fuelType || "",
      mileage,
      condition,
      exterior_color: exteriorColor,
      interior_color: listing.interiorColorName || "Unknown",
      msrp: price,
      source: "cargurus",
      dealer_name: dealerName,
      dealer_city: dealerCity,
      status: "In Stock",
      packages: [],
      stock_number: listing.stockNumber || "",
      detail_url: detailUrl,
    };
  } catch {
    return null;
  }
}

const cargurusScraper: ScraperModule = {
  name: "cargurus",

  async scrape(_config: ScraperConfig): Promise<ScrapedVehicle[]> {
    const vehicleMap = new Map<string, ScrapedVehicle>();
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

      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezoneId: "America/Los_Angeles",
      });

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      // Intercept AJAX responses containing listing data
      page.on("response", async (resp) => {
        const url = resp.url();
        if (
          (url.includes("ajaxFetchSubsetInventoryListing") ||
            url.includes("viewDetailsFilterViewInventoryListing")) &&
          resp.status() === 200
        ) {
          try {
            const contentType = resp.headers()["content-type"] || "";
            if (!contentType.includes("json")) return;

            const data = await resp.json();
            const listings = data?.listings || data?.results || [];
            if (!Array.isArray(listings)) return;

            for (const listing of listings) {
              const vehicle = parseCarGurusListing(listing);
              if (vehicle) {
                vehicleMap.set(vehicle.vin, vehicle);
              }
            }
          } catch {
            // Response wasn't JSON or parsing failed — skip
          }
        }
      });

      // Navigate to the search page — this triggers the initial data load
      const searchUrl = buildSearchUrl();
      console.log(`[CarGurus] Loading BMW search (zip ${SEARCH_ZIP})...`);

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for results to render
      await page.waitForTimeout(8000);
      console.log(
        `[CarGurus] Initial load: ${vehicleMap.size} vehicles captured`
      );

      // Paginate: scroll or click "next page" to trigger more AJAX loads
      let previousCount = 0;
      let pageNum = 1;
      const MAX_PAGES = 20;

      while (pageNum < MAX_PAGES) {
        previousCount = vehicleMap.size;

        // Try clicking the next page button
        const nextButton = page.locator(
          'button[aria-label="Next page"], a.nextPageElement, [data-testid="next-page"]'
        );
        const hasNext = (await nextButton.count()) > 0;

        if (!hasNext) {
          // Try scrolling to bottom to trigger infinite scroll
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );
          await page.waitForTimeout(3000);

          if (vehicleMap.size === previousCount) {
            console.log(`[CarGurus] No more results after page ${pageNum}`);
            break;
          }
        } else {
          try {
            await nextButton.first().click();
            pageNum++;
            console.log(
              `[CarGurus] Page ${pageNum}: ${vehicleMap.size} vehicles so far`
            );
            await page.waitForTimeout(4000);
          } catch {
            console.log(`[CarGurus] Next page click failed on page ${pageNum}`);
            break;
          }
        }

        await randomDelay(1500, 3000);
      }

      await page.close();
      await context.close();
    } catch (err) {
      console.error(
        `[CarGurus] Scraper error: ${(err as Error).message.split("\n")[0]}`
      );
    } finally {
      if (browser) await browser.close();
    }

    console.log(`[CarGurus] Total vehicles: ${vehicleMap.size}`);
    return Array.from(vehicleMap.values());
  },
};

export default cargurusScraper;
