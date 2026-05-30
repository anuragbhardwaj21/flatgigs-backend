import { Router } from "express";
import { z } from "zod";
import { searchListings } from "../services/search.service";

const schema = z.object({
  city: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().optional(),
  children: z.number().optional(),
  rooms: z.number().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  ratingMin: z.number().optional(),
  propertyTypes: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  sort: z
    .enum(["price_asc", "price_desc", "rating", "popularity", "distance"])
    .optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  bounds: z.string().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
  includeMapPins: z.boolean().optional(),
});

export const searchRouter = Router();

searchRouter.post("/search", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.fail(400, "Invalid search body", {
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

  res.success(result, {
    page: q.page ?? 1,
    limit: Math.min(q.limit ?? 20, 50),
    total: result.total,
  });
});
