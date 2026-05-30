import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getListingById, buildPriceQuote } from "../services/listing.service";

export const reservationsRouter = Router();

reservationsRouter.post("/reservations/mock", async (req, res) => {
  const body = z
    .object({
      listingId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      guests: z.object({ adults: z.number().default(2), children: z.number().optional() }),
    })
    .safeParse(req.body);

  if (!body.success) {
    res.fail(400, "Invalid reservation payload");
    return;
  }

  const listing = await getListingById(body.data.listingId);
  if (!listing || listing.price == null) {
    res.fail(404, "Listing not found");
    return;
  }

  const quote = buildPriceQuote(listing.price, body.data.checkIn, body.data.checkOut);

  res.success(
    {
      confirmationId: uuidv4(),
      status: "confirmed",
      listingId: body.data.listingId,
      checkIn: body.data.checkIn,
      checkOut: body.data.checkOut,
      guests: body.data.guests,
      ...quote,
    },
    { code: 201, message: "Mock reservation confirmed" }
  );
});
