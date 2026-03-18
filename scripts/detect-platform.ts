#!/usr/bin/env npx tsx
/**
 * Platform Detection Script
 *
 * Detects the website platform of a dealer URL by analyzing network requests
 * and HTML source for known platform signatures.
 *
 * Usage:
 *   npx tsx scripts/detect-platform.ts https://www.stevenscreekbmw.com/new-inventory/index.htm
 *   npx tsx scripts/detect-platform.ts --file data/dealers-to-check.json
 */

import { chromium, type Browser, type Page, type Request } from "playwright";
import { readFileSync } from "fs";

// ── Types ──────────────────────────────────────────────────────────────────

type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

interface DetectionResult {
  url: string;
  name?: string;
  platform: string;
  confidence: Confidence;
  signals: string[];
  searchUrl?: string;
  algoliaConfig?: {
    appId?: string;
    apiKey?: string;
    indexName?: string;
  };
  error?: string;
}

interface DealerEntry {
  name: string;
  url: string;
}

// ── Platform Signatures ────────────────────────────────────────────────────

interface PlatformSignature {
  name: string;
  networkPatterns: RegExp[];
  htmlPatterns: RegExp[];
}

const PLATFORMS: PlatformSignature[] = [
  {
    name: "DDC/DealerOn",
    networkPatterns: [
      /\/api\/widget\/ws-inv-data\/getInventory/i,
      /ddc\.com/i,
      /dealeron\.com/i,
    ],
    htmlPatterns: [
      /ddc\.com/i,
      /dealeron\.com/i,
      /ddc-site-kit/i,
      /ws-inv-data/i,
      /DDC\.dataLayer/i,
    ],
  },
  {
    name: "Algolia",
    networkPatterns: [
      /\.algolia\.net/i,
      /\.algolianet\.com/i,
      /algoliasearch/i,
    ],
    htmlPatterns: [
      /algolia/i,
      /ALGOLIA_APP_ID/i,
      /algoliasearch/i,
    ],
  },
  {
    name: "CDK Global",
    networkPatterns: [
      /cobalt\.com/i,
      /cdk\.com/i,
      /cdkglobal/i,
    ],
    htmlPatterns: [
      /cobalt\.com/i,
      /cdk\.com/i,
      /cdkglobal/i,
      /cobalt-templatex/i,
    ],
  },
  {
    name: "DealerInspire",
    networkPatterns: [
      /dealerinspire\.com/i,
    ],
    htmlPatterns: [
      /dealerinspire\.com/i,
      /class="di-/i,
      /dealer-inspire/i,
    ],
  },
  {
    name: "Dealer.com (Cox Automotive)",
    networkPatterns: [
      /dealer\.com/i,
      /dealertrack/i,
    ],
    htmlPatterns: [
      /dealer\.com/i,
      /dealertrack/i,
      /dealerdotcom/i,
    ],
  },
];

// ── Detection Logic ────────────────────────────────────────────────────────

const PAGE_TIMEOUT = 15_000;
const NETWORK_WAIT = 10_000;

async function detectPlatform(
  browser: Browser,
  url: string,
  name?: string
): Promise<DetectionResult> {
  const result: DetectionResult = {
    url,
    name,
    platform: "Unknown",
    confidence: "NONE",
    signals: [],
  };

  let context;
  let page: Page | undefined;

  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
    });

    page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Track network requests per platform
    const networkHits = new Map<string, string[]>();
    // Track Algolia-specific config extraction
    let algoliaAppId: string | undefined;
    let algoliaApiKey: string | undefined;
    let algoliaIndexName: string | undefined;

    page.on("request", (req: Request) => {
      const reqUrl = req.url();

      for (const platform of PLATFORMS) {
        for (const pattern of platform.networkPatterns) {
          if (pattern.test(reqUrl)) {
            const hits = networkHits.get(platform.name) || [];
            const signal = `"${pattern.source}" matched in network request: ${truncate(reqUrl, 100)}`;
            if (!hits.includes(signal)) {
              hits.push(signal);
              networkHits.set(platform.name, hits);
            }
          }
        }
      }

      // Extract Algolia config from request URLs and headers
      if (/\.algolia\.net|\.algolianet\.com/i.test(reqUrl)) {
        const urlObj = new URL(reqUrl);
        const appIdMatch = reqUrl.match(/https:\/\/([a-z0-9]+)-(?:dsn\.)?algolia(?:net\.com|\.net)/i);
        if (appIdMatch) {
          algoliaAppId = appIdMatch[1];
        }
        const apiKeyParam = urlObj.searchParams.get("x-algolia-api-key");
        if (apiKeyParam) {
          algoliaApiKey = apiKeyParam;
        }
        const appIdParam = urlObj.searchParams.get("x-algolia-application-id");
        if (appIdParam) {
          algoliaAppId = appIdParam;
        }
      }

      // Extract Algolia config from POST body
      if (/algolia/i.test(reqUrl) && req.method() === "POST") {
        try {
          const postData = req.postData();
          if (postData) {
            const indexMatch = postData.match(/"indexName"\s*:\s*"([^"]+)"/);
            if (indexMatch) {
              algoliaIndexName = indexMatch[1];
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    });

    // Navigate to the URL
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });

    // Wait for network activity to settle
    await page.waitForTimeout(NETWORK_WAIT);

    // Get the page HTML source
    const html = await page.content();

    // Check HTML for platform signatures
    const htmlHits = new Map<string, string[]>();
    for (const platform of PLATFORMS) {
      for (const pattern of platform.htmlPatterns) {
        if (pattern.test(html)) {
          const hits = htmlHits.get(platform.name) || [];
          const signal = `"${pattern.source}" found in HTML source`;
          if (!hits.includes(signal)) {
            hits.push(signal);
            htmlHits.set(platform.name, hits);
          }
        }
      }
    }

    // Also try to extract Algolia config from HTML/script tags
    if (!algoliaAppId) {
      const appIdHtmlMatch = html.match(/ALGOLIA_APP_ID['":\s]+['"]([a-zA-Z0-9]+)['"]/);
      if (appIdHtmlMatch) {
        algoliaAppId = appIdHtmlMatch[1];
      }
    }
    if (!algoliaApiKey) {
      const apiKeyHtmlMatch = html.match(/ALGOLIA_(?:SEARCH_)?API_KEY['":\s]+['"]([a-zA-Z0-9]+)['"]/);
      if (apiKeyHtmlMatch) {
        algoliaApiKey = apiKeyHtmlMatch[1];
      }
    }

    // Score each platform
    let bestPlatform = "Unknown";
    let bestScore = 0;
    const allSignals: string[] = [];

    for (const platform of PLATFORMS) {
      const nHits = networkHits.get(platform.name) || [];
      const hHits = htmlHits.get(platform.name) || [];
      // Network hits are weighted more heavily (2 points each vs 1 for HTML)
      const score = nHits.length * 2 + hHits.length;

      if (score > bestScore) {
        bestScore = score;
        bestPlatform = platform.name;
        allSignals.length = 0;
        allSignals.push(...nHits, ...hHits);
      }
    }

    result.platform = bestPlatform;
    result.signals = allSignals;

    // Determine confidence
    const hasNetwork = (networkHits.get(bestPlatform) || []).length > 0;
    const hasHtml = (htmlHits.get(bestPlatform) || []).length > 0;

    if (bestScore === 0) {
      result.confidence = "NONE";
    } else if (hasNetwork && hasHtml) {
      result.confidence = "HIGH";
    } else if (hasNetwork || bestScore >= 2) {
      result.confidence = "MEDIUM";
    } else {
      result.confidence = "LOW";
    }

    // Extract search URL for DDC
    if (bestPlatform === "DDC/DealerOn") {
      const parsedUrl = new URL(url);
      result.searchUrl = parsedUrl.pathname;
    }

    // Attach Algolia config if detected
    if (bestPlatform === "Algolia" && (algoliaAppId || algoliaApiKey || algoliaIndexName)) {
      result.algoliaConfig = {
        appId: algoliaAppId,
        apiKey: algoliaApiKey,
        indexName: algoliaIndexName,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg.split("\n")[0];
    result.platform = "Error";
    result.confidence = "NONE";
    result.signals = [`Error: ${result.error}`];
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

function formatResult(r: DetectionResult): string {
  const lines: string[] = [];
  lines.push(`\nAnalyzing: ${r.url}`);
  if (r.name) lines.push(`Dealer: ${r.name}`);
  lines.push(`Platform: ${r.platform}`);
  lines.push(`Confidence: ${r.confidence}`);
  lines.push(`Signals: [${r.signals.map((s) => `"${s}"`).join(", ")}]`);
  if (r.searchUrl) lines.push(`Search URL: ${r.searchUrl}`);
  if (r.algoliaConfig) {
    lines.push(`Algolia Config:`);
    if (r.algoliaConfig.appId) lines.push(`  App ID: ${r.algoliaConfig.appId}`);
    if (r.algoliaConfig.apiKey) lines.push(`  API Key: ${r.algoliaConfig.apiKey}`);
    if (r.algoliaConfig.indexName) lines.push(`  Index Name: ${r.algoliaConfig.indexName}`);
  }
  if (r.error) lines.push(`Error: ${r.error}`);
  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  npx tsx scripts/detect-platform.ts <url>");
    console.log("  npx tsx scripts/detect-platform.ts --file <path-to-json>");
    console.log("");
    console.log("JSON file format: [{ \"name\": \"Dealer Name\", \"url\": \"https://...\" }]");
    process.exit(1);
  }

  let dealers: DealerEntry[];

  if (args[0] === "--file") {
    if (!args[1]) {
      console.error("Error: --file requires a path argument");
      process.exit(1);
    }
    try {
      const raw = readFileSync(args[1], "utf-8");
      dealers = JSON.parse(raw) as DealerEntry[];
      if (!Array.isArray(dealers)) {
        console.error("Error: JSON file must contain an array of { name, url } objects");
        process.exit(1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error reading file ${args[1]}: ${msg}`);
      process.exit(1);
    }
  } else {
    // Single URL mode
    dealers = [{ name: "", url: args[0] }];
  }

  console.log(`Detecting platform for ${dealers.length} URL(s)...\n`);

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

    const results: DetectionResult[] = [];

    for (const dealer of dealers) {
      const result = await detectPlatform(browser, dealer.url, dealer.name || undefined);
      results.push(result);
      console.log(formatResult(result));
    }

    // Print summary for multi-URL runs
    if (results.length > 1) {
      console.log("\n" + "=".repeat(60));
      console.log("SUMMARY");
      console.log("=".repeat(60));

      const platformCounts: Record<string, number> = {};
      for (const r of results) {
        platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1;
      }

      for (const platform of Object.keys(platformCounts)) {
        console.log(`  ${platform}: ${platformCounts[platform]}`);
      }
      console.log(`  Total: ${results.length}`);
    }
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
