# Bay Area BMW Tracker

A full-stack web app that scrapes and tracks BMW 330i and M340i inventory across Bay Area dealerships. Monitor vehicle availability, pricing, and specs in real-time with a filterable dashboard and side-by-side comparison tool.

## Features

- **Automated inventory scraping** from 5 Bay Area BMW dealerships (Stevens Creek, Fremont, San Francisco, San Rafael, Peter Pan)
- **Live dashboard** with sortable inventory table, aggregate stats, and color distribution
- **Advanced filtering** by model, dealer, color, status (In Stock / In Transit), price range, and full-text search
- **Vehicle comparison** — select up to 3 vehicles for side-by-side detail comparison
- **Change tracking** — records when vehicles first appear, are last seen, and are removed from inventory
- **Scheduled scraping** via cron with configurable interval

## Tech Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** with custom BMW-branded dark theme
- **Playwright** for browser-automated dealership scraping
- **Algolia Search API** for Algolia-powered dealer sites
- **Better SQLite3** for fast local persistence
- **Node Cron** for scheduled scrape jobs

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

Create a `.env.local` file:

```
SCRAPE_API_KEY=your-secret-key
DATABASE_PATH=./data/inventory.db
SCRAPE_INTERVAL_HOURS=4
```

### Seed the Database

Trigger an initial scrape to populate inventory:

```bash
npx tsx scripts/seed.ts
```

Or via the API:

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "x-api-key: your-secret-key"
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/inventory` | GET | Filtered vehicle list |
| `/api/stats` | GET | Aggregate inventory statistics |
| `/api/dealers` | GET | Dealer list with vehicle counts |
| `/api/scrape` | POST | Trigger a scrape (requires API key) |

## Project Structure

```
app/            Next.js pages, layout, and API routes
components/     React UI components (FilterBar, InventoryTable, ComparePanel, etc.)
lib/            Database, scraper, types, and cron logic
scripts/        Seed and test scripts
data/           SQLite database (gitignored)
```
