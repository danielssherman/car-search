import Anthropic from "@anthropic-ai/sdk";
import type { InventoryFilters } from "./types";
import { getStats, getDealers } from "./db";

interface ParsedFilters {
  filters: InventoryFilters;
  explanation: string;
}

function buildSystemPrompt(): { prompt: string; models: string[] } {
  const stats = getStats();
  const dealers = getDealers();

  const makesList = Object.entries(stats.count_by_make)
    .sort(([, a], [, b]) => b - a)
    .map(([make, count]) => `${make} (${count})`)
    .join(", ");

  const dealersList = dealers
    .map((d) => `${d.dealer_name} (${d.dealer_city})`)
    .join(", ");

  const modelsList = stats.models.join(", ");

  const prompt = `You are a car inventory search assistant for the Bay Area Car Tracker.
Your job: interpret a natural language car search query and return structured filters as JSON.

INVENTORY CONTEXT:
- ${stats.total.toLocaleString()} vehicles across ${stats.total_dealers} Bay Area dealers
- Makes available: ${makesList}
- Dealers: ${dealersList}
- Price range: $${stats.min_price.toLocaleString()} - $${stats.max_price.toLocaleString()} (average: $${Math.round(stats.avg_price).toLocaleString()})

AVAILABLE MODELS (use these exact strings):
${modelsList}

BMW MODEL KNOWLEDGE:
- "Sporty": M2, M3, M4, M5, M8, M340, M440i, M240i, M235i, X5 M, X6 M, XM (M-cars and M-Sport trims)
- "Family SUV": X5, X7, XM (3-row: X7 only)
- "Compact SUV": X1, X2, X3
- "Luxury sedan": 7 Series (740i, 750e, 760i, i7), 8 Series (840i, M850i)
- "Electric": i4, i5, i7, iX (BEV). Plug-in hybrid: X5 PHEV, 330e, 550e, 750e, XM
- "Entry-level/affordable": X1, 230i, 228i, 330i (under $60k)
- "Mountain/snow capable" = xDrive (AWD) trims. Use search: "xDrive" to filter for AWD.
- "Convertible/open top": Z4, some 430i, some M4
- "Gran Coupe": 4-door coupe style (228i, 840i, M850i, i4)

FILTER SCHEMA (return only fields that are relevant):
{
  "make": string,          // make name if the user specifies one
  "models": string[],      // array of model names from the list above
  "model": string,         // single model if the user asked for exactly one
  "color": string,         // exterior color (partial match OK)
  "condition": "New"|"Used"|"CPO",
  "minPrice": number,      // in dollars
  "maxPrice": number,      // in dollars
  "dealer": string,        // dealer name (partial match)
  "status": "in_stock"|"in_transit",
  "sort": "best_value"|"price_asc"|"price_desc"|"newest",
  "search": string,        // free-text for trim/package matching (e.g., "xDrive", "Competition")
  "explanation": string    // 1-2 sentence explanation of your interpretation
}

RULES:
1. Return ONLY valid JSON. No markdown, no backticks, no extra text.
2. Omit fields that are not relevant to the query. Do not set fields to null or empty strings.
3. Prefer "models" (array) over "model" (string) when multiple models could match.
4. Use the "search" field for trim-level queries (e.g., "xDrive" for AWD, "Competition" for track-focused).
5. Default sort to "best_value" unless the user indicates price preference.
6. The "explanation" field is REQUIRED. Explain what you interpreted and why you chose these filters.
7. If the query is too vague or unrelated to cars, return {"explanation": "..."} with helpful guidance.
8. If the user asks for a make not in inventory, note this in explanation and suggest similar vehicles from the available makes.`;

  return { prompt, models: stats.models };
}

function normalizeModels(models: string[], knownModels: string[]): string[] {
  return models
    .map((m) => {
      if (knownModels.includes(m)) return m;
      // Try case-insensitive match
      for (const known of knownModels) {
        if (known.toLowerCase() === m.toLowerCase()) return known;
      }
      // Try partial match (e.g., "M340i" -> "M340")
      for (const known of knownModels) {
        if (
          m.toLowerCase().startsWith(known.toLowerCase()) ||
          known.toLowerCase().startsWith(m.toLowerCase())
        ) {
          return known;
        }
      }
      return null;
    })
    .filter((m): m is string => m !== null);
}

export async function parseNaturalLanguageQuery(
  query: string
): Promise<ParsedFilters> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your-anthropic-api-key-here") {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const { prompt, models: knownModels } = buildSystemPrompt();

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: prompt,
    messages: [{ role: "user", content: query }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Failed to parse LLM response as JSON");
  }

  const explanation =
    typeof parsed.explanation === "string"
      ? parsed.explanation
      : "Here are the results based on your search.";

  const filters: InventoryFilters = {};

  if (typeof parsed.make === "string") filters.make = parsed.make;

  if (Array.isArray(parsed.models) && parsed.models.length > 0) {
    const normalized = normalizeModels(parsed.models as string[], knownModels);
    if (normalized.length > 0) {
      filters.models = normalized;
    }
  } else if (typeof parsed.model === "string") {
    const normalized = normalizeModels([parsed.model], knownModels);
    if (normalized.length > 0) {
      filters.model = normalized[0];
    }
  }

  if (typeof parsed.color === "string") filters.color = parsed.color;
  if (typeof parsed.condition === "string") filters.condition = parsed.condition;
  if (typeof parsed.minPrice === "number") filters.minPrice = parsed.minPrice;
  if (typeof parsed.maxPrice === "number") filters.maxPrice = parsed.maxPrice;
  if (typeof parsed.dealer === "string") filters.dealer = parsed.dealer;
  if (typeof parsed.status === "string") filters.status = parsed.status;
  if (typeof parsed.sort === "string") filters.sort = parsed.sort;
  if (typeof parsed.search === "string") filters.search = parsed.search;

  return { filters, explanation };
}
