import type { WebSocket } from "ws";
import { fail, ok } from "../lib/api-response";
import { hasOpenAI } from "../lib/openai";
import { sendWs } from "../ws/ws-response";
import {
  appendAssistantText,
  appendResultsIntro,
  appendUserMessage,
  saveChatSession,
  type ChatMessage,
  type ConversationState,
} from "../services/chat.service";
import { runIntent } from "./nodes/intent";
import { runRetrieval } from "./nodes/retrieval";
import { isReviewIntent, runReview } from "./nodes/review";
import {
  addTraceStep,
  completeTraceStep,
  createTrace,
  finishTrace,
  type TraceHandle,
} from "./trace.service";

export type EventSink = {
  ws: WebSocket;
  token: string;
  lastStatus?: string;
};

function emit(sink: EventSink, event: string, data: unknown): void {
  sendWs(sink.ws, event, ok(data));
}

function emitStatus(
  sink: EventSink,
  status: string,
  opts?: { label?: string; agent?: string }
): void {
  if (sink.lastStatus === status) return;
  sink.lastStatus = status;
  emit(sink, "assistant.status", { status, ...opts });
}

function emitState(sink: EventSink, state: ConversationState): void {
  emit(sink, "state.updated", {
    parsedFilters: state.slots,
    chips: state.chips,
    phase: state.phase,
    missingMandatory: state.missingMandatory,
    missingFields: state.missingFields,
  });
}

async function persist(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[]
): Promise<void> {
  await saveChatSession(sink.token, state, messages);
}

export async function runClarifyOrSearch(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string
): Promise<void> {
  if (!hasOpenAI()) {
    emit(sink, "error", fail(503, "OPENAI_API_KEY required for AI chat", { retryable: false }));
    emitStatus(sink, "idle");
    return;
  }

  const trace = await createTrace(sink.token);
  emitStatus(sink, "thinking", { label: "Understanding your trip...", agent: "intent" });

  const intentStep = addTraceStep(trace, "intent", "parse");
  const t0 = Date.now();
  const intent = await runIntent(state, userText, trace);
  completeTraceStep(intentStep, Date.now() - t0);
  let nextState = intent.state;
  let nextMessages = messages;

  emitState(sink, nextState);

  if (intent.question) {
    emitStatus(sink, "typing", { agent: "intent" });
    emit(sink, "assistant.message", {
      message: intent.question,
      messageType: "question",
    });
    nextMessages = appendAssistantText(nextMessages, intent.question, "question");
    nextState.phase = "clarifying";
    await persist(sink, nextState, nextMessages);
    await finishTrace(trace);
    emitStatus(sink, "idle");
    return;
  }

  if (nextState.missingMandatory.length > 0) {
    await persist(sink, nextState, nextMessages);
    await finishTrace(trace);
    emitStatus(sink, "idle");
    return;
  }

  await executeSearch(sink, nextState, nextMessages, intent.transition, trace);
}

async function executeSearch(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  transition: string | null,
  trace: TraceHandle
): Promise<void> {
  if (transition) {
    emitStatus(sink, "typing", { agent: "intent" });
    emit(sink, "assistant.message", { message: transition, messageType: "transition" });
    messages = appendAssistantText(messages, transition, "transition");
  }

  emitStatus(sink, "searching", { label: "Searching stays...", agent: "retrieval" });
  const step = addTraceStep(trace, "retrieval", "search");
  const t0 = Date.now();
  emit(sink, "step_started", { step: "retrieval", agent: "retrieval" });

  const retrieval = await runRetrieval(state, trace);
  completeTraceStep(step, Date.now() - t0);
  emit(sink, "step_completed", { step: "retrieval", durationMs: Date.now() - t0 });

  if (!retrieval) {
    emit(sink, "error", fail(404, "Could not run search for this destination", { retryable: true }));
    await finishTrace(trace);
    emitStatus(sink, "idle");
    return;
  }

  let nextState = retrieval.state;
  let nextMessages = appendResultsIntro(messages, retrieval.message);

  emit(sink, "assistant.results", {
    message: retrieval.message,
    items: retrieval.items,
    total: retrieval.total,
    mapPins: retrieval.mapPins,
    chips: nextState.chips,
    meta: { requestId: trace.requestId, usage: { tokensUsed: trace.tokensUsed } },
  });

  await persist(sink, nextState, nextMessages);
  await finishTrace(trace);
  emitStatus(sink, "idle");
}

export async function runFollowUp(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string
): Promise<void> {
  if (!hasOpenAI()) {
    emit(sink, "error", fail(503, "OPENAI_API_KEY required for AI chat"));
    emitStatus(sink, "idle");
    return;
  }

  const trace = await createTrace(sink.token);
  let nextMessages = messages;

  if (isReviewIntent(userText) && (state.lastListingIds?.length ?? 0) > 0) {
    emitStatus(sink, "thinking", { label: "Reading reviews...", agent: "review" });
    const step = addTraceStep(trace, "review", "summarize");
    const t0 = Date.now();
    emit(sink, "step_started", { step: "review", agent: "review" });

    const review = await runReview(state, userText, trace);
    completeTraceStep(step, Date.now() - t0);
    emit(sink, "step_completed", { step: "review", durationMs: Date.now() - t0 });

    for (const c of review.citations) {
      emit(sink, "citation", c);
    }

    emit(sink, "assistant.message", { message: review.answer, messageType: "answer" });
    nextMessages = appendAssistantText(nextMessages, review.answer, "answer");

    emit(sink, "done", {
      answer: review.answer,
      usage: { tokensUsed: trace.tokensUsed, latencyMs: Date.now() - trace.startedAt },
      meta: { requestId: trace.requestId },
    });

    state.phase = "answering";
    await persist(sink, state, nextMessages);
    await finishTrace(trace);
    emitStatus(sink, "idle");
    return;
  }

  state.forceSearch = state.forceSearch || /search again|new search|update/i.test(userText);
  await runClarifyOrSearch(sink, state, nextMessages, userText);
}

export async function handleUserTurn(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string,
  isStart: boolean
): Promise<void> {
  let nextMessages = appendUserMessage(messages, userText);

  if (state.phase === "answering" && !isStart) {
    await persist(sink, state, nextMessages);
    await runFollowUp(sink, state, nextMessages, userText);
    return;
  }

  await persist(sink, state, nextMessages);
  await runClarifyOrSearch(sink, state, nextMessages, userText);
}
