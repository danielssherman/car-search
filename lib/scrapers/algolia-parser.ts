import type { ScrapedVehicle } from "../types";

export interface AlgoliaDealerInfo {
  name: string;
  city: string;
  baseUrl: string;
  defaultMake: string;
}

/**
 * Parse an array of Algolia hits into ScrapedVehicle objects.
 * Skips hits that are missing a VIN or both model and trim.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAlgoliaHits(hits: any[], dealer: AlgoliaDealerInfo): ScrapedVehicle[] {
  const vehicles: ScrapedVehicle[] = [];

  for (const hit of hits) {
    const vin = hit.vin || "";
    if (!vin) continue;

    const make = hit.make || dealer.defaultMake;
    const model = hit.model || "";
    const trim = hit.trim || model;
    if (!model && !trim) continue;

    let msrp = parseInt(String(hit.msrp || 0).replace(/[^0-9]/g, ""));
    if (!msrp) {
      msrp = parseInt(String(hit.our_price || 0).replace(/[^0-9]/g, ""));
    }

    const link = hit.link || "";
    const detailUrl = link || `${dealer.baseUrl}/new-vehicles/?vin=${vin}`;

    vehicles.push({
      vin,
      year: hit.year || new Date().getFullYear(),
      make,
      model,
      trim,
      body_style: hit.body_style || "",
      drivetrain: hit.drivetrain || "",
      engine: hit.engine || "",
      fuel_type: hit.fuel || "",
      mileage: parseInt(String(hit.mileage || "0")) || 0,
      condition: "New",
      exterior_color: hit.ext_color || "Unknown",
      interior_color: hit.int_color || "Unknown",
      msrp,
      source: "dealer_algolia",
      dealer_name: dealer.name,
      dealer_city: dealer.city,
      status: hit.in_transit ? "In Transit" : "In Stock",
      packages: hit.packages || [],
      stock_number: hit.stock || "",
      detail_url: detailUrl,
    });
  }

  return vehicles;
}
