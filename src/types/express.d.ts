import type { Envelope, EnvelopeMeta } from "../lib/api-response";

declare global {
  namespace Express {
    interface Response {
      success<T>(data: T, meta?: Partial<EnvelopeMeta>): void;
      fail(code: number, message: string, meta?: Partial<EnvelopeMeta>): void;
    }
    interface Request {
      token?: string;
      requestId?: string;
    }
  }
}

export {};
