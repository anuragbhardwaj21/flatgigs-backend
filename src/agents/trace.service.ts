import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { config } from "../config";
import type { TraceStep } from "./schemas";

export type TraceHandle = {
  requestId: string;
  startedAt: number;
  steps: TraceStep[];
  tokensUsed: number;
};

export async function createTrace(token: string): Promise<TraceHandle> {
  const requestId = uuidv4();
  const handle: TraceHandle = {
    requestId,
    startedAt: Date.now(),
    steps: [],
    tokensUsed: 0,
  };

  await prisma.agentTrace.create({
    data: {
      requestId,
      token,
      steps: [],
    },
  });

  return handle;
}

export function addTraceStep(handle: TraceHandle, agent: string, action: string): TraceStep {
  const step: TraceStep = {
    agent,
    action,
    startedAt: new Date().toISOString(),
  };
  handle.steps.push(step);
  return step;
}

export function completeTraceStep(step: TraceStep, durationMs: number, error?: string): void {
  step.completedAt = new Date().toISOString();
  step.durationMs = durationMs;
  if (error) step.error = error;
}

export async function finishTrace(handle: TraceHandle): Promise<void> {
  const latencyMs = Date.now() - handle.startedAt;
  const payload = {
    requestId: handle.requestId,
    steps: handle.steps,
    tokensUsed: handle.tokensUsed,
    latencyMs,
    createdAt: new Date().toISOString(),
  };

  await prisma.agentTrace.update({
    where: { requestId: handle.requestId },
    data: {
      steps: handle.steps as object[],
      tokensUsed: handle.tokensUsed,
      latencyMs,
    },
  });

  await redis.setex(
    `trace:v1:${handle.requestId}`,
    config.cache.traceTtlSeconds,
    JSON.stringify(payload)
  );
}
