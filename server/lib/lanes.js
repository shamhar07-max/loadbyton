// The unified lane index — the single source of truth behind the public Lane
// Index, the rate estimator, and the route optimizer. In a real deployment
// this would be fed by historical job data; here it's a curated seed table
// that the rest of the product treats as ground truth.

const unifiedLanes = [
  { terminal: 'JEBEL_ALI_T1', area: 'AL_QUOZ', distanceKm: 21, basePriceAed: 850, pricePerKm: 12, baseMinutes: 45, onTimePct: 94, monthlyLoads: 120 },
  { terminal: 'JEBEL_ALI_T2', area: 'JAFZA_SOUTH', distanceKm: 8, basePriceAed: 450, pricePerKm: 10, baseMinutes: 25, onTimePct: 96, monthlyLoads: 210 },
  { terminal: 'JEBEL_ALI_T4', area: 'DUBAI_SOUTH', distanceKm: 14, basePriceAed: 600, pricePerKm: 11, baseMinutes: 30, onTimePct: 91, monthlyLoads: 95 },
  { terminal: 'JEBEL_ALI_T1', area: 'DIP', distanceKm: 33, basePriceAed: 1150, pricePerKm: 13, baseMinutes: 55, onTimePct: 89, monthlyLoads: 60 },
  { terminal: 'JEBEL_ALI_T2', area: 'AL_QUSAIS', distanceKm: 45, basePriceAed: 1450, pricePerKm: 14, baseMinutes: 70, onTimePct: 87, monthlyLoads: 40 },
  { terminal: 'KHALIFA_PORT', area: 'MUSAFFAH', distanceKm: 27, basePriceAed: 980, pricePerKm: 12.5, baseMinutes: 48, onTimePct: 92, monthlyLoads: 55 },
  { terminal: 'PORT_KHALID', area: 'SHARJAH_INDUSTRIAL', distanceKm: 18, basePriceAed: 780, pricePerKm: 11.5, baseMinutes: 40, onTimePct: 90, monthlyLoads: 48 },
  { terminal: 'FUJAIRAH_PORT', area: 'FUJAIRAH_FREEZONE', distanceKm: 12, basePriceAed: 620, pricePerKm: 13.5, baseMinutes: 32, onTimePct: 93, monthlyLoads: 33 },
].map((lane) => ({ ...lane, laneId: `${lane.terminal}:${lane.area}` }));

function findLane(terminal, area) {
  return (
    unifiedLanes.find((l) => l.terminal === terminal && l.area === area) ||
    unifiedLanes.find((l) => l.terminal === terminal) ||
    unifiedLanes[0]
  );
}

function urgencyMultiplier(urgency) {
  if (urgency === 'express') return 1.3;
  if (urgency === 'urgent') return 1.15;
  return 1.0;
}

function weightMultiplier(weightTons) {
  const w = Number(weightTons) || 0;
  if (w > 20) return 1.2;
  if (w > 10) return 1.1;
  return 1.0;
}

function estimateRate({ terminal, area, weightTons, urgency, quantity }) {
  const lane = findLane(terminal, area);
  const wMod = weightMultiplier(weightTons);
  const uMod = urgencyMultiplier(urgency);
  const qty = Math.max(1, Number(quantity) || 1);
  const estimatedAED = Math.round(lane.basePriceAed * wMod * uMod * qty);
  return {
    estimatedAED,
    base: lane.basePriceAed,
    weightTons: Number(weightTons) || 0,
    urgencyMod: uMod,
    quantity: qty,
    methodology: `Lane index base AED ${lane.basePriceAed} for ${lane.laneId} × weight factor ${wMod.toFixed(2)} (>10t: ×1.1, >20t: ×1.2) × urgency factor ${uMod.toFixed(2)} (express ×1.3, urgent ×1.15, standard ×1.0)${qty > 1 ? ` × volume ×${qty} (${qty} units in this inquiry)` : ''}.`,
  };
}

function optimizeRoute({ terminal, area, waypoints = [], priority = 'balanced' }) {
  const lane = findLane(terminal, area);
  const extra = Math.max(0, waypoints.length) * 3.5;
  const distance_km = Math.round((lane.distanceKm + extra) * 10) / 10;
  const speedFactor = priority === 'fastest' ? 0.85 : priority === 'cheapest' ? 1.15 : 1.0;
  const estimated_time_min = Math.round((lane.baseMinutes + waypoints.length * 6) * speedFactor);
  const fuel_cost_aed = Math.round(distance_km * 1.85 * 100) / 100;
  const standardDistance = lane.distanceKm + waypoints.length * 5;
  const savings_vs_standard = Math.max(0, Math.round(((standardDistance - distance_km) / standardDistance) * 1000) / 10);
  return {
    optimized: {
      route: `${lane.terminal} → ${waypoints.length ? waypoints.join(' → ') + ' → ' : ''}${lane.area}`,
      distance_km,
      estimated_time_min,
      fuel_cost_aed,
      waypoints,
      savings_vs_standard,
      priority,
      created_at: new Date().toISOString(),
    },
  };
}

module.exports = { unifiedLanes, findLane, estimateRate, optimizeRoute };
