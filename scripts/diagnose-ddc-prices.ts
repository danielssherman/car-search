/**
 * Diagnostic script to investigate $0 price bug in DDC scraper.
 *
 * Launches Playwright against BMW of San Rafael, intercepts the getInventory
 * API response, and dumps all pricing-related fields for every vehicle —
 * especially those where trackingPricing.msrp is falsy.
 */

import { chromium } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SEARCH_URL = "https://www.bmwofsanrafael.com/new-inventory/index.htm";
const BASE_URL = "https://www.bmwofsanrafael.com";

const KNOWN_ZERO_VINS = new Set([
  "WB543CF05TCX40966",
  "WBA23EH06TCX55574",
  "WBS33HJ05TFW37915",
  "WBY63HD06TFW44158",
  "WBY33HG03TCX45352",
  "WBY63HD05TFW43812",
  "WB543CF07TCX38331",
  "WBA63FT02TFW41973",
  "WBX73EF06T5582688",
  "WB543CF01TCX52550",
  "WBY43HD08TFW47134",
  "WBY63HD05TFW45902",
  "WBY63HD07TFW46744",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPriceFields(obj: any, prefix = ""): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  if (!obj || typeof obj !== "object") return results;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (/price|msrp|cost|retail|sticker/i.test(key)) {
      results[fullKey] = value;
    }
    // Don't recurse too deep
    if (typeof value === "object" && value !== null && !Array.isArray(value) && !prefix.includes(".")) {
      Object.assign(results, findPriceFields(value, fullKey));
    }
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPricingFromAttrs(attrs: Array<{ name: string; value?: string }> | undefined): Record<string, string> {
  if (!attrs || !Array.isArray(attrs)) return {};
  const results: Record<string, string> = {};
  for (const attr of attrs) {
    if (/price|msrp|cost|retail|sticker/i.test(attr.name)) {
      results[attr.name] = attr.value || "(empty)";
    }
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function analyzeItem(item: any, index: number): void {
  const vin = item.vin || "(no VIN)";
  const year = item.year || "?";
  const model = item.model || "?";
  const trim = item.trim || "";

  const tp = item.trackingPricing;
  const msrpValue = tp?.msrp;
  const isFalsy = !msrpValue;
  const isKnownZero = KNOWN_ZERO_VINS.has(vin);

  const marker = isFalsy ? " *** $0 VEHICLE ***" : "";
  const knownMarker = isKnownZero ? " [KNOWN $0 VIN]" : "";

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Vehicle #${index + 1}: ${year} ${model} ${trim} — VIN: ${vin}${marker}${knownMarker}`);
  console.log("=".repeat(80));

  // 1. trackingPricing (full object)
  console.log("\n  trackingPricing:", JSON.stringify(tp, null, 4));

  // 2. item.pricing (if exists)
  if (item.pricing !== undefined) {
    console.log("\n  item.pricing:", JSON.stringify(item.pricing, null, 4));
  }

  // 3. Top-level price fields
  const topLevelPriceKeys = ["msrp", "price", "askingPrice", "internetPrice", "displayPrice", "finalPrice", "retailPrice", "invoicePrice"];
  const topLevelFound: Record<string, unknown> = {};
  for (const key of topLevelPriceKeys) {
    if (item[key] !== undefined) {
      topLevelFound[key] = item[key];
    }
  }
  if (Object.keys(topLevelFound).length > 0) {
    console.log("\n  Top-level price fields:", JSON.stringify(topLevelFound, null, 4));
  }

  // 4. Price-related attrs from item.attributes
  const attrPrices = extractPricingFromAttrs(item.attributes);
  if (Object.keys(attrPrices).length > 0) {
    console.log("\n  item.attributes (price-related):", JSON.stringify(attrPrices, null, 4));
  }

  // 5. Price-related attrs from item.trackingAttributes
  const trackAttrPrices = extractPricingFromAttrs(item.trackingAttributes);
  if (Object.keys(trackAttrPrices).length > 0) {
    console.log("\n  item.trackingAttributes (price-related):", JSON.stringify(trackAttrPrices, null, 4));
  }

  // 6. pricingDetails or priceInfo
  if (item.pricingDetails !== undefined) {
    console.log("\n  item.pricingDetails:", JSON.stringify(item.pricingDetails, null, 4));
  }
  if (item.priceInfo !== undefined) {
    console.log("\n  item.priceInfo:", JSON.stringify(item.priceInfo, null, 4));
  }

  // 7. Deep scan for any price-related fields
  const deepPriceFields = findPriceFields(item);
  if (Object.keys(deepPriceFields).length > 0) {
    console.log("\n  All price-related fields (deep scan):", JSON.stringify(deepPriceFields, null, 4));
  }

  // 8. For $0 items, dump ALL top-level keys
  if (isFalsy) {
    console.log("\n  >>> ALL TOP-LEVEL KEYS for $0 vehicle:");
    const keys = Object.keys(item).sort();
    console.log(`  Keys (${keys.length}):`, keys.join(", "));

    // Also show values of potentially interesting non-nested fields
    console.log("\n  >>> NON-OBJECT VALUES for $0 vehicle:");
    for (const key of keys) {
      const val = item[key];
      if (val === null || val === undefined || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        console.log(`    ${key}: ${JSON.stringify(val)}`);
      } else if (Array.isArray(val) && val.length < 10) {
        console.log(`    ${key}: ${JSON.stringify(val)}`);
      } else if (typeof val === "object") {
        console.log(`    ${key}: [object with keys: ${Object.keys(val).join(", ")}]`);
      }
    }
  }
}

async function main() {
  console.log("Launching Playwright to diagnose DDC pricing fields...");
  console.log(`Target: ${SEARCH_URL}\n`);

  const browser = await chromium.launch({
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
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // Track items from intercepted responses vs pagination separately
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interceptedItems: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paginatedItems: any[] = [];
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
          interceptedItems.push(...data.inventory);
          if (data.pageInfo?.totalCount) {
            totalCount = data.pageInfo.totalCount;
          }
          console.log(`[Intercepted] Got ${data.inventory.length} items (total intercepted: ${interceptedItems.length}, totalCount: ${totalCount})`);
        }
      } catch (err) {
        console.error("[Intercept error]", (err as Error).message);
      }
    }
  });

  try {
    console.log("Navigating to inventory page...");
    await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for initial API response
    console.log("Waiting for initial inventory data...");
    await page.waitForTimeout(10000);

    console.log(`\nInitial load: ${interceptedItems.length} items intercepted, totalCount=${totalCount}`);

    // Paginate to get remaining items (using page.evaluate like the scraper does)
    if (totalCount > 18 && capturedRequestBody) {
      const apiUrl = `${BASE_URL}/api/widget/ws-inv-data/getInventory`;
      let start = 18; // Match the scraper: it starts at 18 (first page size)
      const pageSize = 18;

      while (start < totalCount) {
        console.log(`Fetching offset ${start}...`);

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
          { apiUrl, requestBody: capturedRequestBody, start, pageSize }
        );

        if (pageData?.inventory?.length > 0) {
          paginatedItems.push(...pageData.inventory);
          console.log(`  +${pageData.inventory.length} items, paginated total: ${paginatedItems.length}`);
        } else {
          console.log("  No more data, stopping pagination.");
          break;
        }

        start += pageSize;
        await page.waitForTimeout(1500);
      }
    }

    // Deduplicate by VIN (like the scraper's vehicleMap does)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allItemsByVin = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interceptedByVin = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paginatedByVin = new Map<string, any>();

    for (const item of interceptedItems) {
      if (item.vin) {
        interceptedByVin.set(item.vin, item);
        allItemsByVin.set(item.vin, item);
      }
    }
    for (const item of paginatedItems) {
      if (item.vin) {
        paginatedByVin.set(item.vin, item);
        allItemsByVin.set(item.vin, item); // paginated overwrites intercepted (same as scraper)
      }
    }

    console.log(`\n${"#".repeat(80)}`);
    console.log(`# RAW COUNTS: ${interceptedItems.length} intercepted, ${paginatedItems.length} paginated`);
    console.log(`# UNIQUE VINs: ${interceptedByVin.size} intercepted, ${paginatedByVin.size} paginated, ${allItemsByVin.size} total`);
    console.log(`# OVERLAP: ${[...interceptedByVin.keys()].filter(v => paginatedByVin.has(v)).length} VINs in both`);
    console.log(`${"#".repeat(80)}`);

    // Check for pricing differences between intercepted and paginated versions of the same VIN
    const overlappingVins = [...interceptedByVin.keys()].filter(v => paginatedByVin.has(v));
    if (overlappingVins.length > 0) {
      console.log(`\n--- PRICING COMPARISON FOR OVERLAPPING VINs (first 5) ---`);
      for (const vin of overlappingVins.slice(0, 5)) {
        const intItem = interceptedByVin.get(vin);
        const pagItem = paginatedByVin.get(vin);
        const intTp = intItem.trackingPricing;
        const pagTp = pagItem.trackingPricing;
        console.log(`  ${vin}:`);
        console.log(`    Intercepted: msrp=${intTp?.msrp}, askingPrice=${intTp?.askingPrice}, internetPrice=${intTp?.internetPrice}`);
        console.log(`    Paginated:   msrp=${pagTp?.msrp}, askingPrice=${pagTp?.askingPrice}, internetPrice=${pagTp?.internetPrice}`);
        if (intItem.pricing) {
          console.log(`    Intercepted pricing.retailPrice: ${intItem.pricing?.retailPrice}`);
        }
        if (pagItem.pricing) {
          console.log(`    Paginated pricing.retailPrice: ${pagItem.pricing?.retailPrice}`);
        }
      }
    }

    // Analyze ALL items (deduped by VIN) — focus on $0 vehicles
    let zeroCount = 0;
    let nonZeroCount = 0;

    for (const [, item] of allItemsByVin) {
      const tp = item.trackingPricing;
      const isFalsy = !tp?.msrp;

      if (isFalsy) {
        zeroCount++;
        analyzeItem(item, zeroCount - 1);
      } else {
        nonZeroCount++;
      }
    }

    console.log(`\n${"#".repeat(80)}`);
    console.log(`# SUMMARY: ${zeroCount} vehicles with falsy trackingPricing.msrp, ${nonZeroCount} with valid msrp`);
    console.log(`${"#".repeat(80)}`);

    // Show one non-$0 for comparison
    const sampleNonZero = [...allItemsByVin.values()].find((item) => item.trackingPricing?.msrp);
    if (sampleNonZero) {
      console.log("\n--- SAMPLE NON-$0 VEHICLE FOR COMPARISON ---");
      analyzeItem(sampleNonZero, -1);
    }

    // Check which known $0 VINs were found and their pricing
    console.log("\n--- KNOWN $0 VIN STATUS ---");
    for (const vin of KNOWN_ZERO_VINS) {
      const item = allItemsByVin.get(vin);
      if (!item) {
        console.log(`  ${vin}: NOT FOUND in inventory`);
        continue;
      }
      const tp = item.trackingPricing;
      const pricing = item.pricing;
      const dprice = pricing?.dprice;
      const retailPrice = pricing?.retailPrice;

      // Check all fallback fields
      const fallbacks = {
        "trackingPricing.msrp": tp?.msrp,
        "trackingPricing.askingPrice": tp?.askingPrice,
        "trackingPricing.internetPrice": tp?.internetPrice,
        "trackingPricing.salePrice": tp?.salePrice,
        "pricing.retailPrice": retailPrice,
        "pricing.dprice[0].value": dprice?.[0]?.value,
      };

      console.log(`  ${vin}: ${item.year} ${item.model} ${item.trim || ""}`);
      for (const [field, val] of Object.entries(fallbacks)) {
        console.log(`    ${field} = ${val !== undefined ? JSON.stringify(val) : "(undefined)"}`);
      }
    }

    // Check for the pattern: does the INTERCEPTED version have pricing but the PAGINATED not (or vice versa)?
    console.log("\n--- KNOWN $0 VINs: INTERCEPTED vs PAGINATED ---");
    for (const vin of KNOWN_ZERO_VINS) {
      const intItem = interceptedByVin.get(vin);
      const pagItem = paginatedByVin.get(vin);
      console.log(`  ${vin}:`);
      if (intItem) {
        const tp = intItem.trackingPricing;
        console.log(`    Intercepted: msrp=${tp?.msrp}, askingPrice=${tp?.askingPrice}, pricing.retailPrice=${intItem.pricing?.retailPrice}`);
      } else {
        console.log(`    Intercepted: NOT FOUND`);
      }
      if (pagItem) {
        const tp = pagItem.trackingPricing;
        console.log(`    Paginated:   msrp=${tp?.msrp}, askingPrice=${tp?.askingPrice}, pricing.retailPrice=${pagItem.pricing?.retailPrice}`);
      } else {
        console.log(`    Paginated:   NOT FOUND`);
      }
    }

  } catch (err) {
    console.error("Fatal error:", (err as Error).message);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

main().catch(console.error);
