# Bay Area Car Tracker

Track new car inventory across every dealership in the Bay Area. Browse the top deals with a quality-scored, filterable dashboard and side-by-side comparison tool.

**Goal:** Build a complete, always-current view of every car on every lot in the Bay Area — starting with BMW dealerships and expanding to all makes and brands.

## Features

- **Multi-make inventory tracking** — generalized data model supports any make, model, and trim
- **Quality scoring** — each vehicle gets a 0–100 score based on price vs. market average, days on lot, condition, mileage, availability, and features
- **Top 100 by default** — dashboard surfaces the best-value vehicles first, keeping the UI fast on SQLite even at scale
- **Automated scraping** from Bay Area dealerships via Playwright (DDC sites) and Algolia Search API
- **Advanced filtering** by make, model, dealer, color, status, price range, and full-text search
- **Vehicle comparison** — select up to 3 vehicles for side-by-side detail comparison
- **Change tracking** — records when vehicles first appear, are last seen, and are removed from inventory
- **Scheduled scraping** via cron with configurable interval

## Quality Score

Every vehicle is scored 0–100 after each scrape:

| Factor | Points | Logic |
|--------|--------|-------|
| Price vs. market avg | 0–35 | Below-market vehicles score higher |
| Days on lot | 0–20 | Longer = more negotiating leverage |
| Condition | 0–15 | New > CPO > Used |
| Mileage | 0–10 | Lower is better (used/CPO) |
| In-stock status | 0–10 | Available now beats in-transit |
| Packages/features | 0–10 | More features = better value |

## What Makes This Different

This isn't another listing site. It's a **buyer's intelligence platform**.

- **Cross-dealer price arbitrage** — the same VIN often appears at multiple dealers at different prices. We surface that so you can save thousands without negotiating.
- **Dealer intelligence** — we track how each dealer prices over time, how often they drop prices, and how long cars sit. This tells you which dealers are most likely to negotiate and when to make your move.
- **Conversational intelligence** — a custom MCP server makes the entire inventory database queryable via natural language in any Claude session. Agents handle scraper orchestration, deal analysis, dealer discovery, and proactive alerts.

## Roadmap

- [x] **Phase 1** — Generalized data model & quality scoring
- [ ] **Phase 2** — Multi-source data pipeline (Cars.com, CarGurus scrapers, price history, independent scraper worker pattern)
- [ ] **Phase 3** — Dealer intelligence engine (dealer scores, markup patterns, negotiation room estimates, deal analysis agent)
- [ ] **Phase 4** — Dealer discovery & database-driven config for 400+ Bay Area dealers (platform detection agent)
- [ ] **Phase 5** — Scale & reliability (BullMQ job queue, PostgreSQL, monitoring)
- [ ] **Phase 6** — Product UI (cross-dealer comparison, dealer profiles, price charts, smart alerts via Gmail MCP, map view)
- [ ] **Phase 7** — Public launch (SEO, beta, monetization)
- **Cross-cutting** — Custom MCP server wrapping the database layer, growing with each phase

## Current Dealers (5)

| Dealer | City | Scrape Method |
|--------|------|---------------|
| Stevens Creek BMW | San Jose | Playwright (DDC) |
| BMW of Fremont | Fremont | Playwright (DDC) |
| BMW of San Rafael | San Rafael | Playwright (DDC) |
| Peter Pan BMW | San Mateo | Algolia API |
| BMW of San Francisco | San Francisco | Algolia API |

## Tech Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** with dark theme
- **Playwright** for browser-automated dealership scraping
- **Algolia Search API** for Algolia-powered dealer sites
- **Better SQLite3** for fast local persistence (WAL mode)
- **Node Cron** for scheduled scrape jobs
- **MCP (Model Context Protocol)** — custom server for conversational database access + Gmail MCP for alerts
- **Claude agents** — deal analysis, scraper orchestration, dealer platform detection

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npx playwright install chromium
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRAPE_API_KEY` | Secret key for the `/api/scrape` endpoint | *(required)* |
| `DATABASE_PATH` | Path to the SQLite database file | `./data/inventory.db` |
| `SCRAPE_INTERVAL_HOURS` | How often the background cron job scrapes | `4` |
| `ALGOLIA_APP_ID` | Algolia application ID for dealer search | *(required for Algolia dealers)* |
| `ALGOLIA_API_KEY` | Algolia search API key | *(required for Algolia dealers)* |

### Seed the Database

Trigger an initial scrape to populate inventory:

```bash
npx tsx scripts/seed.ts
```

Or generate sample data for testing:

```bash
npx tsx scripts/seed-sample.ts
```

When running with `next start`, a background cron job automatically scrapes at the configured interval.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/inventory` | GET | Filtered vehicle list (top 100 by quality score) |
| `/api/inventory/[vin]` | GET | Single vehicle details |
| `/api/stats` | GET | Aggregate stats, makes, models, color distribution |
| `/api/dealers` | GET | Dealer list with vehicle counts |
| `/api/scrape` | POST | Trigger a scrape (requires API key) |

## Project Structure

```
app/            Next.js pages, layout, and API routes
components/     React UI components (FilterBar, InventoryTable, ComparePanel, etc.)
lib/            Database, scraper, scoring, types, and cron logic
scripts/        Seed and test scripts
data/           SQLite database (gitignored)
mcp-server/     Custom MCP server for conversational database access (planned)
```
