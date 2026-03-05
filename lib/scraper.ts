import { chromium, type Browser } from "playwright";
import type { ScrapedVehicle } from "./types";

interface DealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  searchUrl: string;
  timeout?: number;
}

const DEALERS: DealerConfig[] = [
  {
    name: "Stevens Creek BMW",
    city: "San Jose",
    baseUrl: "https://www.stevenscreekbmw.com",
    searchUrl:
      "https://www.stevenscreekbmw.com/new-inventory/index.htm?search=3+Series",
  },
  {
    name: "BMW of Fremont",
    city: "Fremont",
    baseUrl: "https://www.bmwoffremont.com",
    searchUrl:
      "https://www.bmwoffremont.com/new-inventory/index.htm?search=3+Series",
  },
  {
    name: "BMW of San Francisco",
    city: "San Francisco",
    baseUrl: "https://www.bmwofsanfrancisco.com",
    searchUrl:
      "https://www.bmwofsanfrancisco.com/new-inventory/index.htm?search=3+Series",
    timeout: 45000,
  },
  {
    name: "East Bay BMW",
    city: "Pleasanton",
    baseUrl: "https://www.eastbaybmw.com",
    searchUrl:
      "https://www.eastbaybmw.com/new-inventory/index.htm?search=3+Series",
  },
  {
    name: "Marin BMW",
    city: "San Rafael",
    baseUrl: "https://www.marinbmw.com",
    searchUrl:
      "https://www.marinbmw.com/new-inventory/index.htm?search=3+Series",
  },
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function randomDelay(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyModel(
  model: string,
  trim: string,
  title: string
): { model: string; trim: string } | null {
  const combined = `${model} ${trim} ${title}`.toLowerCase();
  if (combined.includes("m340i")) {
    const xdrive = combined.includes("xdrive");
    return { model: "M340i", trim: xdrive ? "M340i xDrive" : "M340i" };
  }
  if (combined.includes("330i")) {
    const xdrive = combined.includes("xdrive");
    return { model: "330i", trim: xdrive ? "330i xDrive" : "330i" };
  }
  return null;
}

function extractPackages(packages: string[]): string[] {
  const allText = packages.join(" ").toLowerCase();
  const found: string[] = [];
  if (allText.includes("m sport")) found.push("M Sport");
  if (allText.includes("premium")) found.push("Premium");
  if (allText.includes("technology") || allText.includes("tech pkg"))
    found.push("Technology");
  if (allText.includes("executive")) found.push("Executive");
  if (allText.includes("convenience")) found.push("Convenience");
  if (allText.includes("driving assistance")) found.push("Driving Assistance");
  if (allText.includes("parking assistance")) found.push("Parking Assistance");
  if (allText.includes("shadowline")) found.push("Shadowline");
  return found;
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
      const model = item.model || "";
      const trim = item.trim || "";
      const titleArr: string[] = item.title || [];
      const title = titleArr.join(" ");

      const classification = classifyModel(model, trim, title);
      if (!classification) continue;

      const vin = item.vin || "";
      if (!vin) continue;

      // Colors from trackingAttributes or attributes
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

      const stockNumber = item.stockNumber || "";
      const statusInt = item.statusInt;
      const isInTransit = statusInt === 7;

      // Packages
      const pkgs: string[] = item.packages || [];
      const link = item.link || "";
      const detailUrl = link
        ? `${dealer.baseUrl}${link}`
        : `${dealer.baseUrl}/new-inventory/index.htm?search=${vin}`;

      vehicles.push({
        vin,
        year: item.year || new Date().getFullYear(),
        model: classification.model,
        trim: classification.trim,
        exterior_color: extColor
          .replace(/ Exterior$/, "")
          .replace(/ Metallic$/, " Metallic"),
        interior_color: intColor.replace(/ Interior$/, ""),
        msrp,
        dealer_name: dealer.name,
        dealer_city: dealer.city,
        status: isInTransit ? "In Transit" : "In Stock",
        packages: extractPackages(pkgs),
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

  // Intercept inventory API requests and responses
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
      } catch {}
    }
  });

  try {
    await page.goto(dealer.searchUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Wait for initial API response
    await page.waitForTimeout(8000);

    console.log(
      `  Initial: ${vehicleMap.size} matching (${totalCount} total in inventory)`
    );

    // If there are more vehicles, fetch additional pages from within page context
    if (totalCount > 18 && capturedRequestBody) {
      const apiUrl = `${dealer.baseUrl}/api/widget/ws-inv-data/getInventory`;
      let start = 18;
      const pageSize = 18;

      while (start < totalCount) {
        console.log(`  Fetching offset ${start}...`);

        // Make the API call from within the page (uses page cookies)
        const pageData = await page.evaluate(
          async ({ apiUrl, requestBody, start, pageSize }) => {
            try {
              const body = JSON.parse(requestBody);
              // Update pagination
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
            } catch (e) {
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
          console.log(`  Got ${vehicles.length} more, total: ${vehicleMap.size}`);
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
        console.log(`  Final: ${vehicles.length} 330i/M340i vehicles`);

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

  console.log(`\nTotal unique vehicles: ${allVehicles.size}`);
  return Array.from(allVehicles.values());
}
