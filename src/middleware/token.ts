import type { Request, Response, NextFunction } from "express";
import { validate as uuidValidate } from "uuid";

const PUBLIC_PATHS = new Set(["/health", "/api/docs"]);

export function tokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path.replace(/\/$/, "") || "/";
  if (PUBLIC_PATHS.has(path) || path.startsWith("/api/docs")) {
    next();
    return;
  }

  const token = req.header("X-Token");
  if (!token || !uuidValidate(token)) {
    res.fail(401, "Token required");
    return;
  }

  req.token = token;
  next();
}
