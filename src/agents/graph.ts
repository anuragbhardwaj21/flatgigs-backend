import { fail, ok } from "../lib/api-response";
import { hasOpenAI } from "../lib/openai";
import { sendWs } from "../ws/ws-response";
import {
  appendAssistantText,
  appendResultsMessage,
  appendUserMessage,
  saveChatSession,
  type ChatMessage,
  type ConversationState,
} from "../services/chat.service";
import { runConcierge } from "./nodes/concierge";
import type { ConversationSlots } from "./schemas";
import { buildVerifiedInputs, buildSelectedFacets } from "./tools";
import { runRetrieval } from "./nodes/retrieval";
import { isReviewIntent, runReview } from "./nodes/review";
import {
  emitAssistantStatus,
  idleStatus,
  type EventSink,
} from "./status";
import {
  addTraceStep,
  completeTraceStep,
  createTrace,
  finishTrace,
  type TraceHandle,
} from "./trace.service";

export type { EventSink } from "./status";

function emit(sink: EventSink, event: string, data: unknown): void {
  sendWs(sink.ws, event, ok(data));
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

function cityLabel(slots: Record<string, unknown>): string {
  const city = slots.city;
  if (typeof city === "string" && city.length) {
    return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return "your destination";
}

export async function runConciergeTurn(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string
): Promise<void> {
  if (!hasOpenAI()) {
    emit(sink, "error", fail(503, "OPENAI_API_KEY required for AI chat", { retryable: false }));
    emitAssistantStatus(sink, idleStatus());
    return;
  }

  const trace = await createTrace(sink.token);
  const phase = state.phase === "answering" ? "answering" : "clarifying";

  emitAssistantStatus(sink, {
    status: "thinking",
    label: "Understanding your trip…",
    agent: "concierge",
    phase,
    step: "parse_trip",
    requestId: trace.requestId,
  });

  const step = addTraceStep(trace, "concierge", "turn");
  const t0 = Date.now();
  const turn = await runConcierge(state, userText, messages, trace);
  completeTraceStep(step, Date.now() - t0);

  let nextState = turn.state;
  let nextMessages = messages;

  emitState(sink, nextState);

  emitAssistantStatus(sink, {
    status: "typing",
    label: "Composing reply…",
    agent: "concierge",
    phase: nextState.phase,
    step: "compose_reply",
    requestId: trace.requestId,
  });

  emit(sink, "assistant.message", {
    message: turn.reply,
    messageType: turn.messageType,
  });
  nextMessages = appendAssistantText(nextMessages, turn.reply, turn.messageType);

  if (!turn.readyToSearch) {
    nextState.phase = nextState.phase === "answering" ? "answering" : "clarifying";
    await persist(sink, nextState, nextMessages);
    await finishTrace(trace);
    emitAssistantStatus(sink, { ...idleStatus(trace.requestId), phase: nextState.phase });
    return;
  }

  await persist(sink, nextState, nextMessages);
  await executeSearch(sink, nextState, nextMessages, trace);
}

async function executeSearch(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  trace: TraceHandle
): Promise<void> {
  const slots = state.slots as ConversationSlots;
  const place = cityLabel(slots);

  emitAssistantStatus(sink, {
    status: "searching",
    label: `Searching stays in ${place}…`,
    agent: "retrieval",
    phase: "searching",
    step: "query_db",
    progress: 5,
    detail: slots.checkIn && slots.checkOut ? `${slots.checkIn} → ${slots.checkOut}` : undefined,
    requestId: trace.requestId,
  });

  const step = addTraceStep(trace, "retrieval", "search");
  const t0 = Date.now();
  emit(sink, "step_started", { step: "retrieval", agent: "retrieval" });

  const retrieval = await runRetrieval(state, trace, sink);
  completeTraceStep(step, Date.now() - t0);
  emit(sink, "step_completed", { step: "retrieval", durationMs: Date.now() - t0 });

  if (!retrieval) {
    emit(sink, "error", fail(404, "Could not run search for this destination", { retryable: true }));
    await finishTrace(trace);
    emitAssistantStatus(sink, idleStatus(trace.requestId));
    return;
  }

  const nextState = retrieval.state;
  const searchSlots = nextState.slots as ConversationSlots;
  const inputs = buildVerifiedInputs(searchSlots);
  if (!inputs) {
    emit(sink, "error", fail(400, "Search inputs incomplete", { retryable: true }));
    await finishTrace(trace);
    emitAssistantStatus(sink, idleStatus(trace.requestId));
    return;
  }

  emitAssistantStatus(sink, {
    status: "searching",
    label: `Found ${retrieval.total} stays — preparing results…`,
    agent: "retrieval",
    phase: "searching",
    step: "prepare_results",
    progress: 95,
    requestId: trace.requestId,
  });

  const nextMessages = appendResultsMessage(messages, retrieval.message, inputs);

  emit(sink, "assistant.results", {
    message: retrieval.message,
    inputs,
    items: retrieval.items,
    total: retrieval.total,
    facets: retrieval.facets,
    selectedFacets: buildSelectedFacets(searchSlots),
    mapPins: retrieval.mapPins,
    chips: nextState.chips,
    meta: { requestId: trace.requestId, usage: { tokensUsed: trace.tokensUsed } },
  });

  await persist(sink, nextState, nextMessages);
  await finishTrace(trace);
  emitAssistantStatus(sink, { ...idleStatus(trace.requestId), phase: "answering" });
}

export async function runFollowUp(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string
): Promise<void> {
  if (!hasOpenAI()) {
    emit(sink, "error", fail(503, "OPENAI_API_KEY required for AI chat"));
    emitAssistantStatus(sink, idleStatus());
    return;
  }

  if (isReviewIntent(userText) && (state.lastListingIds?.length ?? 0) > 0) {
    const trace = await createTrace(sink.token);

    emitAssistantStatus(sink, {
      status: "thinking",
      label: "Loading guest reviews…",
      agent: "review",
      phase: "answering",
      step: "load_reviews",
      progress: 10,
      requestId: trace.requestId,
    });

    const step = addTraceStep(trace, "review", "summarize");
    const t0 = Date.now();
    emit(sink, "step_started", { step: "review", agent: "review" });

    const review = await runReview(state, userText, trace, sink);
    completeTraceStep(step, Date.now() - t0);
    emit(sink, "step_completed", { step: "review", durationMs: Date.now() - t0 });

    for (const c of review.citations) {
      emit(sink, "citation", c);
    }

    emitAssistantStatus(sink, {
      status: "typing",
      label: "Writing summary…",
      agent: "review",
      phase: "answering",
      step: "compose_answer",
      requestId: trace.requestId,
    });

    emit(sink, "assistant.message", { message: review.answer, messageType: "answer" });
    const nextMessages = appendAssistantText(messages, review.answer, "answer");

    emit(sink, "done", {
      answer: review.answer,
      usage: { tokensUsed: trace.tokensUsed, latencyMs: Date.now() - trace.startedAt },
      meta: { requestId: trace.requestId },
    });

    state.phase = "answering";
    await persist(sink, state, nextMessages);
    await finishTrace(trace);
    emitAssistantStatus(sink, { ...idleStatus(trace.requestId), phase: "answering" });
    return;
  }

  await runConciergeTurn(sink, state, messages, userText);
}

export async function handleUserTurn(
  sink: EventSink,
  state: ConversationState,
  messages: ChatMessage[],
  userText: string,
  isStart: boolean
): Promise<void> {
  const nextMessages = appendUserMessage(messages, userText);
  await persist(sink, state, nextMessages);

  if (state.phase === "answering" && !isStart) {
    await runFollowUp(sink, state, nextMessages, userText);
    return;
  }

  await runConciergeTurn(sink, state, nextMessages, userText);
}
