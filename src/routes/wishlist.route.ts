import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export const wishlistRouter = Router();

wishlistRouter.get("/wishlist", async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where: { token: req.token! },
    orderBy: { createdAt: "desc" },
    select: { listingId: true, createdAt: true },
  });
  res.success({ listingIds: items.map((i) => i.listingId) });
});

wishlistRouter.post("/wishlist", async (req, res) => {
  const body = z.object({ listingId: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.fail(400, "listingId is required");
    return;
  }

  const listing = await prisma.listing.findUnique({ where: { id: body.data.listingId } });
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

  res.success({ listingId: body.data.listingId }, { code: 201, message: "Added" });
});

wishlistRouter.delete("/wishlist/:listingId", async (req, res) => {
  await prisma.wishlistItem.deleteMany({
    where: { token: req.token!, listingId: req.params.listingId },
  });
  res.success({ removed: req.params.listingId });
});
