import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  port: z.coerce.number().default(3000),
  databaseUrl: z.string().min(1),
  redisUrl: z.string().min(1),
  openaiApiKey: z.string().optional(),
});

const parsed = envSchema.parse({
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  env: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
  host: "0.0.0.0",
  port: parsed.port,
  apiPrefix: "/api/v1",
  publicBaseUrl: `http://localhost:${parsed.port}`,
  corsOrigin: "http://localhost:5173",
  wsPath: "/ws",
  logHttp: true,
  openai: {
    model: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
    maxTokens: 4096,
    temperature: 0.2,
  },
  cache: {
    chatTtlSeconds: 1200,
    searchTtlSeconds: 300,
    summaryTtlSeconds: 86400,
    compareTtlSeconds: 3600,
    traceTtlSeconds: 3600,
  },
  agent: {
    stepTimeoutMs: 30000,
    maxRetries: 2,
    retryDelayMs: 500,
  },
  ingest: {
    dataDir: "./data/raw",
    cities: ["lisbon", "barcelona"] as const,
    citySources: {
      lisbon: {
        path: "portugal/lisbon/lisbon",
        snapshot: process.env.LISBON_SNAPSHOT ?? "2025-12-25",
      },
      barcelona: {
        path: "spain/catalonia/barcelona",
        snapshot: process.env.BARCELONA_SNAPSHOT ?? "2025-12-14",
      },
    },
    listingBatchSize: 500,
    calendarBatchSize: 2000,
    reviewBatchSize: 1000,
    reviewEmbedSample: 5000,
    skipEmbeddings: false,
  },
  secrets: {
    databaseUrl: parsed.databaseUrl,
    redisUrl: parsed.redisUrl,
    openaiApiKey: parsed.openaiApiKey,
  },
} as const;
