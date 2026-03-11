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
  msrp: number;
  dealer_name: string;
  dealer_city: string;
  status: string; // 'In Stock' or 'In Transit'
  packages: string; // JSON array of package names
  stock_number: string;
  detail_url: string;
  quality_score: number;
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
  make?: string;
  model?: string;
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

export interface InventoryStats {
  total: number;
  count_by_make: Record<string, number>;
  total_dealers: number;
  avg_msrp: number;
  min_msrp: number;
  max_msrp: number;
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
  dealer_name: string;
  dealer_city: string;
  status: string;
  packages: string[];
  stock_number: string;
  detail_url: string;
}
