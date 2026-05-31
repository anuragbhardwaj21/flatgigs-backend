import { Router } from "express";
import { z } from "zod";
import {
  getListingById,
  getListingDetail,
  getListingCalendar,
  getListingReviews,
  buildPriceQuote,
} from "../services/listing.service";

export const listingsRouter = Router();

listingsRouter.get("/listings/:id", async (req, res) => {
  const listing = await getListingDetail(req.params.id);
  if (!listing) {
    res.fail(404, "Listing not found");
    return;
  }
  res.success(listing);
});

listingsRouter.get("/listings/:id/calendar", async (req, res) => {
  const listing = await getListingById(req.params.id);
  if (!listing) {
    res.fail(404, "Listing not found");
    return;
  }
  const days = await getListingCalendar(
    req.params.id,
    req.query.from as string | undefined,
    req.query.to as string | undefined
  );
  res.success({
    listingId: req.params.id,
    days: days.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      available: d.available,
      price: d.price,
    })),
  });
});

listingsRouter.get("/listings/:id/price-quote", async (req, res) => {
  const checkIn = req.query.checkIn as string;
  const checkOut = req.query.checkOut as string;
  if (!checkIn || !checkOut) {
    res.fail(400, "checkIn and checkOut are required");
    return;
  }

  const listing = await getListingById(req.params.id);
  if (!listing || listing.price == null) {
    res.fail(404, "Listing not found");
    return;
  }

  res.success(buildPriceQuote(listing.price, checkIn, checkOut));
});

listingsRouter.get("/listings/:id/reviews", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const topic = req.query.topic as string | undefined;

  const listing = await getListingById(req.params.id);
  if (!listing) {
    res.fail(404, "Listing not found");
    return;
  }

  const { items, total } = await getListingReviews(req.params.id, page, limit, topic);
  res.success(
    {
      items: items.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        reviewerName: r.reviewerName,
        rating: r.rating,
        text: r.text,
        aspects: r.aspects,
      })),
      total,
    },
    { page, limit, total }
  );
});
