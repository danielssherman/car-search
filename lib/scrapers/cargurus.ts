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

      // Intercept all responses to find listing data
      page.on("response", async (resp) => {
        const url = resp.url();
        // Log cargurus API calls for debugging
        if (url.includes("cargurus.com") && !url.includes(".js") && !url.includes(".css") && !url.includes(".png") && !url.includes(".jpg") && !url.includes(".svg") && !url.includes(".woff")) {
          const contentType = resp.headers()["content-type"] || "";
          if (contentType.includes("json") || url.includes("ajax") || url.includes("inventory") || url.includes("listing")) {
            console.log(`[CarGurus] Response: ${resp.status()} ${url.substring(0, 120)} (${contentType.substring(0, 30)})`);
          }
        }

        if (
          url.includes("cargurus.com") &&
          resp.status() === 200
        ) {
          try {
            const contentType = resp.headers()["content-type"] || "";
            if (!contentType.includes("json")) return;

            const data = await resp.json();
            // Try multiple possible shapes for listing data
            const listings =
              data?.listings ||
              data?.results ||
              data?.searchResults ||
              data?.inventory ||
              data?.data?.listings ||
              data?.data?.results ||
              [];
            if (!Array.isArray(listings) || listings.length === 0) return;

            console.log(`[CarGurus] Found ${listings.length} listings in JSON response`);
            // Log first listing keys for debugging
            if (listings[0]) {
              console.log(`[CarGurus] Listing keys: ${Object.keys(listings[0]).slice(0, 15).join(", ")}`);
            }

            for (const listing of listings) {
              const vehicle = parseCarGurusListing(listing);
              if (vehicle) {
                vehicleMap.set(vehicle.vin, vehicle);
              }
            }
          } catch {
            // Not JSON or parsing failed
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
        `[CarGurus] Initial load from network: ${vehicleMap.size} vehicles captured`
      );

      // Try extracting listing data embedded in the page (SSR)
      if (vehicleMap.size === 0) {
        console.log("[CarGurus] No network JSON found, trying page extraction...");

        const pageData = await page.evaluate(() => {
          // Check for __NEXT_DATA__ or similar embedded JSON
          const nextData = document.querySelector("#__NEXT_DATA__");
          if (nextData?.textContent) return { source: "__NEXT_DATA__", data: nextData.textContent.substring(0, 500) };

          // Check for window.__CARGURUS_SEARCH_STATE__ or similar globals
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          for (const key of Object.keys(w)) {
            if (key.includes("CARGURUS") || key.includes("SEARCH") || key.includes("LISTING") || key.includes("__INITIAL")) {
              try {
                const val = JSON.stringify(w[key]);
                if (val && val.length > 100) return { source: key, data: val.substring(0, 500) };
              } catch { /* skip */ }
            }
          }

          // Check for script tags with JSON-LD or embedded data
          const scripts = document.querySelectorAll("script[type='application/json'], script[type='application/ld+json']");
          for (const s of scripts) {
            if (s.textContent && s.textContent.length > 200) {
              return { source: `script[${s.getAttribute("type")}]`, data: s.textContent.substring(0, 500) };
            }
          }

          // Log page title and URL for debugging
          return {
            source: "page_info",
            data: JSON.stringify({
              title: document.title,
              url: window.location.href,
              bodyLen: document.body?.innerHTML?.length || 0,
              hasVehicleCards: document.querySelectorAll("[data-cg-ft='car-blade']").length,
              hasListingCards: document.querySelectorAll(".listing-row, .cg-listingDetail, .result-card, article").length,
            }),
          };
        });

        console.log(`[CarGurus] Page extraction (${pageData.source}): ${pageData.data}`);

        // Try extracting from Remix/React hydration data
        const remixData = await page.evaluate(() => {
          // Remix framework embeds route data in script tags
          const scripts = Array.from(document.querySelectorAll("script"));
          for (const s of scripts) {
            const text = s.textContent || "";
            if (text.includes("vehicleIdentifier") || text.includes("listingId") || text.includes("serviceProvider")) {
              return text.substring(0, 2000);
            }
          }
          // Check all script tags for anything with listing-like data
          for (const s of scripts) {
            const text = s.textContent || "";
            if (text.includes('"vin"') || text.includes('"price"') || text.includes('"makeName"')) {
              return text.substring(0, 2000);
            }
          }
          return null;
        });

        if (remixData) {
          console.log(`[CarGurus] Found embedded script data: ${remixData.substring(0, 300)}`);
        }
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
