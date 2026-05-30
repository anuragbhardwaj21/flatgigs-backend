import type { Request, Response, NextFunction } from "express";
import { ok, fail } from "../lib/api-response";

export function apiResponseMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.success = (data, meta) => {
    const envelope = ok(data, meta);
    res.status(envelope.meta.code).json(envelope);
  };

  res.fail = (code, message, meta) => {
    const envelope = fail(code, message, meta);
    res.status(code).json(envelope);
  };

  next();
}
