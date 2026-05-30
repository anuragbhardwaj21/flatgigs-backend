import type { Request, Response, NextFunction } from "express";
import { fail } from "../lib/api-response";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const code = err instanceof Error && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 500;
  const status = code >= 400 && code < 600 ? code : 500;

  res.status(status).json(fail(status, message));
}
