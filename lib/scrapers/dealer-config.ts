import fs from "fs";
import path from "path";

interface DealerJsonEntry {
  name: string;
  city: string;
  make: string;
  website: string;
  platform: string;
  status: string;
  searchPath?: string;
  timeout?: number;
  indexName?: string;
  notes?: string;
}

export interface DDCDealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  searchUrl: string;
  defaultMake: string;
  timeout: number;
}

export interface AlgoliaDealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  defaultMake: string;
  appId: string;
  apiKey: string;
  indexName: string;
}

function loadDealersJson(): DealerJsonEntry[] {
  const jsonPath = path.resolve(process.cwd(), "data/dealers.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(raw) as DealerJsonEntry[];
}

export function loadDDCDealers(): DDCDealerConfig[] {
  const dealers = loadDealersJson();
  return dealers
    .filter(
      (d) =>
        d.status === "active" &&
        (d.platform === "ddc" || d.platform === "ddc-cosmos")
    )
    .map((d) => ({
      name: d.name,
      city: d.city,
      baseUrl: d.website,
      searchUrl: `${d.website}${d.searchPath || "/new-inventory/index.htm"}`,
      defaultMake: d.make,
      timeout: d.timeout || 30000,
    }));
}

export function loadAlgoliaDealers(): AlgoliaDealerConfig[] {
  const dealers = loadDealersJson();
  const appId = process.env.ALGOLIA_APP_ID || "";
  const apiKey = process.env.ALGOLIA_API_KEY || "";

  return dealers
    .filter((d) => d.status === "active" && d.platform === "algolia")
    .map((d) => ({
      name: d.name,
      city: d.city,
      baseUrl: d.website,
      defaultMake: d.make,
      appId,
      apiKey,
      indexName: d.indexName || "",
    }))
    .filter((d) => d.indexName !== "");
}
