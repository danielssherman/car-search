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
  // From price_trends CTE (JOIN)
  price_trend: 'up' | 'down' | 'stable' | null;
  price_change_amount: number | null;
  price_change_date: string | null;
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
  models?: string[];
  dealer?: string;
  dealers?: string[];
  color?: string;
  colors?: string[];
  condition?: string;
  conditions?: string[];
  maxPrice?: number;
  minPrice?: number;
  status?: string;
  sort?: string;
  search?: string;
  limit?: number;
  offset?: number;
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
  count_by_model: Record<string, number>;
  count_by_condition: Record<string, number>;
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

export interface PriceHistorySummary {
  has_changes: boolean;
  change_count: number;
  first_price: number;
  latest_price: number;
  min_price: number;
  max_price: number;
  total_change: number;
  first_recorded: string;
  latest_recorded: string;
}

export interface PriceHistoryResponse {
  vin: string;
  total: number;
  history: PriceHistory[];
  summary: PriceHistorySummary | null;
}

export interface SourceHealth {
  last_success: string | null;
  last_vehicles: number;
  successes: number;
  errors: number;
  total_runs: number;
}

export interface ScrapeHealthResponse {
  last_successful_scrape: string | null;
  active_vehicles: number;
  removed_vehicles: number;
  recent_scrapes: ScrapeLog[];
  source_health: Record<string, SourceHealth>;
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
  asking_price: number;
  source: string;
  dealer_name: string;
  dealer_city: string;
  status: string;
  packages: string[];
  stock_number: string;
  detail_url: string;
}
