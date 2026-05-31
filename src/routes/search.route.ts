import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { searchListings } from "../services/search.service";

function parseStringArray(val: unknown): string[] | undefined {
  if (val == null || val === "") return undefined;
  if (Array.isArray(val)) {
    return val.flatMap((v) => String(v).split(",").map((s) => s.trim()).filter(Boolean));
  }
  const parts = String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseBool(val: unknown): boolean | undefined {
  if (val == null || val === "") return undefined;
  const s = String(val).toLowerCase();
  if (s === "false" || s === "0") return false;
  if (s === "true" || s === "1") return true;
  return undefined;
}

const schema = z.object({
  city: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).optional(),
  children: z.coerce.number().int().min(0).optional(),
  rooms: z.coerce.number().int().min(1).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  propertyTypes: z.preprocess(parseStringArray, z.array(z.string()).optional()),
  amenities: z.preprocess(parseStringArray, z.array(z.string()).optional()),
  sort: z
    .enum(["price_asc", "price_desc", "rating", "popularity", "distance"])
    .optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  bounds: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  includeMapPins: z.preprocess(parseBool, z.boolean().optional()),
});

export const searchRouter = Router();

searchRouter.get("/search", async (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.fail(400, "Invalid search query", {
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const q = parsed.data;
  const result = await searchListings({
    city: q.city,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    adults: q.adults,
    children: q.children,
    rooms: q.rooms,
    priceMin: q.priceMin,
    priceMax: q.priceMax,
    ratingMin: q.ratingMin,
    propertyTypes: q.propertyTypes,
    amenities: q.amenities,
    sort: q.sort,
    lat: q.lat,
    lng: q.lng,
    bounds: q.bounds,
    page: q.page,
    limit: q.limit,
    includeMapPins: q.includeMapPins,
  });

  if (!result) {
    res.fail(404, "City not found");
    return;
  }

  res.set("Cache-Control", `private, max-age=${config.cache.searchTtlSeconds}`);
  res.success(result, {
    page: q.page ?? 1,
    limit: Math.min(q.limit ?? 20, 50),
    total: result.total,
  });
});
