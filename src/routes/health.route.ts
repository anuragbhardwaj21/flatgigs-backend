import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.success({ status: "ok", timestamp: new Date().toISOString() });
});
