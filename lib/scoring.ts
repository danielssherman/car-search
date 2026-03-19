export function calculateQualityScore(
  vehicle: {
    price: number;
    first_seen: string;
    mileage: number;
    condition: string;
    status: string;
    packages: string;
  },
  marketAvg: number
): number {
  let score = 0;

  // Price vs market average (0-35 points)
  // Below market = higher score, above = lower
  if (marketAvg > 0 && vehicle.price > 0) {
    const pctDiff = (marketAvg - vehicle.price) / marketAvg;
    // 20% below market -> 35pts, at market -> 17.5pts, 20% above -> 0pts
    score += Math.max(0, Math.min(35, 17.5 + pctDiff * 87.5));
  } else {
    score += 17;
  }

  // Days on lot (0-20 points) — longer sitting = more negotiating leverage
  const days = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(vehicle.first_seen).getTime()) / 86400000
    )
  );
  score += Math.min(20, days * 0.33);

  // Condition (0-15 points)
  if (vehicle.condition === "New") score += 15;
  else if (vehicle.condition === "CPO") score += 10;
  else score += 5;

  // Mileage (0-10 points) — lower is better for used/CPO
  if (vehicle.condition === "New") {
    score += 10;
  } else {
    const m = vehicle.mileage || 0;
    if (m < 15000) score += 10;
    else if (m < 30000) score += 7;
    else if (m < 60000) score += 4;
    else score += 1;
  }

  // In stock (0-10 points)
  if (vehicle.status === "In Stock") score += 10;
  else score += 3;

  // Packages/features (0-10 points)
  let pkgCount = 0;
  try {
    pkgCount = JSON.parse(vehicle.packages || "[]").length;
  } catch (err) {
    console.warn(`[Scoring] Bad packages JSON: ${(err as Error).message}`);
  }
  score += Math.min(10, pkgCount * 2);

  return Math.max(0, Math.min(100, Math.round(score)));
}
