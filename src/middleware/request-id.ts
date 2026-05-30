import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = req.header("X-Request-Id") ?? uuidv4();
  next();
}
