import Redis from "ioredis";
import { config } from "../config";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
  globalForRedis.redis ??
  new Redis(config.secrets.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (config.env !== "production") {
  globalForRedis.redis = redis;
}

export async function ensureRedis(): Promise<void> {
  if (redis.status === "wait") {
    await redis.connect();
  }
}
