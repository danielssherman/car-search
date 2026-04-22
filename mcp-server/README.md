# Bay Area Car Tracker — MCP Server

Custom MCP server that exposes the Bay Area Car Tracker database to Claude via natural language.

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

Also ensure the parent project's dependencies are installed (needed for `better-sqlite3`, `playwright`, etc.):

```bash
cd ..
npm install
```

### 2. Add to Claude Code settings

Add this to your `~/.claude.json` (global) or project `.claude.json`:

```json
{
  "mcpServers": {
    "car-tracker": {
      "command": "npx",
      "args": ["tsx", "/Users/dsherman/Projects/bay-area-bmw-tracker/mcp-server/index.ts"],
      "env": {
        "DATABASE_PATH": "/Users/dsherman/Projects/bay-area-bmw-tracker/data/inventory.db"
      }
    }
  }
}
```

### 3. Restart Claude Code

The tools will be available in any Claude Code session.

## Available Tools

| Tool | Description |
|------|-------------|
| `search_inventory` | Filter vehicles by make, model, dealer, color, status, price range, sort |
| `get_vehicle` | Full vehicle details by VIN |
| `get_market_stats` | Aggregate stats: avg price, counts by make, dealer count, color distribution |
| `get_dealers` | Dealer list with vehicle counts |
| `trigger_scrape` | Run an on-demand scrape of all dealerships |
| `get_scrape_health` | Last scrape time, recent scrape history, vehicle counts |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/inventory.db` | Path to SQLite database |
| `SCRAPE_API_KEY` | — | Required for `trigger_scrape` |
| `ALGOLIA_APP_ID` | — | Required for Algolia-based dealer scraping |
| `ALGOLIA_API_KEY` | — | Required for Algolia-based dealer scraping |
