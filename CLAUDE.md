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

## Active Dealers (5 working)

| Dealer | Platform | Scraper |
|--------|----------|---------|
| Stevens Creek BMW (San Jose) | DDC/DealerOn | ddc.ts (Playwright + API intercept + pagination) |
| BMW of Fremont | DDC/DealerOn | ddc.ts |
| BMW of San Rafael (fka Marin BMW) | DDC/DealerOn | ddc.ts |
| Peter Pan BMW (San Mateo) | Algolia | algolia.ts (direct API, no browser) |
| BMW of San Francisco | DealerInspire/Algolia | algolia.ts |

**Not working:** East Bay BMW (Pleasanton) — Akamai bot manager blocks all automated access. Would need stealth plugin or residential proxy.

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

6 tools registered via @modelcontextprotocol/sdk:

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
| 4. Scale to 400+ Dealers | NOT STARTED | Platform auto-detection agent, dealer config in DB, batch onboarding |
| 5. Infrastructure | PARTIALLY STARTED | GitHub Actions cron + R2 done. Remaining: BullMQ job queue, Redis caching, rate limiting, Turso migration |
| 6. Smart Alerts | NOT STARTED | Price drop notifications, new inventory alerts |
| 7. Public Product | NOT STARTED | Auth, hosted DB, embedded chat (optional) |

**Critical path insight:** Phase 3 depends on accumulated price history. Automated scraping has been running every 6h since 2026-03-12 via GitHub Actions.

---

## Known Issues & Debt

- No automated test suite — scoring.ts, db.ts migrations, and scraper response parsers are all untested
- MCP server registered in `~/.claude.json` (project: `/Users/dsherman`) and `.mcp.json` (project root)
- The 3-branch parallel instance experiment (Session 19) didn't work as designed — instances all committed to working directory instead of separate branches. Avoid this pattern; use sequential sessions instead.

---

## Open Items / Backlog

_Revisit these as the project evolves. Not blocking current work._

### Scraper Coverage
- **Cars.com** — scraper built (`lib/scrapers/carscom.ts`) but Cars.com hard-blocks GitHub Actions IPs (90s timeout, not a solvable Cloudflare challenge). Works locally. Options: residential proxy ($5-15/mo), self-hosted runner, or accept limitation.
- **CarGurus** — scraper built (`lib/scrapers/cargurus.ts`) but DataDome CAPTCHA blocks headless browsers in CI (returns 403 + captcha-delivery.com). Disabled in registry. Would need `playwright-extra` stealth plugin or residential proxy.
- **East Bay BMW** (Pleasanton) — Akamai bot manager blocks all automated access. Would need stealth plugin or residential proxy.
- **Expand beyond BMW** — scrapers are BMW-focused; multi-make support is architecturally ready (make field exists) but no non-BMW dealers configured.

### Infrastructure
- **GitHub Actions Node.js 20 deprecation** — actions/checkout@v4, actions/setup-node@v4, actions/upload-artifact@v4 will be forced to Node.js 24 starting June 2, 2026. Update action versions before then.
- **Turso migration** — consider migrating from SQLite-on-R2 to Turso (hosted libSQL) for Phase 5. Would require async rewrite of db.ts but gives edge replicas and proper hosted DB.
- **Self-hosted runner** — would unblock Cars.com + CarGurus scrapers and reduce CI costs. Could run on a cheap VPS or home machine.

### Product
- **Test coverage** — scoring.ts, db.ts migrations, scraper response parsers all untested.
- ~~**Register MCP server**~~ — DONE. Registered in `~/.claude.json` and `.mcp.json`.
- **Price history visualization** — Phase 3 dealer intelligence depends on accumulated price_history data. Automated scraping is now running (every 6h via GH Actions) so data is accumulating.
- **Smart alerts** — Phase 6: price drop notifications, new inventory alerts.

---

## Current State

_Last updated: 2026-03-16 (Session 27)_

- **Branch:** main
- **Automated scraping:** GitHub Actions cron every 6h, SQLite DB persisted to Cloudflare R2. Working scrapers: DDC (3 dealers), Algolia (2 dealers). ~1,800 vehicles per run. 44 scrapes completed since 2026-03-12.
- **DB:** 1,863 vehicles, 2,005 listings across 5 dealers. 1,859 price history records. Active dealers: Stevens Creek (663), Peter Pan (322), Fremont (305), San Rafael (275), SF (215).
- **MCP server:** Registered in `~/.claude.json` and `.mcp.json`. 6 tools available after Claude Code restart.
- **Known schema issue:** `scrape_log` uses `started_at`/`completed_at`, not `created_at` — session protocol DB check query needs updating.

### Next 3 Outcomes (prioritized)

1. **Test coverage for core logic (~1 session)** — Set up vitest, write tests for `scoring.ts` (pure functions), `db.ts` migrations (fixture DB), and scraper response parsers (mock fixtures). Wire `npm test` into GitHub Actions CI.

2. **Price history dashboard & early Phase 3 (~1-2 sessions)** — Price change badges in inventory table, sparkline component per vehicle, negotiation room estimator (days on lot × market delta), vehicle detail panel with price history. Infrastructure can be built now; full value comes as price history accumulates over weeks.

3. **Validate MCP server tools (~30 min)** — After restart, test all 6 tools end-to-end, fix any runtime issues (including the `scrape_log` column name mismatch).
