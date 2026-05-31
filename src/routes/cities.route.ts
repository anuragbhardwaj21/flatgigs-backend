import { Router } from "express";
import { getCities } from "../services/cities.service";

export const citiesRouter = Router();

citiesRouter.get("/cities", async (_req, res) => {
  const cities = await getCities();
  res.success({ cities });
});
