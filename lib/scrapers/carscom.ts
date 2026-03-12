import { chromium } from "playwright";
import type { ScrapedVehicle } from "../types";
import type { ScraperModule, ScraperConfig } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Bay Area zip codes with 50-mile radius covers the whole region
const SEARCH_ZIPS = ["94102"];
const SEARCH_RADIUS = 50;
const PAGE_SIZE = 100;

function randomDelay(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchUrl(zip: string, page: number): string {
  const params = new URLSearchParams({
    stock_type: "new",
    zip,
    maximum_distance: String(SEARCH_RADIUS),
    page_size: String(PAGE_SIZE),
    page: String(page),
    sort: "best_match_desc",
  });
  return `https://www.cars.com/shopping/results/?${params.toString()}`;
}

/**
 * Parse a single vehicle card from the Cars.com search results page.
 * Returns null if essential data is missing.
 */
async function parseVehicleCard(
  card: import("playwright").Locator
): Promise<ScrapedVehicle | null> {
  try {
    // Title like "2026 BMW X3 xDrive30"
    const title = (await card.locator("h2.title").textContent())?.trim() || "";
    if (!title) return null;

    // Parse year, make, model, trim from title
    // Format: "YYYY Make Model Trim..." or "New YYYY Make Model Trim..."
    const titleClean = title.replace(/^New\s+/i, "");
    const parts = titleClean.split(/\s+/);
    if (parts.length < 3) return null;

    const year = parseInt(parts[0]);
    if (isNaN(year) || year < 2000 || year > 2030) return null;

    const make = parts[1];
    const model = parts[2];
    const trim = parts.slice(3).join(" ") || model;

    // Price
    const priceText =
      (await card.locator("span.primary-price").textContent())?.trim() || "";
    const msrp = parseInt(priceText.replace(/[^0-9]/g, "")) || 0;

    // Mileage
    const mileageText =
      (await card.locator("div.mileage").textContent().catch(() => ""))?.trim() || "";
    const mileage = parseInt(mileageText.replace(/[^0-9]/g, "")) || 0;

    // Dealer name
    const dealerName =
      (await card.locator("div.dealer-name").textContent().catch(() => ""))?.trim() ||
      "Unknown Dealer";

    // Dealer location (distance info like "12 mi. away")
    const locationText =
      (await card.locator(".miles-from").textContent().catch(() => ""))?.trim() || "";

    // Extract city from dealer info if available
    const dealerCity = locationText || "Bay Area";

    // Detail URL
    const linkEl = card.locator("a.vehicle-card-link").first();
    const href = (await linkEl.getAttribute("href").catch(() => "")) || "";
    const detailUrl = href ? `https://www.cars.com${href}` : "";

    // Stock number from the card (often in data attributes or small text)
    const stockNumber =
      (await card.getAttribute("data-stock-number").catch(() => "")) || "";

    // VIN - Cars.com sometimes includes it in data attributes or detail URL
    // The detail URL often contains the listing ID, not VIN directly.
    // We'll try to extract VIN from the card's data attributes.
    let vin =
      (await card.getAttribute("data-vin").catch(() => "")) || "";

    // If no VIN in data attributes, try to find it in the card text
    if (!vin) {
      const cardText = (await card.textContent()) || "";
      const vinMatch = cardText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
      if (vinMatch) vin = vinMatch[0];
    }

    // If still no VIN, generate a placeholder from the listing URL
    // (we'll try to get VINs from detail pages in a future iteration)
    if (!vin && href) {
      const listingMatch = href.match(/\/vehicle-detail\/([^/]+)/);
      if (listingMatch) vin = `CARSCOM-${listingMatch[1]}`;
    }

    if (!vin) return null;

    return {
      vin,
      year,
      make,
      model,
      trim,
      body_style: "",
      drivetrain: "",
      engine: "",
      fuel_type: "",
      mileage,
      condition: "New",
      exterior_color: "Unknown",
      interior_color: "Unknown",
      msrp,
      source: "carscom",
      dealer_name: dealerName,
      dealer_city: dealerCity,
      status: "In Stock",
      packages: [],
      stock_number: stockNumber,
      detail_url: detailUrl,
    };
  } catch {
    return null;
  }
}

const carscomScraper: ScraperModule = {
  name: "carscom",

  async scrape(_config: ScraperConfig): Promise<ScrapedVehicle[]> {
    const allVehicles = new Map<string, ScrapedVehicle>();
    let browser = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-http2",
        ],
      });

      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezoneId: "America/Los_Angeles",
        extraHTTPHeaders: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      for (const zip of SEARCH_ZIPS) {
        let currentPage = 1;
        let hasMore = true;

        while (hasMore) {
          const url = buildSearchUrl(zip, currentPage);
          console.log(
            `[Cars.com] Fetching zip ${zip}, page ${currentPage}...`
          );

          try {
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 90000,
            });

            // Handle Cloudflare challenge — wait for it to auto-resolve
            const pageTitle = await page.title();
            if (pageTitle.includes("Just a moment") || pageTitle.includes("Checking")) {
              console.log("[Cars.com] Cloudflare challenge detected, waiting...");
              await page.waitForFunction(
                () => !document.title.includes("Just a moment") && !document.title.includes("Checking"),
                { timeout: 30000 }
              ).catch(() => null);
              await page.waitForTimeout(3000);
            }

            // Wait for vehicle cards to load
            await page
              .waitForSelector("div.vehicle-card", { timeout: 30000 })
              .catch(() => null);

            const cards = page.locator("div.vehicle-card");
            const count = await cards.count();

            if (count === 0) {
              // Debug: log what we actually see
              const title = await page.title();
              const bodyLen = await page.evaluate(() => document.body?.innerHTML?.length || 0);
              console.log(`[Cars.com] No results on page ${currentPage} (title: "${title}", bodyLen: ${bodyLen})`);
              hasMore = false;
              break;
            }

            console.log(
              `[Cars.com] Found ${count} cards on page ${currentPage}`
            );

            for (let i = 0; i < count; i++) {
              const vehicle = await parseVehicleCard(cards.nth(i));
              if (vehicle) {
                allVehicles.set(vehicle.vin, vehicle);
              }
            }

            // Check if there's a next page
            // Cars.com uses page_size=100; if we get fewer, we're done
            if (count < PAGE_SIZE) {
              hasMore = false;
            } else {
              currentPage++;
              await randomDelay(3000, 6000);
            }
          } catch (err) {
            console.error(
              `[Cars.com] Page ${currentPage} error: ${(err as Error).message}`
            );
            hasMore = false;
          }
        }
      }

      await page.close();
      await context.close();
    } catch (err) {
      console.error(`[Cars.com] Scraper error: ${(err as Error).message}`);
    } finally {
      if (browser) await browser.close();
    }

    console.log(`[Cars.com] Total vehicles: ${allVehicles.size}`);
    return Array.from(allVehicles.values());
  },
};

export default carscomScraper;

/*
 * APPROACH NOTES (Cars.com Scraping Research, March 2026):
 *
 * - Cars.com no longer has a public API (developer.cars.com redirects to contact page).
 * - Search results are server-side rendered HTML — no XHR/JSON API to intercept.
 * - We use Playwright to load the search results page and parse DOM.
 *
 * URL structure: https://www.cars.com/shopping/results/?stock_type=new&zip=94102&maximum_distance=50&page_size=100&page=1
 * Parameters: stock_type, makes[], models[], zip, maximum_distance, page_size, page, sort, year_min, year_max
 * Pagination: page=N (1-indexed), page_size max 100.
 *
 * CSS selectors (verified from multiple open-source scrapers):
 *   - Vehicle card: div.vehicle-card
 *   - Title: h2.title
 *   - Price: span.primary-price
 *   - Mileage: div.mileage
 *   - Dealer: div.dealer-name
 *   - Distance: .miles-from
 *
 * VIN extraction: Cars.com doesn't always expose VIN on the search results page.
 * VINs may be available in data attributes or on detail pages. For now, we extract
 * what's available from the card and fall back to a listing-ID-based identifier.
 * A future improvement would be to visit detail pages for VIN extraction (dl.fancy-description-list).
 *
 * Bot protection: Cars.com has anti-bot measures. Playwright with stealth settings
 * (hiding webdriver, realistic user-agent) is required. Direct fetch requests time out.
 *
 * Single zip (94102) with 50-mile radius covers the Bay Area. If coverage gaps appear,
 * additional zips (94040, 94536, 94901, 94401) can be added to SEARCH_ZIPS.
 */
