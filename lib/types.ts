export interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  drivetrain: string;
  engine: string;
  fuel_type: string;
  mileage: number;
  condition: string; // 'New', 'Used', 'CPO'
  exterior_color: string;
  interior_color: string;
  quality_score: number;
  first_seen: string;
  last_seen: string;
  removed_at: string | null;
  // From best listing (JOIN)
  price: number;
  msrp: number;
  source: string;
  dealer_name: string;
  dealer_city: string;
  status: string; // 'In Stock' or 'In Transit'
  detail_url: string;
  stock_number: string;
  packages: string; // JSON array of package names
  listing_count: number;
}

export interface Listing {
  id: number;
  vin: string;
  source: string;
  dealer_name: string;
  dealer_city: string;
  price: number;
  msrp: number;
  status: string;
  detail_url: string;
  stock_number: string;
  packages: string;
  first_seen: string;
  last_seen: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: number;
  vin: string;
  source: string;
  dealer_name: string;
  price: number;
  recorded_at: string;
}

export interface ScrapeLog {
  id: number;
  started_at: string;
  completed_at: string;
  vehicles_found: number;
  vehicles_new: number;
  status: string;
  error_message: string | null;
  source: string | null;
}

export interface InventoryFilters {
  make?: string;
  model?: string;
  models?: string[]; // multi-model filter for AI search (e.g., ["X5", "X7", "X3"])
  dealer?: string;
  color?: string;
  condition?: string;
  maxPrice?: number;
  minPrice?: number;
  status?: string;
  sort?: string;
  search?: string;
  limit?: number;
}

export interface AISearchResponse {
  filters: InventoryFilters;
  vehicles: Vehicle[];
  explanation: string;
  query: string;
}

export interface InventoryStats {
  total: number;
  count_by_make: Record<string, number>;
  total_dealers: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  color_distribution: Record<string, number>;
  makes: string[];
  models: string[];
}

export interface DealerInfo {
  dealer_name: string;
  dealer_city: string;
  vehicle_count: number;
}

export interface ScrapedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  drivetrain: string;
  engine: string;
  fuel_type: string;
  mileage: number;
  condition: string;
  exterior_color: string;
  interior_color: string;
  msrp: number;
  source: string;
  dealer_name: string;
  dealer_city: string;
  status: string;
  packages: string[];
  stock_number: string;
  detail_url: string;
}
