import { Router } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

export const agentsRouter = Router();

agentsRouter.get("/agents/traces/:requestId", async (req, res) => {
  const cacheKey = `trace:v1:${req.params.requestId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    res.success(JSON.parse(cached));
    return;
  }

  const trace = await prisma.agentTrace.findUnique({
    where: { requestId: req.params.requestId },
  });

  if (!trace) {
    res.fail(404, "Trace not found");
    return;
  }

  const payload = {
    requestId: trace.requestId,
    steps: trace.steps,
    tokensUsed: trace.tokensUsed,
    latencyMs: trace.latencyMs,
    createdAt: trace.createdAt,
  };

  res.success(payload);
});
