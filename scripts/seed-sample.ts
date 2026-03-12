import { getDb, upsertVehicles, logScrape } from "../lib/db";
import type { ScrapedVehicle } from "../lib/types";

const COLORS = [
  "Alpine White",
  "Black Sapphire",
  "Mineral White",
  "Portimao Blue",
  "Brooklyn Grey",
  "Tanzanite Blue",
  "Dravit Grey",
  "Sunset Orange",
  "Skyscraper Grey",
  "Isle of Man Green",
];

const INTERIOR_COLORS = [
  "Black Vernasca Leather",
  "Oyster Vernasca Leather",
  "Cognac Vernasca Leather",
  "Black SensaTec",
  "Mocha Vernasca Leather",
];

const DEALERS = [
  { name: "BMW of San Francisco", city: "San Francisco" },
  { name: "Stevens Creek BMW", city: "San Jose" },
  { name: "BMW of Fremont", city: "Fremont" },
  { name: "Peter Pan BMW", city: "San Mateo" },
  { name: "East Bay BMW", city: "Pleasanton" },
  { name: "Marin BMW", city: "Corte Madera" },
  { name: "Napa Valley BMW", city: "Napa" },
];

const TRIMS = [
  { model: "330i", trim: "330i", basePrice: 43900 },
  { model: "330i", trim: "330i xDrive", basePrice: 45900 },
  { model: "M340i", trim: "M340i", basePrice: 56600 },
  { model: "M340i", trim: "M340i xDrive", basePrice: 58600 },
];

const PACKAGES = [
  ["M Sport", "Premium", "Technology"],
  ["Premium", "Convenience"],
  ["M Sport", "Executive"],
  ["Technology", "Driving Assistance"],
  ["M Sport"],
  ["Premium"],
  [],
  ["M Sport", "Premium", "Technology", "Parking Assistance"],
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomVin(): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let vin = "WBA";
  for (let i = 0; i < 14; i++) {
    vin += chars[Math.floor(Math.random() * chars.length)];
  }
  return vin;
}

function main() {
  // Ensure DB is initialized
  getDb();

  const vehicles: ScrapedVehicle[] = [];
  const count = 45 + Math.floor(Math.random() * 20);

  for (let i = 0; i < count; i++) {
    const trimInfo = randomItem(TRIMS);
    const pkgs = randomItem(PACKAGES);
    const pkgAdder = pkgs.length * 1200 + Math.floor(Math.random() * 2000);
    const dealer = randomItem(DEALERS);

    vehicles.push({
      vin: randomVin(),
      year: Math.random() > 0.3 ? 2025 : 2026,
      make: "BMW",
      model: trimInfo.model,
      trim: trimInfo.trim,
      body_style: "Sedan",
      drivetrain: trimInfo.trim.includes("xDrive") ? "AWD" : "RWD",
      engine: trimInfo.model === "M340i" ? "3.0L Turbo I6" : "2.0L Turbo I4",
      fuel_type: "Gasoline",
      mileage: 0,
      condition: "New",
      exterior_color: randomItem(COLORS),
      interior_color: randomItem(INTERIOR_COLORS),
      msrp: trimInfo.basePrice + pkgAdder,
      source: "dealer_ddc",
      dealer_name: dealer.name,
      dealer_city: dealer.city,
      status: Math.random() > 0.35 ? "In Stock" : "In Transit",
      packages: pkgs,
      stock_number: `BMW${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`,
      detail_url: `https://www.bmwusa.com/inventory/details/${randomVin()}`,
    });
  }

  const result = upsertVehicles(vehicles);

  logScrape({
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    vehicles_found: result.found,
    vehicles_new: result.newCount,
    status: "success",
    error_message: null,
    source: null,
  });

  console.log(
    `Seeded ${result.found} sample vehicles (${result.newCount} new)`
  );
}

main();
