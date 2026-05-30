import { Router } from "express";
import { z } from "zod";
import { getTopPicks } from "../services/top-picks.service";

const schema = z.object({
  city: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).optional(),
});

export const topPicksRouter = Router();

topPicksRouter.get("/top-picks", async (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.fail(400, "Invalid query parameters", {
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const result = await getTopPicks(parsed.data);
  if (!result) {
    res.fail(404, "City not found");
    return;
  }

  res.success(result);
});
