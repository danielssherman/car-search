import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getVehicles,
  getVehicleByVin,
  getStats,
  getDealers,
  getLastScrapeTime,
  getDb,
} from "../lib/db.js";
import { runScrape } from "../lib/cron.js";

const server = new McpServer({
  name: "bay-area-car-tracker",
  version: "1.0.0",
});

// --- search_inventory ---
server.tool(
  "search_inventory",
  "Search the Bay Area car inventory. Filter by make, model, dealer, color, condition, status, price range. Returns vehicles sorted by quality score by default (best deals first).",
  {
    make: z.string().optional().describe("Filter by make (e.g., 'BMW', 'Toyota')"),
    model: z.string().optional().describe("Filter by model (e.g., '330i', 'M340i', 'X3')"),
    dealer: z.string().optional().describe("Filter by dealer name (partial match)"),
    color: z.string().optional().describe("Filter by exterior color (partial match)"),
    condition: z
      .enum(["New", "Used", "CPO", "all"])
      .optional()
      .describe("Vehicle condition filter"),
    status: z
      .enum(["in_stock", "in_transit", "all"])
      .optional()
      .describe("Availability status filter"),
    min_price: z.number().optional().describe("Minimum price"),
    max_price: z.number().optional().describe("Maximum price"),
    sort: z
      .enum(["best_value", "price_asc", "price_desc", "newest"])
      .optional()
      .describe("Sort order (default: best_value = highest quality score)"),
    limit: z.number().optional().describe("Max results (default: 100)"),
    search: z
      .string()
      .optional()
      .describe("Free-text search across VIN, make, model, color, dealer, trim"),
  },
  async (params) => {
    const vehicles = getVehicles({
      make: params.make,
      model: params.model,
      dealer: params.dealer,
      color: params.color,
      condition: params.condition,
      status: params.status,
      minPrice: params.min_price,
      maxPrice: params.max_price,
      sort: params.sort || "best_value",
      limit: params.limit,
      search: params.search,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: vehicles.length,
              vehicles: vehicles.map((v) => ({
                vin: v.vin,
                year: v.year,
                make: v.make,
                model: v.model,
                trim: v.trim,
                exterior_color: v.exterior_color,
                msrp: v.msrp,
                condition: v.condition,
                mileage: v.mileage,
                status: v.status,
                dealer_name: v.dealer_name,
                dealer_city: v.dealer_city,
                quality_score: v.quality_score,
                first_seen: v.first_seen,
                detail_url: v.detail_url,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- get_vehicle ---
server.tool(
  "get_vehicle",
  "Get full details for a specific vehicle by VIN, including all specs, packages, pricing, and quality score.",
  {
    vin: z.string().describe("Vehicle Identification Number"),
  },
  async ({ vin }) => {
    const vehicle = getVehicleByVin(vin);

    if (!vehicle) {
      return {
        content: [
          { type: "text" as const, text: `No vehicle found with VIN: ${vin}` },
        ],
        isError: true,
      };
    }

    // Parse packages JSON for readability
    let packages: string[] = [];
    try {
      packages = JSON.parse(vehicle.packages || "[]");
    } catch {
      packages = [];
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ...vehicle, packages }, null, 2),
        },
      ],
    };
  }
);

// --- get_market_stats ---
server.tool(
  "get_market_stats",
  "Get aggregate market statistics: total vehicles, average/min/max price, count by make, dealer count, color distribution, and available makes/models.",
  {},
  async () => {
    const stats = getStats();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }
);

// --- get_dealers ---
server.tool(
  "get_dealers",
  "Get list of all tracked dealers with their city and current vehicle count.",
  {},
  async () => {
    const dealers = getDealers();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { count: dealers.length, dealers },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- trigger_scrape ---
server.tool(
  "trigger_scrape",
  "Trigger an on-demand scrape of all configured dealerships. Updates inventory, marks removed vehicles, and recalculates quality scores. Returns count of vehicles found and new vehicles added.",
  {},
  async () => {
    try {
      const result = await runScrape();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "success",
                vehicles_found: result.found,
                vehicles_new: result.newCount,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "error", error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// --- get_scrape_health ---
server.tool(
  "get_scrape_health",
  "Get scrape health info: last successful scrape time, recent scrape history (last 10), and current active vehicle count.",
  {},
  async () => {
    const lastScrapeTime = getLastScrapeTime();
    const db = getDb();

    const recentScrapes = db
      .prepare(
        `SELECT id, started_at, completed_at, vehicles_found, vehicles_new, status, error_message
         FROM scrape_log ORDER BY id DESC LIMIT 10`
      )
      .all() as Array<{
      id: number;
      started_at: string;
      completed_at: string;
      vehicles_found: number;
      vehicles_new: number;
      status: string;
      error_message: string | null;
    }>;

    const vehicleCounts = db
      .prepare(
        `SELECT
          COUNT(*) as active,
          (SELECT COUNT(*) FROM vehicles WHERE removed_at IS NOT NULL) as removed
         FROM vehicles WHERE removed_at IS NULL`
      )
      .get() as { active: number; removed: number };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              last_successful_scrape: lastScrapeTime,
              active_vehicles: vehicleCounts.active,
              removed_vehicles: vehicleCounts.removed,
              recent_scrapes: recentScrapes,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bay Area Car Tracker MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
