import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getListingById, getWishlistListings, wishlistCacheKey } from "../services/listing.service";
import { cacheDel } from "../lib/cache";

export const wishlistRouter = Router();

wishlistRouter.get("/wishlist", async (req, res) => {
  const items = await getWishlistListings(req.token!);
  res.success({ items, total: items.length });
});

wishlistRouter.post("/wishlist", async (req, res) => {
  const body = z.object({ listingId: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.fail(400, "listingId is required");
    return;
  }

  const listing = await getListingById(body.data.listingId);
  if (!listing) {
    res.fail(404, "Listing not found");
    return;
  }

  await prisma.wishlistItem.upsert({
    where: {
      token_listingId: { token: req.token!, listingId: body.data.listingId },
    },
    create: { token: req.token!, listingId: body.data.listingId },
    update: {},
  });

  await cacheDel(wishlistCacheKey(req.token!));

  res.success({ listingId: body.data.listingId }, { code: 201, message: "Added" });
});

wishlistRouter.delete("/wishlist/:listingId", async (req, res) => {
  await prisma.wishlistItem.deleteMany({
    where: { token: req.token!, listingId: req.params.listingId },
  });
  await cacheDel(wishlistCacheKey(req.token!));
  res.success({ removed: req.params.listingId });
});
