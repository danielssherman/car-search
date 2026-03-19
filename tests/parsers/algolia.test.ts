import { describe, it, expect } from "vitest";
import { parseAlgoliaHits, type AlgoliaDealerInfo } from "@/lib/scrapers/algolia-parser";

const DEFAULT_DEALER: AlgoliaDealerInfo = {
  name: "Peter Pan BMW",
  city: "San Mateo",
  baseUrl: "https://www.peterpanbmw.com",
  defaultMake: "BMW",
};

/** Build a complete Algolia hit with sensible defaults; override any field. */
function makeAlgoliaHit(overrides: Record<string, unknown> = {}) {
  return {
    vin: "WBA53BJ04RWW12345",
    year: 2025,
    make: "BMW",
    model: "3 Series",
    trim: "330i",
    body_style: "Sedan",
    drivetrain: "RWD",
    engine: "2.0L Turbo",
    fuel: "Gas",
    mileage: "5",
    ext_color: "Alpine White",
    int_color: "Black",
    msrp: "48000",
    our_price: "46500",
    type: "New",
    in_transit: false,
    packages: ["Premium Package"],
    stock: "B12345",
    link: "https://www.peterpanbmw.com/new-vehicles/2025-bmw-330i/12345",
    ...overrides,
  };
}

describe("parseAlgoliaHits", () => {
  describe("happy path", () => {
    it("parses a complete hit into a correct ScrapedVehicle", () => {
      const hits = [makeAlgoliaHit()];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);

      expect(result).toHaveLength(1);
      const v = result[0];
      expect(v.vin).toBe("WBA53BJ04RWW12345");
      expect(v.year).toBe(2025);
      expect(v.make).toBe("BMW");
      expect(v.model).toBe("3 Series");
      expect(v.trim).toBe("330i");
      expect(v.body_style).toBe("Sedan");
      expect(v.drivetrain).toBe("RWD");
      expect(v.engine).toBe("2.0L Turbo");
      expect(v.fuel_type).toBe("Gas");
      expect(v.mileage).toBe(5);
      expect(v.condition).toBe("New");
      expect(v.exterior_color).toBe("Alpine White");
      expect(v.interior_color).toBe("Black");
      expect(v.msrp).toBe(48000);
      expect(v.asking_price).toBe(46500);
      expect(v.source).toBe("dealer_algolia");
      expect(v.dealer_name).toBe("Peter Pan BMW");
      expect(v.dealer_city).toBe("San Mateo");
      expect(v.status).toBe("In Stock");
      expect(v.packages).toEqual(["Premium Package"]);
      expect(v.stock_number).toBe("B12345");
      expect(v.detail_url).toBe(
        "https://www.peterpanbmw.com/new-vehicles/2025-bmw-330i/12345"
      );
    });
  });

  describe("missing VIN", () => {
    it("skips a hit with empty vin string", () => {
      const hits = [makeAlgoliaHit({ vin: "" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips a hit with no vin property", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).vin;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips a hit with vin = null", () => {
      const hits = [makeAlgoliaHit({ vin: null })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(0);
    });
  });

  describe("missing model AND trim", () => {
    it("skips a hit when both model and trim are empty", () => {
      const hits = [makeAlgoliaHit({ model: "", trim: "" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(0);
    });

    it("skips a hit when both model and trim are missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).model;
      delete (hit as Record<string, unknown>).trim;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result).toHaveLength(0);
    });

    it("keeps a hit with model but no trim (trim defaults to model)", () => {
      const hits = [makeAlgoliaHit({ model: "X5", trim: "" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("X5");
      expect(result[0].trim).toBe("X5");
    });

    it("keeps a hit with trim but no model", () => {
      const hits = [makeAlgoliaHit({ model: "", trim: "xDrive40i" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("");
      expect(result[0].trim).toBe("xDrive40i");
    });
  });

  describe("price separation (msrp vs asking_price)", () => {
    it("separates msrp and asking_price when both present", () => {
      const hits = [makeAlgoliaHit({ msrp: "55000", our_price: "53000" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].msrp).toBe(55000);
      expect(result[0].asking_price).toBe(53000);
    });

    it("uses our_price as asking_price when msrp is 0", () => {
      const hits = [makeAlgoliaHit({ msrp: "0", our_price: "53000" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(53000);
    });

    it("uses our_price as asking_price when msrp is missing", () => {
      const hit = makeAlgoliaHit({ our_price: "42000" });
      delete (hit as Record<string, unknown>).msrp;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(42000);
    });

    it("uses our_price as asking_price when msrp is empty string", () => {
      const hits = [makeAlgoliaHit({ msrp: "", our_price: "42000" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(42000);
    });

    it("returns 0 for both when both msrp and our_price are missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).msrp;
      delete (hit as Record<string, unknown>).our_price;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].msrp).toBe(0);
      expect(result[0].asking_price).toBe(0);
    });

    it("handles prices with commas and dollar signs", () => {
      const hits = [makeAlgoliaHit({ msrp: "$55,000", our_price: "53000" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].msrp).toBe(55000);
      expect(result[0].asking_price).toBe(53000);
    });

    it("falls back asking_price to msrp when our_price is missing", () => {
      const hit = makeAlgoliaHit({ msrp: 48000 });
      delete (hit as Record<string, unknown>).our_price;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].msrp).toBe(48000);
      expect(result[0].asking_price).toBe(48000);
    });
  });

  describe("default make", () => {
    it("uses hit.make when present", () => {
      const hits = [makeAlgoliaHit({ make: "MINI" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].make).toBe("MINI");
    });

    it("uses dealer.defaultMake when hit.make is missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).make;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].make).toBe("BMW");
    });

    it("uses dealer.defaultMake when hit.make is empty string", () => {
      const hits = [makeAlgoliaHit({ make: "" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].make).toBe("BMW");
    });

    it("uses a custom dealer defaultMake", () => {
      const dealer: AlgoliaDealerInfo = {
        ...DEFAULT_DEALER,
        defaultMake: "Mercedes-Benz",
      };
      const hits = [makeAlgoliaHit({ make: "" })];
      const result = parseAlgoliaHits(hits, dealer);
      expect(result[0].make).toBe("Mercedes-Benz");
    });
  });

  describe("status mapping", () => {
    it("maps in_transit=false to 'In Stock'", () => {
      const hits = [makeAlgoliaHit({ in_transit: false })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].status).toBe("In Stock");
    });

    it("maps in_transit=true to 'In Transit'", () => {
      const hits = [makeAlgoliaHit({ in_transit: true })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].status).toBe("In Transit");
    });

    it("maps missing in_transit to 'In Stock'", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).in_transit;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].status).toBe("In Stock");
    });

    it("maps in_transit=undefined to 'In Stock'", () => {
      const hits = [makeAlgoliaHit({ in_transit: undefined })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].status).toBe("In Stock");
    });
  });

  describe("detail URL", () => {
    it("uses hit.link when present", () => {
      const hits = [
        makeAlgoliaHit({
          link: "https://www.peterpanbmw.com/custom-link/12345",
        }),
      ];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.peterpanbmw.com/custom-link/12345"
      );
    });

    it("falls back to baseUrl + vin when link is missing", () => {
      const hit = makeAlgoliaHit({ vin: "WBA11111111111111" });
      delete (hit as Record<string, unknown>).link;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.peterpanbmw.com/new-vehicles/?vin=WBA11111111111111"
      );
    });

    it("falls back to baseUrl + vin when link is empty string", () => {
      const hits = [
        makeAlgoliaHit({ vin: "WBA22222222222222", link: "" }),
      ];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].detail_url).toBe(
        "https://www.peterpanbmw.com/new-vehicles/?vin=WBA22222222222222"
      );
    });

    it("uses the correct dealer baseUrl for fallback", () => {
      const dealer: AlgoliaDealerInfo = {
        ...DEFAULT_DEALER,
        baseUrl: "https://www.bmwsf.com",
      };
      const hits = [makeAlgoliaHit({ vin: "WBA33333333333333", link: "" })];
      const result = parseAlgoliaHits(hits, dealer);
      expect(result[0].detail_url).toBe(
        "https://www.bmwsf.com/new-vehicles/?vin=WBA33333333333333"
      );
    });
  });

  describe("multiple hits (mix of valid/invalid)", () => {
    it("returns only valid vehicles, skipping invalid ones", () => {
      const hits = [
        makeAlgoliaHit({ vin: "VALID1" }),
        makeAlgoliaHit({ vin: "" }), // missing VIN — skipped
        makeAlgoliaHit({ vin: "VALID2", model: "", trim: "" }), // no model/trim — skipped
        makeAlgoliaHit({ vin: "VALID3" }),
      ];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result).toHaveLength(2);
      expect(result[0].vin).toBe("VALID1");
      expect(result[1].vin).toBe("VALID3");
    });
  });

  describe("empty array", () => {
    it("returns empty array for empty input", () => {
      const result = parseAlgoliaHits([], DEFAULT_DEALER);
      expect(result).toEqual([]);
    });
  });

  describe("packages", () => {
    it("passes through packages array", () => {
      const hits = [
        makeAlgoliaHit({
          packages: ["Premium Package", "M Sport Package", "Driving Assistance"],
        }),
      ];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].packages).toEqual([
        "Premium Package",
        "M Sport Package",
        "Driving Assistance",
      ]);
    });

    it("returns empty array when packages missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).packages;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].packages).toEqual([]);
    });

    it("returns empty array when packages is null", () => {
      const hits = [makeAlgoliaHit({ packages: null })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].packages).toEqual([]);
    });

    it("passes through empty packages array", () => {
      const hits = [makeAlgoliaHit({ packages: [] })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].packages).toEqual([]);
    });
  });

  describe("mileage parsing", () => {
    it("parses string mileage '5' to number 5", () => {
      const hits = [makeAlgoliaHit({ mileage: "5" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].mileage).toBe(5);
    });

    it("parses string mileage '12500' to number 12500", () => {
      const hits = [makeAlgoliaHit({ mileage: "12500" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].mileage).toBe(12500);
    });

    it("returns 0 when mileage is missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).mileage;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].mileage).toBe(0);
    });

    it("returns 0 when mileage is empty string", () => {
      const hits = [makeAlgoliaHit({ mileage: "" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].mileage).toBe(0);
    });

    it("handles numeric mileage", () => {
      const hits = [makeAlgoliaHit({ mileage: 100 })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].mileage).toBe(100);
    });
  });

  describe("missing optional fields", () => {
    it("defaults body_style to empty string when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).body_style;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].body_style).toBe("");
    });

    it("defaults drivetrain to empty string when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).drivetrain;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].drivetrain).toBe("");
    });

    it("defaults engine to empty string when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).engine;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].engine).toBe("");
    });

    it("defaults fuel_type to empty string when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).fuel;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].fuel_type).toBe("");
    });

    it("defaults exterior_color to 'Unknown' when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).ext_color;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].exterior_color).toBe("Unknown");
    });

    it("defaults interior_color to 'Unknown' when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).int_color;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].interior_color).toBe("Unknown");
    });

    it("defaults stock_number to empty string when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).stock;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].stock_number).toBe("");
    });

    it("defaults year to current year when missing", () => {
      const hit = makeAlgoliaHit();
      delete (hit as Record<string, unknown>).year;
      const result = parseAlgoliaHits([hit], DEFAULT_DEALER);
      expect(result[0].year).toBe(new Date().getFullYear());
    });

    it("always sets condition to 'New'", () => {
      const hits = [makeAlgoliaHit({ type: "Used" })];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].condition).toBe("New");
    });

    it("always sets source to 'dealer_algolia'", () => {
      const hits = [makeAlgoliaHit()];
      const result = parseAlgoliaHits(hits, DEFAULT_DEALER);
      expect(result[0].source).toBe("dealer_algolia");
    });
  });
});
