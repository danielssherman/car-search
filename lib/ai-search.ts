import Anthropic from "@anthropic-ai/sdk";
import type { InventoryFilters } from "./types";

const SYSTEM_PROMPT = `You are a BMW inventory search assistant for the Bay Area Car Tracker.
Your job: interpret a natural language car search query and return structured filters as JSON.

INVENTORY CONTEXT:
- All 1,800 vehicles are BMW, from 5 Bay Area dealers
- Dealers: Stevens Creek BMW (San Jose), BMW of Fremont, BMW of San Rafael, Peter Pan BMW (San Mateo), BMW of San Francisco
- Price range: $42,455 - $184,860 (average: $76,212)
- All current inventory is condition: "New"

AVAILABLE MODELS (use these exact strings):
Sedans: 230i, 228i, 330i, 330e, 340i, 430i, 440i, 530i, 540i, 550e, 740i, 750e, 760i, 840i, M235i, M240i, M340, M440i, M3, M5, M8, M850i, i4, i5, i7
  Series groupings: "2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "8 Series"
SUVs: X1, X2, X3, X5, X5 PHEV, X5 M, X6, X6 M, X7, XM, iX, ALPINA XB7
Convertibles/Roadsters: Z4 (also some 430i, M4 come in convertible)
Coupes: M2, M4 (also 430i comes in coupe)

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
8. Remember: only BMW vehicles are available. If user asks for another make, note this in explanation and suggest similar BMW models.`;

interface ParsedFilters {
  filters: InventoryFilters;
  explanation: string;
}

const KNOWN_MODELS = [
  "2 Series", "228i", "230i", "235i", "3 Series", "330e", "330i", "340i",
  "4 Series", "430i", "440i", "5 Series", "530i", "540i", "550e",
  "7 Series", "740i", "750e", "760i", "8 Series", "840i",
  "ALPINA XB7", "M2", "M235i", "M240i", "M3", "M340", "M4", "M440i",
  "M5", "M8", "M850i", "X1", "X2", "X3", "X5", "X5 M", "X5 PHEV",
  "X6", "X6 M", "X7", "XM", "Z4", "i4", "i5", "i7", "iX",
];

function normalizeModels(models: string[]): string[] {
  return models
    .map((m) => {
      if (KNOWN_MODELS.includes(m)) return m;
      // Try case-insensitive match
      for (const known of KNOWN_MODELS) {
        if (known.toLowerCase() === m.toLowerCase()) return known;
      }
      // Try partial match (e.g., "M340i" -> "M340")
      for (const known of KNOWN_MODELS) {
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

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
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

  if (Array.isArray(parsed.models) && parsed.models.length > 0) {
    const normalized = normalizeModels(parsed.models as string[]);
    if (normalized.length > 0) {
      filters.models = normalized;
    }
  } else if (typeof parsed.model === "string") {
    const normalized = normalizeModels([parsed.model]);
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
