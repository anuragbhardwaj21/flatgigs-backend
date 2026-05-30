const MAP: Record<string, string> = {
  wifi: "wifi",
  wireless: "wifi",
  "wi-fi": "wifi",
  kitchen: "kitchen",
  pool: "pool",
  parking: "parking",
  "free parking": "parking",
  washer: "washer",
  dryer: "dryer",
  ac: "ac",
  "air conditioning": "ac",
  heating: "heating",
  tv: "tv",
  elevator: "elevator",
  gym: "gym",
  breakfast: "breakfast",
  pets: "pets",
  "pets allowed": "pets",
  workspace: "workspace",
  dishwasher: "dishwasher",
};

export function normalizeAmenities(raw: string): string[] {
  let items: string[] = [];
  try {
    const parsed = JSON.parse(raw.replace(/'/g, '"')) as string[];
    items = parsed;
  } catch {
    items = raw.split(",").map((s) => s.trim());
  }

  const out = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, " ");
    for (const [needle, canonical] of Object.entries(MAP)) {
      if (key.includes(needle)) {
        out.add(canonical);
      }
    }
  }
  return [...out];
}
