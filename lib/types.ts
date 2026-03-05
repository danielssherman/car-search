export interface Vehicle {
  vin: string;
  year: number;
  model: string; // '330i' or 'M340i'
  trim: string; // e.g., '330i xDrive', 'M340i xDrive'
  exterior_color: string;
  interior_color: string;
  msrp: number;
  dealer_name: string;
  dealer_city: string;
  status: string; // 'In Stock' or 'In Transit'
  packages: string; // JSON array of package names
  stock_number: string;
  detail_url: string;
  first_seen: string;
  last_seen: string;
  last_scraped: string;
  removed_at: string | null;
}

export interface ScrapeLog {
  id: number;
  started_at: string;
  completed_at: string;
  vehicles_found: number;
  vehicles_new: number;
  status: string;
  error_message: string | null;
}

export interface InventoryFilters {
  model?: string;
  dealer?: string;
  color?: string;
  maxPrice?: number;
  minPrice?: number;
  status?: string;
  sort?: string;
  search?: string;
}

export interface InventoryStats {
  total: number;
  count_330i: number;
  count_m340i: number;
  avg_msrp: number;
  min_msrp: number;
  max_msrp: number;
  color_distribution: Record<string, number>;
}

export interface DealerInfo {
  dealer_name: string;
  dealer_city: string;
  vehicle_count: number;
}

export interface ScrapedVehicle {
  vin: string;
  year: number;
  model: string;
  trim: string;
  exterior_color: string;
  interior_color: string;
  msrp: number;
  dealer_name: string;
  dealer_city: string;
  status: string;
  packages: string[];
  stock_number: string;
  detail_url: string;
}
