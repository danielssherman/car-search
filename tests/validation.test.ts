import { describe, it, expect } from "vitest";
import {
  InventoryQuerySchema,
  VinSchema,
  AISearchBodySchema,
} from "@/lib/validation";

describe("InventoryQuerySchema", () => {
  it("applies defaults for page and pageSize when not provided", () => {
    const result = InventoryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("coerces string '50000' to number for minPrice", () => {
    const result = InventoryQuerySchema.safeParse({ minPrice: "50000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPrice).toBe(50000);
      expect(typeof result.data.minPrice).toBe("number");
    }
  });

  it("coerces string '100000' to number for maxPrice", () => {
    const result = InventoryQuerySchema.safeParse({ maxPrice: "100000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxPrice).toBe(100000);
      expect(typeof result.data.maxPrice).toBe("number");
    }
  });

  it("coerces string page and pageSize to numbers", () => {
    const result = InventoryQuerySchema.safeParse({ page: "3", pageSize: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it("treats empty string minPrice as undefined (bare ?minPrice= in URL)", () => {
    const result = InventoryQuerySchema.safeParse({ minPrice: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPrice).toBeUndefined();
    }
  });

  it("rejects non-numeric minPrice", () => {
    const result = InventoryQuerySchema.safeParse({ minPrice: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects negative minPrice", () => {
    const result = InventoryQuerySchema.safeParse({ minPrice: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxPrice", () => {
    const result = InventoryQuerySchema.safeParse({ maxPrice: "-500" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sort value", () => {
    const result = InventoryQuerySchema.safeParse({ sort: "alphabetical" });
    expect(result.success).toBe(false);
  });

  it("accepts valid sort values", () => {
    for (const sort of ["best_value", "price_asc", "price_desc", "newest"]) {
      const result = InventoryQuerySchema.safeParse({ sort });
      expect(result.success).toBe(true);
    }
  });

  it("rejects pageSize above 200", () => {
    const result = InventoryQuerySchema.safeParse({ pageSize: "201" });
    expect(result.success).toBe(false);
  });

  it("rejects page below 1", () => {
    const result = InventoryQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize below 1", () => {
    const result = InventoryQuerySchema.safeParse({ pageSize: "0" });
    expect(result.success).toBe(false);
  });

  it("accepts valid status values", () => {
    for (const status of ["in_stock", "in_transit", "all"]) {
      const result = InventoryQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status value", () => {
    const result = InventoryQuerySchema.safeParse({ status: "sold" });
    expect(result.success).toBe(false);
  });

  it("rejects search longer than 200 characters", () => {
    const result = InventoryQuerySchema.safeParse({ search: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts search of exactly 200 characters", () => {
    const result = InventoryQuerySchema.safeParse({ search: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("passes through optional string fields", () => {
    const result = InventoryQuerySchema.safeParse({
      make: "BMW",
      model: "X5",
      dealer: "Stevens Creek BMW",
      color: "Black",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.make).toBe("BMW");
      expect(result.data.model).toBe("X5");
      expect(result.data.dealer).toBe("Stevens Creek BMW");
      expect(result.data.color).toBe("Black");
    }
  });

  it("rejects non-integer minPrice", () => {
    const result = InventoryQuerySchema.safeParse({ minPrice: "50000.5" });
    expect(result.success).toBe(false);
  });
});

describe("VinSchema", () => {
  it("accepts a valid 17-character VIN", () => {
    const result = VinSchema.safeParse("WBA53BJ09RCM12345");
    expect(result.success).toBe(true);
  });

  it("accepts a lowercase VIN (case insensitive)", () => {
    const result = VinSchema.safeParse("wba53bj09rcm12345");
    expect(result.success).toBe(true);
  });

  it("rejects a 16-character VIN (too short)", () => {
    const result = VinSchema.safeParse("WBA53BJ09RCM1234");
    expect(result.success).toBe(false);
  });

  it("rejects an 18-character VIN (too long)", () => {
    const result = VinSchema.safeParse("WBA53BJ09RCM123456");
    expect(result.success).toBe(false);
  });

  it("rejects a VIN containing letter I", () => {
    const result = VinSchema.safeParse("WBA53BJ09ICM12345");
    expect(result.success).toBe(false);
  });

  it("rejects a VIN containing letter O", () => {
    const result = VinSchema.safeParse("WBA53BJ09OCM12345");
    expect(result.success).toBe(false);
  });

  it("rejects a VIN containing letter Q", () => {
    const result = VinSchema.safeParse("WBA53BJ09QCM12345");
    expect(result.success).toBe(false);
  });

  it("rejects a VIN with special characters", () => {
    const result = VinSchema.safeParse("WBA53BJ09RCM1234!");
    expect(result.success).toBe(false);
  });

  it("rejects a VIN with spaces", () => {
    const result = VinSchema.safeParse("WBA53BJ09RCM 2345");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = VinSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("AISearchBodySchema", () => {
  it("accepts a valid query", () => {
    const result = AISearchBodySchema.safeParse({ query: "Find blue BMW X5 under 60k" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Find blue BMW X5 under 60k");
    }
  });

  it("trims whitespace from query", () => {
    const result = AISearchBodySchema.safeParse({ query: "  blue BMW  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("blue BMW");
    }
  });

  it("rejects empty string", () => {
    const result = AISearchBodySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only string (trimmed to empty)", () => {
    const result = AISearchBodySchema.safeParse({ query: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects query longer than 500 characters", () => {
    const result = AISearchBodySchema.safeParse({ query: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts query of exactly 500 characters", () => {
    const result = AISearchBodySchema.safeParse({ query: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects missing query field", () => {
    const result = AISearchBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string query", () => {
    const result = AISearchBodySchema.safeParse({ query: 123 });
    expect(result.success).toBe(false);
  });
});
