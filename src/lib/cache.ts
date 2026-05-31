import { createHash } from "crypto";
import { redis } from "./redis";

function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const normalized = normalizeValue(obj[key]);
      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }
    return out;
  }
  return value;
}

export function stableHash(input: Record<string, unknown>): string {
  const normalized = normalizeValue(input) as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

export function cacheKey(prefix: string, input: Record<string, unknown>): string {
  return `${prefix}:${stableHash(input)}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

const DATA_CACHE_PATTERNS = [
  "search:base:v2:*",
  "top-picks:v1:*",
  "listing:detail:v1:*",
  "cities:v1",
  "compare:v1:*",
  "rationale:v1:*",
  "batch:summary:v1:*",
  "wishlist:v1:*",
];

async function deleteByPattern(pattern: string): Promise<number> {
  let cursor = "0";
  let deleted = 0;

  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      deleted += await redis.del(...keys);
    }
  } while (cursor !== "0");

  return deleted;
}

export async function flushDataCaches(): Promise<number> {
  let total = 0;
  for (const pattern of DATA_CACHE_PATTERNS) {
    total += await deleteByPattern(pattern);
  }
  return total;
}
