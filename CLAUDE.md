# Bay Area Car Tracker — CLAUDE.md

## Project Overview
Full-stack Next.js app that scrapes BMW inventory (expanding to multi-make) from Bay Area dealerships, stores in SQLite, computes quality scores, tracks price history, and presents a dark-themed dashboard with filtering, sorting, comparison, and dealer intelligence.

**Repo:** https://github.com/danielssherman/car-search
**Local path:** ~/bay-area-bmw-tracker/
**Owner:** Daniel Sherman (danielssherman)

---

## Architecture

```
app/                    Next.js 14 App Router (dark BMW theme)
├── page.tsx            Main inventory dashboard
├── layout.tsx          Root layout — "Bay Area Car Tracker"
├── api/
│   ├── inventory/      GET with filters (make, model, dealer, color, condition, price range, sort)
│   │   └── [vin]/      GET single vehicle + all listings
│   ├── stats/          Aggregate market stats
│   ├── dealers/        Dealer list with vehicle counts
│   └── scrape/         POST to trigger manual scrape (API key protected)
components/
├── FilterBar.tsx       Filters persist in URL params
├── InventoryTable.tsx  Sortable columns, desktop view
├── VehicleCard.tsx     Mobile card layout with quality score badge
├── ComparePanel.tsx    Side-by-side comparison (up to 3 vehicles, delta highlighting)
├── StatsPanel.tsx      Market overview stats
lib/
├── types.ts            Vehicle, Listing, PriceHistory, ScrapedVehicle, Stats interfaces
├── db.ts               SQLite via better-sqlite3 — vehicles + listings + price_history + scrape_log tables
├── scoring.ts          Quality score algorithm (0-100) — price vs market avg, days on lot, condition, mileage, packages
├── cron.ts             node-cron every 4 hours → runAllScrapers() → updateQualityScores()
├── scraper.ts          Thin backward-compat wrapper importing from lib/scrapers/
├── scrapers/
│   ├── index.ts        Registry + runAllScrapers() orchestrator (Promise.allSettled, per-source timeout/retry)
│   ├── types.ts        ScraperModule, ScraperConfig, ScraperResult interfaces
│   ├── ddc.ts          Playwright-based DDC/DealerOn scraper (intercepts getInventory API)
│   ├── algolia.ts      Direct Algolia API fetch (no browser needed)
│   ├── carscom.ts      Cars.com Playwright scraper (disabled in CI — hard-blocked by Cloudflare)
│   └── cargurus.ts     CarGurus Playwright scraper (disabled — DataDome CAPTCHA blocks in CI)
mcp-server/
├── index.ts            MCP server with 6 tools (search_inventory, get_vehicle, get_market_stats, get_dealers, trigger_scrape, get_scrape_health)
├── package.json        Separate deps (@modelcontextprotocol/sdk, better-sqlite3)
├── tsconfig.json
scripts/
├── run-scrape.ts       Manual one-off scrape
├── ci-scrape.ts        CI entry point — calls runScrape() + WAL checkpoint for R2 upload
├── sync-db.sh          Download latest DB from Cloudflare R2 to local
├── seed-sample.ts      Generate sample data for dev/demo
.github/workflows/
├── scrape.yml          Cron scraper: every 6h, Playwright in CI, SQLite persisted to Cloudflare R2
data/
└── inventory.db        SQLite database (gitignored, persisted to Cloudflare R2)
```

---

## Data Model (Phase 2 — current)

**vehicles** — One row per VIN. Canonical vehicle identity (year, make, model, trim, colors, packages, condition, mileage, quality_score)

**listings** — One row per VIN + source + dealer. Tracks where the vehicle is listed and at what price. UNIQUE constraint on (vin, source, dealer_name). Supports cross-dealer arbitrage detection.

**price_history** — Appended on price changes or new listings. Enables price trend analysis and negotiation room estimation.

**scrape_log** — Per-scrape metadata with source field, timing, vehicle counts, error tracking.

The `getVehicles()` query JOINs vehicles with cheapest active listing per VIN and includes listing_count. Default sort is `quality_score DESC LIMIT 100`.

---

## Active Dealers (17 working)

| Dealer | City | Make | Platform | Scraper |
|--------|------|------|----------|---------|
| Stevens Creek BMW | San Jose | BMW | DDC Classic | ddc.ts |
| BMW of Mountain View | Mountain View | BMW | DDC Classic | ddc.ts |
| BMW of Fremont | Fremont | BMW | DDC Classic | ddc.ts |
| BMW of San Rafael | San Rafael | BMW | DDC Classic | ddc.ts |
| Peter Pan BMW | San Mateo | BMW | Algolia | algolia.ts |
| BMW of San Francisco | San Francisco | BMW | Algolia | algolia.ts |
| Mercedes-Benz of Stevens Creek | San Jose | Mercedes-Benz | DDC Classic | ddc.ts |
| Mercedes-Benz of Marin | San Rafael | Mercedes-Benz | DDC Cosmos | ddc.ts |
| Porsche San Francisco | San Francisco | Porsche | DDC Cosmos | ddc.ts |
| Porsche Marin | Mill Valley | Porsche | DDC Cosmos | ddc.ts |
| Lexus Stevens Creek | San Jose | Lexus | DDC Cosmos | ddc.ts |
| Lexus of Fremont | Fremont | Lexus | DDC Cosmos | ddc.ts |
| Land Rover Marin | Corte Madera | Land Rover | DDC Classic | ddc.ts |
| Jaguar Marin | Corte Madera | Jaguar | DDC Classic | ddc.ts |
| MINI of Stevens Creek | Santa Clara | MINI | DDC Classic | ddc.ts |
| Volvo Cars Walnut Creek | Walnut Creek | Volvo | DDC Classic | ddc.ts |
| Putnam Cadillac | Burlingame | Cadillac | DDC Classic | ddc.ts |

**Not working:** East Bay BMW (Pleasanton) — Akamai bot manager blocks all automated access.

**DDC API variants:** The scraper auto-detects Classic (`getInventory`) vs Cosmos (`vhcliaa/vehicle-pages/cosmos`) API. Cosmos uses `pt=` for page number, `pn=` for page size.

---

## Quality Score Algorithm (lib/scoring.ts)

| Factor | Points | Logic |
|--------|--------|-------|
| Price vs market avg (same make/model/year) | 35 | Below average = higher score |
| Days on lot | 20 | Longer = higher (dealer more likely to negotiate) |
| Condition | 15 | New > CPO > Used |
| Mileage | 10 | Lower = higher |
| In-stock status | 10 | In Stock > In Transit |
| Packages/features | 10 | More = higher |

Recalculated after every scrape via `updateQualityScores()`.

---

## MCP Server (mcp-server/)

10 tools registered via @modelcontextprotocol/sdk:

| Tool | Description |
|------|-------------|
| search_inventory | Full filter support — make, model, dealer, color, condition, status, price range, sort, search |
| get_vehicle | Full details by VIN with parsed packages |
| get_market_stats | Aggregate counts, avg/min/max price, makes, models, colors |
| get_dealers | Dealer list with vehicle counts |
| trigger_scrape | On-demand scrape with error handling |
| get_scrape_health | Last 10 scrapes, active/removed counts, timing |

**To register** in ~/.claude.json:
```json
{
  "mcpServers": {
    "car-tracker": {
      "command": "npx",
      "args": ["tsx", "/Users/dsherman/bay-area-bmw-tracker/mcp-server/index.ts"],
      "env": {
        "DATABASE_PATH": "/Users/dsherman/bay-area-bmw-tracker/data/inventory.db"
      }
    }
  }
}
```

---

## Coding Conventions

- **TypeScript strict** — all files, no `any` unless wrapping external API responses
- **Dark theme UI** — BMW-inspired dark palette, all components follow existing color tokens
- **Filters persist in URL** — shareable links with full filter state
- **openpyxl** not used here (Python project convention) — this is pure TS/Next.js
- **SQLite migrations** — handled in `migrateSchema()` in db.ts. New columns use ALTER TABLE with try/catch for idempotency
- **Scraper pattern** — each scraper module exports: `name`, `type`, `config`, `scrape()` returning `ScraperResult`. Orchestrator uses `Promise.allSettled` with per-source timeout (2min) and 3 retries with exponential backoff
- **Build note** — SQLITE_ERROR during `next build` static generation is expected and harmless. API routes try to open DB during prerendering; works fine at runtime.

---

## Session Protocol

### On session start:
1. Read this file
2. Read PROJECT_MEMORY.md and PRODUCT_PLAN.md from OneDrive if referenced: `~/OneDrive - West Monroe/Personal/Bay Area Car Tracker/`
3. Check `git status` and `git log --oneline -5` for current state
4. Check DB state: `SELECT COUNT(*) FROM vehicles; SELECT COUNT(*) FROM listings; SELECT MAX(created_at) FROM scrape_log;`

### On session end:
1. `git add -A && git commit` with descriptive message
2. `git push origin main`
3. Update the "Current State" section below with what changed

### Commit style:
Short imperative subject line. Group related changes (e.g., "Add Cars.com scraper with worker pattern and per-source health reporting"). No need for conventional commits prefix.

---

## Product Roadmap (7 phases)

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Core Tracker | COMPLETE | SQLite, DDC+Algolia scrapers, dashboard, quality scores, comparison |
| 2. Multi-Source Pipeline | COMPLETE | Listings model split, scraper worker pattern, Cars.com + CarGurus scrapers (built but blocked by bot protection in CI), GitHub Actions cron every 6h with R2 persistence |
| 3. Dealer Intelligence | NOT STARTED | Price trend analysis, negotiation room estimator, dealer scoring. Requires 2-3 months of price_history data (accumulating since 2026-03-12) |
| 4. Scale to 400+ Dealers | IN PROGRESS | Multi-make expansion started (7 makes, 12 dealers). Remaining: platform auto-detection agent, dealer config in DB, batch onboarding |
| 5. Infrastructure | PARTIALLY STARTED | GitHub Actions cron + R2 done. Remaining: BullMQ job queue, Redis caching, rate limiting, Turso migration |
| 6. Smart Alerts | NOT STARTED | Price drop notifications, new inventory alerts |
| 7. Public Product | NOT STARTED | Auth, hosted DB, embedded chat (optional) |

**Critical path insight:** Phase 3 depends on accumulated price history. Automated scraping has been running every 6h since 2026-03-12 via GitHub Actions.

---

## Known Issues & Debt

- ~~No automated test suite~~ — DONE (Session 28). 155 tests via vitest: scoring (47), DDC parser (60), Algolia parser (48). CI workflow at `.github/workflows/test.yml`.
- MCP server registered in `~/.claude.json` (project: `/Users/dsherman`) and `.mcp.json` (project root). Validated and working.
- The 3-branch parallel instance experiment (Session 19) didn't work as designed — instances all committed to working directory instead of separate branches. Avoid this pattern; use sequential sessions instead.
- ~~**N+1 query in `getVehicles()`**~~ — FIXED (Session 30). Replaced correlated subqueries with CTEs using ROW_NUMBER()/LAG() window functions. Added composite indexes.
- ~~**`markMissingAsRemoved` data integrity bug**~~ — FIXED (Session 31). Now only removes listings for dealers that were actually scraped. Prevents false removal when a dealer times out.
- ~~**Price/MSRP conflation**~~ — FIXED (Session 32). Scrapers now separate `msrp` (true MSRP) from `asking_price` (dealer asking price). `upsertVehicles` uses `asking_price` for listings.price and `msrp` for listings.msrp.
- ~~**`first_seen` stale on re-listing**~~ — FIXED (Session 32). `upsertVehicle` ON CONFLICT now resets `first_seen` and sets `re_listed_at` when a previously-removed vehicle reappears.
- ~~**Cosmos `packages` inflated**~~ — FIXED (Session 32). `parseCosmosInventory` now filters `vc.Features` to only include items matching /package|edition|kit|option/i, normalizing quality scores vs Classic DDC.
- **No tests for `parseCosmosInventory`** — exported function but no unit tests. Tech debt from Session 31.

---

## Open Items / Backlog

_Revisit these as the project evolves. Not blocking current work._

### Scraper Coverage
- ~~**Expand beyond BMW**~~ — DONE (Session 29). 7 makes, 12 dealers. Architecture was already multi-make ready; only config changes needed.
- **Lexus Stevens Creek** — DDC confirmed but scrape returned 0 vehicles. Search URL path may differ from `/new-inventory/index.htm`. Needs manual investigation.
- **More Bay Area dealers** — Audi, Porsche, Mercedes SF not yet added. Many dealer sites block automated WebFetch (403/SSL errors). Need manual Chrome DevTools inspection to find URLs and confirm platform.
- **Cars.com** — scraper built (`lib/scrapers/carscom.ts`) but Cars.com hard-blocks GitHub Actions IPs (90s timeout, not a solvable Cloudflare challenge). Works locally. Options: residential proxy ($5-15/mo), self-hosted runner, or accept limitation.
- **CarGurus** — scraper built (`lib/scrapers/cargurus.ts`) but DataDome CAPTCHA blocks headless browsers in CI (returns 403 + captcha-delivery.com). Disabled in registry. Would need `playwright-extra` stealth plugin or residential proxy.
- **East Bay BMW** (Pleasanton) — Akamai bot manager blocks all automated access. Would need stealth plugin or residential proxy.

### Infrastructure
- **GitHub Actions Node.js 20 deprecation** — actions/checkout@v4, actions/setup-node@v4, actions/upload-artifact@v4 will be forced to Node.js 24 starting June 2, 2026. Update action versions before then.
- **Turso migration** — consider migrating from SQLite-on-R2 to Turso (hosted libSQL) for Phase 5. Would require async rewrite of db.ts but gives edge replicas and proper hosted DB.
- **Self-hosted runner** — would unblock Cars.com + CarGurus scrapers and reduce CI costs. Could run on a cheap VPS or home machine.

### Product
- ~~**Test coverage**~~ — DONE (Session 28, expanded Session 30). 228 tests: scoring (47), DDC parser (60), Algolia parser (48), db queries (38), validation (35). CI workflow running.
- ~~**Register MCP server**~~ — DONE. Registered and validated.
- ~~**Vehicle detail panel**~~ — DONE (Session 29). Click row → slide-over panel with specs, packages, all listings.
- ~~**Pagination**~~ — DONE (Session 29). 50 per page, prev/next, `countVehicles()` + `buildFilterConditions()` helper.
- ~~**Price history visualization**~~ — DONE (Session 33). SVG step-line chart in detail panel, PriceTrendBadge in table/cards, PriceHistorySection with empty state handling. PRICE_TRENDS_CTE computes trend via LAG() window function.
- **Smart alerts** — Phase 6: price drop notifications, new inventory alerts.

### Data Quality
- ~~**$0 price bug**~~ — FIXED (Session 28). DDC API intermittently returns empty pricing. Parser now checks 6 price fields. Upsert guards against $0 overwrites. 15 listings backfilled.
- **1 remaining $0 vehicle** — `3MW23CM06R8E69881` (2024 230i at Stevens Creek) never had a valid price. Will resolve on next scrape with improved parser.
- ~~**SCRAPE_API_KEY is weak**~~ — FIXED (Session 30). Rotated to random 64-char hex. Startup guard rejects old default values.
- **Algolia API key in git history** — should be rotated with provider.

---

## Current State

_Last updated: 2026-03-19 (Session 33)_

- **Branch:** main
- **Automated scraping:** GitHub Actions cron every 6h, SQLite DB persisted to Cloudflare R2. Working scrapers: DDC Classic (10 dealers), DDC Cosmos (5 dealers), Algolia (2 dealers). DDC parallelized at concurrency 3. ~4,800+ vehicles per run.
- **Multi-make expansion:** 10 makes across 17 dealers (BMW, Mercedes-Benz, Porsche, Lexus, Land Rover, Jaguar, MINI, Volvo, Cadillac). Price history accumulating since 2026-03-17.
- **DB:** ~4,800+ vehicles across 17 dealers, 10 makes. Local DB syncs from R2 via `./scripts/sync-db.sh`. Queries use CTEs with ROW_NUMBER()/LAG() window functions. Composite indexes on listings and price_history. `markMissingAsRemoved` scoped to successfully-scraped dealers only.
- **API hardening:** Zod input validation on all routes. New endpoints: `/api/price-history/[vin]`, `/api/scrape-health`. SCRAPE_API_KEY rotated with startup guard. Price history dedup in upsertVehicles().
- **Dealer research:** 37 Bay Area dealers cataloged in `data/dealers.json` with platform detection results. Platform detection script at `scripts/detect-platform.ts`.
- **Tests:** 242 tests via vitest (scoring: 47, DDC parser: 60, Algolia parser: 48, db queries: 44, validation: 37, dealer-config: 6). CI workflow `.github/workflows/test.yml` runs on push/PR.
- **MCP server:** Registered and validated. 10 tools working.
- **Dealer config:** Scrapers now read from `data/dealers.json` instead of hardcoded arrays. New dealer = JSON edit, zero code changes. Loader in `lib/scrapers/dealer-config.ts`.
- **Price semantics:** `ScrapedVehicle` now has separate `msrp` and `asking_price` fields. Listings store both correctly. Quality scores use asking price for market comparison.
- **Re-listing fix:** `upsertVehicle` resets `first_seen` and sets `re_listed_at` when a removed vehicle reappears, preventing inflated days-on-lot scores.
- **Cosmos packages:** Filtered to only package-like items (matching /package|edition|kit|option/i), fixing score inflation.
- **AI search:** System prompt now uses live stats from DB (dealer count, makes, models, price ranges) instead of hardcoded values.
- **Observability:** All silent catch blocks in scrapers and scoring now log via `console.warn()` with structured prefixes.
- **Frontend:** AbortController on all fetches prevents stale-response bugs. Cache headers on `/api/stats` and `/api/dealers`.
- **Price history UI:** Hand-built SVG step-line chart in detail panel (no charting library). PriceTrendBadge (emerald down / red up) in inventory table and mobile cards. PriceHistorySection with chart or "Price stable since..." empty state. PRICE_TRENDS_CTE via LAG() window function in getVehicles(). Enhanced `/api/price-history/[vin]` with summary object. Client-side dedup for legacy duplicates.
- **DB corruption fix:** R2 database was corrupted (March 17-19). Recovered by merging March 16 backup with recovered vehicles/price_history, then re-scraped. Repaired DB uploaded to R2.
- **Known schema issue:** `scrape_log` uses `started_at`/`completed_at`, not `created_at` — session protocol DB check query needs updating.
- **Known performance:** `PRICE_TRENDS_CTE` adds ~330ms to `getVehicles()` by scanning all price_history. Consider materializing as a column if this becomes a bottleneck.

### Next Sessions (planned)

1. ~~**Session 28: Vehicle detail panel + pagination**~~ — DONE.
2. ~~**Session 29: Database performance**~~ — DONE (Session 30). CTE rewrites, composite indexes, stats consolidation, price history dedup.
3. ~~**Session 30: API hardening**~~ — DONE. Zod validation, SCRAPE_API_KEY rotation, new endpoints.
4. ~~**Session 31: Dealer expansion (infrastructure + wave 1)**~~ — DONE. Fixed markMissingAsRemoved, parallelized DDC, added Cosmos API support, onboarded 5 dealers (Porsche x2, Lexus x2, MB Marin), fixed Lexus Stevens Creek. Platform detection script + dealer research (37 dealers cataloged).
5. ~~**Session 32: Data quality + efficiency improvements**~~ — DONE. Externalized dealer config to JSON, separated MSRP from asking price, fixed re-listing first_seen reset, fixed Cosmos packages inflation, added scraper logging, live AI search context, AbortController on fetches, cache headers, 242 tests.
6. ~~**Session 33: Price history UI**~~ — DONE. SVG step-line chart in detail panel, PriceTrendBadge in table/cards, enhanced price-history API with summary. Also fixed R2 DB corruption.
7. **Session 34: Comparison redesign + MCP enrichment** — Full-screen comparison overlay, packages visibility.
8. **Session 35: Scrape health dashboard** — Visual timeline of scrape runs, per-dealer success rates.
