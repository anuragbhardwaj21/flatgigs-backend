import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  port: z.coerce.number().default(3000),
  databaseUrl: z.string().min(1),
  redisUrl: z.string().min(1),
  openaiApiKey: z.string().optional(),
  corsOrigin: z.string().optional(),
  publicBaseUrl: z.string().optional(),
});

const parsed = envSchema.parse({
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  corsOrigin: process.env.CORS_ORIGIN,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
});

function parseCorsOrigins(raw?: string): { allowAll: boolean; origins: string[] } {
  if (!raw?.trim() || raw.trim() === "*") {
    return { allowAll: true, origins: [] };
  }
  return {
    allowAll: false,
    origins: raw.split(",").map((o) => o.trim()).filter(Boolean),
  };
}

const cors = parseCorsOrigins(parsed.corsOrigin);

export const config = {
  env: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
  host: "0.0.0.0",
  port: parsed.port,
  apiPrefix: "/api/v1",
  publicBaseUrl: parsed.publicBaseUrl ?? `http://localhost:${parsed.port}`,
  corsAllowAll: cors.allowAll,
  corsOrigins: cors.origins,
  corsOrigin: cors.allowAll ? "*" : cors.origins[0] ?? "http://localhost:5173",
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
