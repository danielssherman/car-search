import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadDDCDealers, loadAlgoliaDealers } from "@/lib/scrapers/dealer-config";

describe("loadDDCDealers", () => {
  it("returns only active DDC and DDC-Cosmos dealers", () => {
    const dealers = loadDDCDealers();
    expect(dealers.length).toBeGreaterThan(0);
    // Should not include blocked, unsupported, or algolia dealers
    for (const d of dealers) {
      expect(d.name).toBeTruthy();
      expect(d.baseUrl).toMatch(/^https?:\/\//);
      expect(d.searchUrl).toMatch(/^https?:\/\//);
      expect(d.defaultMake).toBeTruthy();
      expect(d.timeout).toBeGreaterThan(0);
    }
  });

  it("constructs searchUrl from website + searchPath", () => {
    const dealers = loadDDCDealers();
    for (const d of dealers) {
      expect(d.searchUrl).toContain(d.baseUrl);
    }
  });

  it("does not include non-active dealers", () => {
    const dealers = loadDDCDealers();
    const names = dealers.map((d) => d.name);
    // East Bay BMW is status: "blocked" in dealers.json
    expect(names).not.toContain("East Bay BMW");
    // Audi San Jose is status: "unsupported"
    expect(names).not.toContain("Audi San Jose");
  });

  it("does not include Algolia dealers", () => {
    const dealers = loadDDCDealers();
    const names = dealers.map((d) => d.name);
    expect(names).not.toContain("Peter Pan BMW");
    expect(names).not.toContain("BMW of San Francisco");
  });
});

describe("loadAlgoliaDealers", () => {
  const originalAppId = process.env.ALGOLIA_APP_ID;
  const originalApiKey = process.env.ALGOLIA_API_KEY;

  beforeEach(() => {
    process.env.ALGOLIA_APP_ID = "test-app-id";
    process.env.ALGOLIA_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.ALGOLIA_APP_ID = originalAppId;
    process.env.ALGOLIA_API_KEY = originalApiKey;
  });

  it("returns only active Algolia dealers with indexName", () => {
    const dealers = loadAlgoliaDealers();
    expect(dealers.length).toBeGreaterThan(0);
    for (const d of dealers) {
      expect(d.indexName).toBeTruthy();
      expect(d.appId).toBe("test-app-id");
      expect(d.apiKey).toBe("test-api-key");
      expect(d.baseUrl).toMatch(/^https?:\/\//);
    }
  });

  it("does not include DDC dealers", () => {
    const dealers = loadAlgoliaDealers();
    const names = dealers.map((d) => d.name);
    expect(names).not.toContain("Stevens Creek BMW");
  });
});
