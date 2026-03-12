import type { ScrapedVehicle } from "../types";

export interface ScraperConfig {
  name: string;
  city: string;
  baseUrl: string;
  defaultMake: string;
  /** Per-scraper timeout in ms (default: 120000) */
  timeout?: number;
  /** Extra config specific to the scraper module */
  extra?: Record<string, unknown>;
}

export interface ScraperResult {
  source: string;
  vehicles: ScrapedVehicle[];
  duration_ms: number;
  error?: string;
}

export interface ScraperModule {
  name: string;
  scrape(config: ScraperConfig): Promise<ScrapedVehicle[]>;
}
