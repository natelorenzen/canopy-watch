// Display names + map colors for forest-alerts drivers (rubric §3). Colors are chosen to stay
// distinct on the dark satellite basemap.
export const DRIVER_META: Record<string, { label: string; color: string }> = {
  pasture_or_crops: { label: "Pasture / crops", color: "#f2a33a" },
  mining: { label: "Mining", color: "#e05bd6" },
  road: { label: "Road", color: "#f5e663" },
  selective_logging: { label: "Selective logging", color: "#ff7a59" },
  fire: { label: "Fire", color: "#ff3b30" },
  plantation_harvest: { label: "Plantation harvest", color: "#b38cff" },
  natural: { label: "Natural", color: "#4fc3f7" },
  urban_or_infrastructure: { label: "Urban / infrastructure", color: "#cfd8dc" },
  mixed: { label: "Mixed", color: "#ff8a80" },
  unknown: { label: "Unknown cause", color: "#ff8a80" },
};

export const LABEL_META: Record<string, { label: string; color: string }> = {
  clearing_confirmed: { label: "Clearing confirmed", color: "#ff6b4a" },
  no_clearing: { label: "No clearing", color: "#5fd38a" },
  uncertain: { label: "Uncertain", color: "#9aa59c" },
};

export function driverLabel(d?: string | null) {
  return (d && DRIVER_META[d]?.label) || "Unknown cause";
}

const REGIONS: Record<string, string> = { rondonia: "Rondônia, Brazil", "para-br163": "Pará, Brazil" };
export function regionLabel(r?: string | null) {
  return (r && REGIONS[r]) || "Brazilian Amazon";
}
