# Bay Area Car Tracker

Track new and used car inventory across Bay Area dealerships. Browse top deals with a quality-scored, filterable dashboard, side-by-side comparison, and AI-powered natural language search.

**6,000+ vehicles across 24 dealers and 11 makes**, scraped every 6 hours via GitHub Actions.

## Features

- **Multi-make inventory tracking** — BMW, Mercedes-Benz, Porsche, Lexus, Land Rover, Jaguar, MINI, Volvo, Cadillac, Audi across 24 dealerships
- **Quality scoring** — 0–100 score based on price vs. market average, days on lot, condition, mileage, availability, and features
- **Vehicle detail panel** — click any row for full specs, packages, all listings across dealers, and external link
- **Pagination** — 50 vehicles per page with prev/next navigation
- **Advanced filtering** — chip + popover multi-select for make, model, dealer, color, condition, status, price range, and full-text search
- **AI-powered search** — natural language queries ("blue BMW X5 under $60k") converted to filters via Claude Haiku
- **Vehicle comparison** — select up to 3 vehicles for side-by-side detail comparison with delta highlighting
- **Price history tracking** — records every price change per VIN/source/dealer, with SVG step-line chart and trend badges (emerald for drops, red for increases)
- **Scrape health dashboard** — color-coded pipeline status cards showing per-source health, success rates, and last scrape timing
- **Cross-dealer arbitrage** — surfaces the same VIN listed at multiple dealers at different prices
- **Automated scraping** — GitHub Actions cron every 6h with random jitter, SQLite persisted to Cloudflare R2
- **Anti-detection hardening** — rotating user agents, randomized viewports, inter-dealer delays, timing jitter
- **MCP server** — 10 tools for querying inventory, price history, and scrape health via Claude

## Quality Score

Every vehicle is scored 0–100 after each scrape:

| Factor | Points | Logic |
|--------|--------|-------|
| Price vs. market avg | 0–35 | Below-market vehicles score higher |
| Days on lot | 0–20 | Longer = more negotiating leverage |
| Condition | 0–15 | New > CPO > Used |
| Mileage | 0–10 | Lower is better |
| In-stock status | 0–10 | Available now beats in-transit |
| Packages/features | 0–10 | More features = better value |

## Current Dealers (24)

| Dealer | City | Make | Scraper |
|--------|------|------|---------|
| Stevens Creek BMW | San Jose | BMW | DDC Classic |
| BMW of Mountain View | Mountain View | BMW | DDC Classic |
| BMW of Fremont | Fremont | BMW | DDC Classic |
| BMW of San Rafael | San Rafael | BMW | DDC Classic |
| Peter Pan BMW | San Mateo | BMW | Algolia API |
| BMW of San Francisco | San Francisco | BMW | Algolia API |
| Mercedes-Benz of Stevens Creek | San Jose | Mercedes-Benz | DDC Classic |
| Mercedes-Benz of Marin | San Rafael | Mercedes-Benz | DDC Cosmos |
| Porsche San Francisco | San Francisco | Porsche | DDC Cosmos |
| Porsche Marin | Mill Valley | Porsche | DDC Cosmos |
| Lexus Stevens Creek | San Jose | Lexus | DDC Cosmos |
| Lexus of Fremont | Fremont | Lexus | DDC Cosmos |
| Lexus of Marin | San Rafael | Lexus | DDC Classic |
| Lexus of Serramonte | Colma | Lexus | DDC Classic |
| Putnam Lexus | Redwood City | Lexus | DDC Classic |
| Land Rover Marin | Corte Madera | Land Rover | DDC Classic |
| Land Rover San Jose | San Jose | Land Rover | DDC Classic |
| Land Rover San Francisco | San Francisco | Land Rover | DDC Classic |
| Jaguar Marin | Corte Madera | Jaguar | DDC Classic |
| MINI of Stevens Creek | Santa Clara | MINI | DDC Classic |
| Volvo Cars Walnut Creek | Walnut Creek | Volvo | DDC Classic |
| Volvo Cars San Francisco | San Francisco | Volvo | DDC Classic |
| Putnam Cadillac | Burlingame | Cadillac | DDC Classic |
| Audi San Jose | San Jose | Audi | DDC Classic |

## Tech Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** with dark theme
- **Playwright** for browser-automated dealership scraping (DDC/DealerOn sites)
- **Algolia Search API** for Algolia-powered dealer sites
- **Better SQLite3** with WAL mode, CTE-based queries, composite indexes
- **Zod** for API input validation
- **Vitest** — 242 tests (scoring, parsers, db queries, validation, dealer config)
- **GitHub Actions** — automated scraping every 6h + test CI on push/PR
- **Cloudflare R2** — SQLite database persistence between CI runs
- **MCP (Model Context Protocol)** — 10-tool server for conversational database access

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # fill in your values
npm run dev
```

The app will be available at `http://localhost:3000`.

### Sync Database from CI

To pull the latest scraped database from Cloudflare R2:

```bash
./scripts/sync-db.sh
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRAPE_API_KEY` | Secret key for the `/api/scrape` endpoint (rejects known defaults) | *(required)* |
| `DATABASE_PATH` | Path to the SQLite database file | `./data/inventory.db` |
| `SCRAPE_INTERVAL_HOURS` | How often the background cron job scrapes | `4` |
| `ALGOLIA_APP_ID` | Algolia application ID for dealer search | *(required for Algolia dealers)* |
| `ALGOLIA_API_KEY` | Algolia search API key | *(required for Algolia dealers)* |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI-powered search | *(optional)* |

### Run Tests

```bash
npm test            # single run
npm run test:watch  # watch mode
```

### Trigger a Manual Scrape

```bash
npm run scrape
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/inventory` | GET | Paginated, filtered vehicle list with Zod validation |
| `/api/inventory/[vin]` | GET | Single vehicle details with all listings |
| `/api/stats` | GET | Aggregate stats — makes, models, colors, price ranges |
| `/api/dealers` | GET | Dealer list with vehicle counts |
| `/api/price-history/[vin]` | GET | Full price change timeline for a vehicle |
| `/api/scrape-health` | GET | Per-source health summaries, recent scrapes, active/removed counts |
| `/api/scrape` | POST | Trigger a scrape (requires `x-api-key` header) |
| `/api/ai-search` | POST | Natural language query → inventory filters via Claude |

## MCP Server

10 tools for querying the inventory database from any Claude session:

| Tool | Description |
|------|-------------|
| `search_inventory` | Filter by make, model, dealer, color, condition, status, price range |
| `get_vehicle` | Full details by VIN with parsed packages |
| `get_listings` | All listings for a VIN across sources and dealers |
| `get_market_stats` | Aggregate counts, avg/min/max price, makes, models, colors |
| `get_dealers` | Dealer list with vehicle counts |
| `get_price_history` | Price change timeline for a VIN |
| `get_new_vehicles` | Vehicles first seen since a given date |
| `get_price_drops` | Price decreases since a date, sorted by largest drop |
| `trigger_scrape` | On-demand scrape with error handling |
| `get_scrape_health` | Recent scrape history, active/removed counts |

## Project Structure

```
app/                    Next.js pages, layout, and API routes
components/             React UI (FilterBar, InventoryTable, VehicleCard, ComparePanel, etc.)
lib/                    Database, scrapers, scoring, validation, types, AI search
lib/scrapers/           Scraper modules (ddc.ts, algolia.ts, carscom.ts, cargurus.ts)
mcp-server/             MCP server for conversational database access
scripts/                Scrape, seed, sync, and diagnostic scripts
tests/                  Vitest test suites (scoring, parsers, db, validation)
.github/workflows/      CI: scrape.yml (6h cron + R2), test.yml (push/PR)
data/                   SQLite database (gitignored, persisted to Cloudflare R2)
```

## Roadmap

- [x] **Phase 1** — Core tracker: SQLite, DDC + Algolia scrapers, dashboard, quality scores, comparison
- [x] **Phase 2** — Multi-source pipeline: listings model, scraper worker pattern, price history, GitHub Actions cron + R2 persistence
- [ ] **Phase 3** — Dealer intelligence: price history UI done (SVG charts, trend badges). Negotiation estimator + dealer scoring need 2-3 months of price data (accumulating since March 2026)
- [ ] **Phase 4** — Scale to 400+ dealers: 24 active, 37 cataloged. Dealer config externalized to JSON. Playwright-based platform detection. Next: DealerInspire scraper, batch onboarding
- [ ] **Phase 5** — Infrastructure: scrape health dashboard done. Anti-detection hardening done. Remaining: materialize price_trend column, job queue, caching, hosted DB migration
- [ ] **Phase 6** — Smart alerts: price drop notifications, new inventory alerts
- [ ] **Phase 7** — Public product: auth, hosted DB, embedded chat
