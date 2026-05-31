import { prisma } from "../lib/prisma";
import { config } from "../config";
import { cacheGet, cacheSet } from "../lib/cache";

const CITIES_CACHE_KEY = "cities:v1";

export type CitySummary = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  boundsNe: number | null;
  boundsNeLng: number | null;
  boundsSw: number | null;
  boundsSwLng: number | null;
};

export async function getCities(): Promise<CitySummary[]> {
  const cached = await cacheGet<CitySummary[]>(CITIES_CACHE_KEY);
  if (cached) return cached;

  const cities = await prisma.city.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      country: true,
      boundsNe: true,
      boundsNeLng: true,
      boundsSw: true,
      boundsSwLng: true,
    },
  });

  await cacheSet(CITIES_CACHE_KEY, cities, config.cache.citiesTtlSeconds);
  return cities;
}
