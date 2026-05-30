import { Router } from "express";
import { prisma } from "../lib/prisma";

export const citiesRouter = Router();

citiesRouter.get("/cities", async (_req, res) => {
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
  res.success({ cities });
});
