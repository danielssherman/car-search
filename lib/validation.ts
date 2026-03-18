import { z } from "zod";
import { NextResponse } from "next/server";

export const SortEnum = z.enum(["best_value", "price_asc", "price_desc", "newest"]);
export type SortOrder = z.infer<typeof SortEnum>;

export const StatusEnum = z.enum(["in_stock", "in_transit", "all"]);

// Coerce non-empty strings to int, treat "" as undefined (URL params send "" for bare ?minPrice=)
const optionalIntParam = z.preprocess(
  (val) => (val === "" || val === undefined ? undefined : val),
  z.coerce.number().int().min(0).optional()
);

export const InventoryQuerySchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  models: z.string().optional(),
  dealer: z.string().optional(),
  dealers: z.string().optional(),
  color: z.string().optional(),
  colors: z.string().optional(),
  condition: z.string().optional(),
  conditions: z.string().optional(),
  minPrice: optionalIntParam,
  maxPrice: optionalIntParam,
  status: StatusEnum.optional(),
  sort: SortEnum.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// VIN: 17 chars, alphanumeric excluding I, O, Q
export const VinSchema = z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "Invalid VIN format");

export const AISearchBodySchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(500, "Query must be 500 characters or less"),
});

export function apiError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details !== undefined ? { details } : {}) },
    { status }
  );
}
