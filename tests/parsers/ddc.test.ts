import { describe, it, expect } from "vitest";
import { parseDDCInventory } from "@/lib/scrapers/ddc";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface DDCDealerConfig {
  name: string;
  city: string;
  baseUrl: string;
  searchUrl: string;
  defaultMake: string;
  timeout: number;
}

const TEST_DEALER: DDCDealerConfig = {
  name: "Test BMW",
  city: "San Jose",
  baseUrl: "https://www.testbmw.com",
  searchUrl: "https://www.testbmw.com/new-inventory/index.htm",
  defaultMake: "BMW",
  timeout: 30000,
};

/** Returns a complete, realistic DDC inventory item. Override any field. */
function makeDDCItem(overrides: Record<string, unknown> = {}) {
  return {
    vin: "WBA53EM09RCM12345",
    make: "BMW",
    model: "X5",
    trim: "xDrive40i",
    year: 2025,
    mileage: "10",
    statusInt: 0,
    stockNumber: "M12345",
    link: "/new-inventory/2025-bmw-x5-san-jose-ca/12345",
    trackingPricing: {
      msrp: "72000",
      askingPrice: "70000",
      internetPrice: "69500",
    },
    trackingAttributes: [
      { name: "exteriorColor", value: "Alpine White Exterior" },
      { name: "interiorColor", value: "Black Interior" },
    ],
    attributes: [
      { name: "exteriorColor", value: "Alpine White" },
      { name: "interiorColor", value: "Black Interior" },
      { name: "bodyStyle", value: "SUV" },
      { name: "drivetrain", value: "AWD" },
      { name: "engine", value: "3.0L" },
      { name: "fuelType", value: "Gas" },
    ],
    packages: ["Premium Package", "M Sport Package"],
    ...overrides,
  };
}

/** Wrap items into the DDC API response shape. */
function wrapInventory(items: unknown[]) {
  return { inventory: items };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseDDCInventory", () => {
  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  describe("happy path — complete inventory item", () => {
    it("returns correct ScrapedVehicle fields", () => {
      const data = wrapInventory([makeDDCItem()]);
      const result = parseDDCInventory(data, TEST_DEALER);

      expect(result).toHaveLength(1);
      const v = result[0];

      expect(v.vin).toBe("WBA53EM09RCM12345");
      expect(v.year).toBe(2025);
      expect(v.make).toBe("BMW");
      expect(v.model).toBe("X5");
      expect(v.trim).toBe("xDrive40i");
      expect(v.body_style).toBe("SUV");
      expect(v.drivetrain).toBe("AWD");
      expect(v.engine).toBe("3.0L");
      expect(v.fuel_type).toBe("Gas");
      expect(v.mileage).toBe(10);
      expect(v.condition).toBe("New");
      expect(v.exterior_color).toBe("Alpine White");
      expect(v.interior_color).toBe("Black");
      expect(v.msrp).toBe(72000);
      expect(v.asking_price).toBe(70000);
      expect(v.source).toBe("dealer_ddc");
      expect(v.dealer_name).toBe("Test BMW");
      expect(v.dealer_city).toBe("San Jose");
      expect(v.status).toBe("In Stock");
      expect(v.packages).toEqual(["Premium Package", "M Sport Package"]);
      expect(v.stock_number).toBe("M12345");
      expect(v.detail_url).toBe(
        "https://www.testbmw.com/new-inventory/2025-bmw-x5-san-jose-ca/12345"
      );
    });
  });

  // -----------------------------------------------------------------------
  // Skipping invalid items
  // -----------------------------------------------------------------------
  describe("item skipping", () => {
    it("skips item with missing VIN", () => {
      const data = wrapInventory([makeDDCItem({ vin: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips item with undefined VIN", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).vin;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips item with missing model AND trim", () => {
      const data = wrapInventory([makeDDCItem({ model: "", trim: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips item when model is missing and trim is also missing (both undefined)", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).model;
      delete (item as Record<string, unknown>).trim;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(0);
    });

    it("keeps item when model is present but trim is missing (trim defaults to model)", () => {
      const data = wrapInventory([makeDDCItem({ model: "X3", trim: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("X3");
      // trim falls back to model when trim is empty string
      expect(result[0].trim).toBe("X3");
    });

    it("keeps item when trim is present but model is empty", () => {
      const data = wrapInventory([makeDDCItem({ model: "", trim: "xDrive40i" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("");
      expect(result[0].trim).toBe("xDrive40i");
    });
  });

  // -----------------------------------------------------------------------
  // Price fallback chain
  // -----------------------------------------------------------------------
  describe("price fallback chain", () => {
    it("separates msrp from asking_price when both present", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: {
            msrp: "72000",
            askingPrice: "70000",
            internetPrice: "69500",
          },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(72000);
      expect(result[0].asking_price).toBe(70000);
    });

    it("sets asking_price from askingPrice when msrp is missing", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: {
            askingPrice: "70000",
            internetPrice: "69500",
          },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(70000);
    });

    it("sets asking_price from internetPrice when askingPrice is missing", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: {
            internetPrice: "69500",
          },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(69500);
    });

    it("sets asking_price from salePrice when askingPrice/internetPrice are missing", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: { salePrice: "68000" },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(68000);
    });

    it("uses retailPrice as msrp when trackingPricing is empty", () => {
      const item = makeDDCItem({ trackingPricing: {} });
      (item as Record<string, unknown>).pricing = { retailPrice: "$67,500" };
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(67500);
      expect(result[0].asking_price).toBe(67500); // falls back to msrp
    });

    it("sets asking_price from dprice when no other prices available", () => {
      const item = makeDDCItem({ trackingPricing: {} });
      (item as Record<string, unknown>).pricing = {
        dprice: [{ value: "$66,000" }],
      };
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(66000);
    });

    it("returns 0 for both when all pricing fields are missing", () => {
      const item = makeDDCItem({ trackingPricing: {} });
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(0);
    });

    it("returns 0 for both when trackingPricing is missing entirely", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).trackingPricing;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(0);
    });

    it("strips non-numeric characters from price strings (e.g. $72,000)", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: { msrp: "$72,000" },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(72000);
      expect(result[0].asking_price).toBe(72000); // falls back to msrp
    });

    it("uses askingPrice when msrp is '0'", () => {
      const data = wrapInventory([
        makeDDCItem({
          trackingPricing: {
            msrp: "0",
            askingPrice: "65000",
          },
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(65000);
    });
  });

  // -----------------------------------------------------------------------
  // Color cleanup
  // -----------------------------------------------------------------------
  describe("color cleanup", () => {
    it("removes ' Exterior' suffix from exterior color", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            { name: "exteriorColor", value: "Tanzanite Blue Exterior" },
            { name: "interiorColor", value: "Cognac Interior" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].exterior_color).toBe("Tanzanite Blue");
    });

    it("removes ' Interior' suffix from interior color", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            { name: "exteriorColor", value: "Alpine White" },
            { name: "interiorColor", value: "Cognac Interior" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].interior_color).toBe("Cognac");
    });

    it("preserves ' Metallic' in exterior color", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            { name: "exteriorColor", value: "Black Sapphire Metallic" },
            { name: "interiorColor", value: "Black" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].exterior_color).toBe("Black Sapphire Metallic");
    });

    it("cleans color with both Metallic and Exterior suffixes correctly", () => {
      // The regex removes " Exterior" from end, then the Metallic replace
      // preserves " Metallic". If the value is "Mineral White Metallic Exterior"
      // after removing " Exterior" we get "Mineral White Metallic"
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            {
              name: "exteriorColor",
              value: "Mineral White Metallic Exterior",
            },
            { name: "interiorColor", value: "Black" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      // .replace(/ Exterior$/, "") => "Mineral White Metallic"
      // .replace(/ Metallic$/, " Metallic") => "Mineral White Metallic" (no-op)
      expect(result[0].exterior_color).toBe("Mineral White Metallic");
    });
  });

  // -----------------------------------------------------------------------
  // Color from trackingAttributes fallback
  // -----------------------------------------------------------------------
  describe("color from trackingAttributes fallback", () => {
    it("uses trackingAttributes when attributes has no exteriorColor", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            { name: "bodyStyle", value: "SUV" },
            { name: "interiorColor", value: "Black" },
          ],
          trackingAttributes: [
            { name: "exteriorColor", value: "Phytonic Blue Exterior" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      // trackingAttributes value has " Exterior" stripped
      expect(result[0].exterior_color).toBe("Phytonic Blue");
    });

    it("uses trackingAttributes when attributes is empty", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [],
          trackingAttributes: [
            { name: "exteriorColor", value: "Alpine White Exterior" },
            { name: "interiorColor", value: "Oyster Interior" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].exterior_color).toBe("Alpine White");
      expect(result[0].interior_color).toBe("Oyster");
    });

    it("returns 'Unknown' when neither attributes nor trackingAttributes has color", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [],
          trackingAttributes: [],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].exterior_color).toBe("Unknown");
      expect(result[0].interior_color).toBe("Unknown");
    });

    it("returns 'Unknown' when attributes and trackingAttributes are both missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).attributes;
      delete (item as Record<string, unknown>).trackingAttributes;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].exterior_color).toBe("Unknown");
      expect(result[0].interior_color).toBe("Unknown");
    });
  });

  // -----------------------------------------------------------------------
  // Default make
  // -----------------------------------------------------------------------
  describe("default make", () => {
    it("uses item.make when present", () => {
      const data = wrapInventory([makeDDCItem({ make: "MINI" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].make).toBe("MINI");
    });

    it("falls back to dealer.defaultMake when item.make is missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).make;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].make).toBe("BMW");
    });

    it("falls back to dealer.defaultMake when item.make is empty string", () => {
      const data = wrapInventory([makeDDCItem({ make: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].make).toBe("BMW");
    });

    it("uses a non-BMW dealer defaultMake", () => {
      const audiDealer = {
        ...TEST_DEALER,
        name: "Audi of Stevens Creek",
        defaultMake: "Audi",
      };
      const data = wrapInventory([makeDDCItem({ make: "" })]);
      const result = parseDDCInventory(data, audiDealer);
      expect(result[0].make).toBe("Audi");
    });
  });

  // -----------------------------------------------------------------------
  // Status mapping
  // -----------------------------------------------------------------------
  describe("status mapping", () => {
    it("maps statusInt 0 to 'In Stock'", () => {
      const data = wrapInventory([makeDDCItem({ statusInt: 0 })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].status).toBe("In Stock");
    });

    it("maps statusInt 7 to 'In Transit'", () => {
      const data = wrapInventory([makeDDCItem({ statusInt: 7 })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].status).toBe("In Transit");
    });

    it("maps any non-7 statusInt to 'In Stock'", () => {
      const data = wrapInventory([makeDDCItem({ statusInt: 3 })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].status).toBe("In Stock");
    });

    it("maps undefined statusInt to 'In Stock'", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).statusInt;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].status).toBe("In Stock");
    });
  });

  // -----------------------------------------------------------------------
  // Detail URL construction
  // -----------------------------------------------------------------------
  describe("detail URL construction", () => {
    it("constructs URL from dealer.baseUrl + link when link is present", () => {
      const data = wrapInventory([
        makeDDCItem({ link: "/new-inventory/2025-bmw-x5-san-jose-ca/99999" }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.testbmw.com/new-inventory/2025-bmw-x5-san-jose-ca/99999"
      );
    });

    it("constructs fallback URL with VIN search when link is missing", () => {
      const data = wrapInventory([makeDDCItem({ link: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.testbmw.com/new-inventory/index.htm?search=WBA53EM09RCM12345"
      );
    });

    it("constructs fallback URL when link is undefined", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).link;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.testbmw.com/new-inventory/index.htm?search=WBA53EM09RCM12345"
      );
    });
  });

  // -----------------------------------------------------------------------
  // Multiple items — mix of valid/invalid
  // -----------------------------------------------------------------------
  describe("multiple items — mix of valid and invalid", () => {
    it("returns only valid items, skipping invalid ones", () => {
      const data = wrapInventory([
        makeDDCItem({ vin: "WBA11111111111111" }), // valid
        makeDDCItem({ vin: "" }), // invalid: no VIN
        makeDDCItem({ vin: "WBA22222222222222", model: "", trim: "" }), // invalid: no model or trim
        makeDDCItem({ vin: "WBA33333333333333" }), // valid
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result).toHaveLength(2);
      expect(result[0].vin).toBe("WBA11111111111111");
      expect(result[1].vin).toBe("WBA33333333333333");
    });
  });

  // -----------------------------------------------------------------------
  // Empty / null / missing inventory
  // -----------------------------------------------------------------------
  describe("empty inventory handling", () => {
    it("returns empty array for { inventory: [] }", () => {
      const result = parseDDCInventory({ inventory: [] }, TEST_DEALER);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty object {}", () => {
      const result = parseDDCInventory({}, TEST_DEALER);
      expect(result).toEqual([]);
    });

    it("returns empty array for null", () => {
      const result = parseDDCInventory(null, TEST_DEALER);
      expect(result).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      const result = parseDDCInventory(undefined, TEST_DEALER);
      expect(result).toEqual([]);
    });

    it("returns empty array when inventory key is not an array", () => {
      const result = parseDDCInventory({ inventory: "not-an-array" }, TEST_DEALER);
      // for..of on a string iterates characters, each will fail in try/catch
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Packages
  // -----------------------------------------------------------------------
  describe("packages", () => {
    it("passes through packages array", () => {
      const data = wrapInventory([
        makeDDCItem({
          packages: ["Premium Package", "M Sport Package", "Driving Assistance"],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].packages).toEqual([
        "Premium Package",
        "M Sport Package",
        "Driving Assistance",
      ]);
    });

    it("returns empty array when packages is missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).packages;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].packages).toEqual([]);
    });

    it("returns empty array when packages is empty", () => {
      const data = wrapInventory([makeDDCItem({ packages: [] })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].packages).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Mileage parsing
  // -----------------------------------------------------------------------
  describe("mileage parsing", () => {
    it("parses string mileage '10' to number 10", () => {
      const data = wrapInventory([makeDDCItem({ mileage: "10" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].mileage).toBe(10);
    });

    it("returns 0 when mileage is missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).mileage;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].mileage).toBe(0);
    });

    it("returns 0 when mileage is empty string", () => {
      const data = wrapInventory([makeDDCItem({ mileage: "" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].mileage).toBe(0);
    });

    it("parses numeric mileage", () => {
      const data = wrapInventory([makeDDCItem({ mileage: 5432 })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].mileage).toBe(5432);
    });

    it("parses string mileage with higher value", () => {
      const data = wrapInventory([makeDDCItem({ mileage: "25000" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].mileage).toBe(25000);
    });
  });

  // -----------------------------------------------------------------------
  // Year fallback
  // -----------------------------------------------------------------------
  describe("year fallback", () => {
    it("uses item.year when present", () => {
      const data = wrapInventory([makeDDCItem({ year: 2024 })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].year).toBe(2024);
    });

    it("falls back to current year when year is missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).year;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].year).toBe(new Date().getFullYear());
    });
  });

  // -----------------------------------------------------------------------
  // Stock number
  // -----------------------------------------------------------------------
  describe("stock number", () => {
    it("uses stockNumber from item", () => {
      const data = wrapInventory([makeDDCItem({ stockNumber: "ABC999" })]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].stock_number).toBe("ABC999");
    });

    it("returns empty string when stockNumber is missing", () => {
      const item = makeDDCItem();
      delete (item as Record<string, unknown>).stockNumber;
      const data = wrapInventory([item]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].stock_number).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // Condition
  // -----------------------------------------------------------------------
  describe("condition", () => {
    it("always sets condition to 'New'", () => {
      const data = wrapInventory([makeDDCItem()]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].condition).toBe("New");
    });
  });

  // -----------------------------------------------------------------------
  // Source and dealer info
  // -----------------------------------------------------------------------
  describe("source and dealer info", () => {
    it("always sets source to 'dealer_ddc'", () => {
      const data = wrapInventory([makeDDCItem()]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].source).toBe("dealer_ddc");
    });

    it("uses dealer name and city from config", () => {
      const dealer = {
        ...TEST_DEALER,
        name: "BMW of Fremont",
        city: "Fremont",
      };
      const data = wrapInventory([makeDDCItem()]);
      const result = parseDDCInventory(data, dealer);
      expect(result[0].dealer_name).toBe("BMW of Fremont");
      expect(result[0].dealer_city).toBe("Fremont");
    });
  });

  // -----------------------------------------------------------------------
  // Body style, drivetrain, engine, fuel type from attributes
  // -----------------------------------------------------------------------
  describe("vehicle attributes (body style, drivetrain, engine, fuel type)", () => {
    it("extracts all attributes from the attributes array", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [
            { name: "exteriorColor", value: "White" },
            { name: "interiorColor", value: "Black" },
            { name: "bodyStyle", value: "Sedan" },
            { name: "drivetrain", value: "RWD" },
            { name: "engine", value: "2.0L Turbo" },
            { name: "fuelType", value: "Electric" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].body_style).toBe("Sedan");
      expect(result[0].drivetrain).toBe("RWD");
      expect(result[0].engine).toBe("2.0L Turbo");
      expect(result[0].fuel_type).toBe("Electric");
    });

    it("falls back to trackingAttributes for vehicle attributes", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [],
          trackingAttributes: [
            { name: "bodyStyle", value: "Coupe" },
            { name: "drivetrain", value: "xDrive" },
            { name: "engine", value: "4.4L V8" },
            { name: "fuelType", value: "Hybrid" },
            { name: "exteriorColor", value: "Black" },
            { name: "interiorColor", value: "Tan" },
          ],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].body_style).toBe("Coupe");
      expect(result[0].drivetrain).toBe("xDrive");
      expect(result[0].engine).toBe("4.4L V8");
      expect(result[0].fuel_type).toBe("Hybrid");
    });

    it("returns empty strings when no attributes are available", () => {
      const data = wrapInventory([
        makeDDCItem({
          attributes: [],
          trackingAttributes: [],
        }),
      ]);
      const result = parseDDCInventory(data, TEST_DEALER);
      expect(result[0].body_style).toBe("");
      expect(result[0].drivetrain).toBe("");
      expect(result[0].engine).toBe("");
      expect(result[0].fuel_type).toBe("");
    });
  });
});
