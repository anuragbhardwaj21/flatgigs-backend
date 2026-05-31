import { config } from "../../config";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ConversationState } from "../../services/chat.service";
import { getListingReviews } from "../tools";
import type { TraceHandle } from "../trace.service";
import { emitAssistantStatus, type EventSink } from "../status";

export type CitationPayload = {
  listingId: string;
  reviewId: string;
  excerpt: string;
};

export type ReviewResult = {
  answer: string;
  citations: CitationPayload[];
};

const REVIEW_SIGNAL = /review|rating|consistent|compare|feedback|guests say/i;

export function isReviewIntent(text: string): boolean {
  return REVIEW_SIGNAL.test(text);
}

export async function runReview(
  state: ConversationState,
  userText: string,
  trace: TraceHandle,
  sink: EventSink
): Promise<ReviewResult> {
  const listingIds = state.lastListingIds ?? [];
  const citations: CitationPayload[] = [];
  const toFetch = listingIds.slice(0, 3);

  for (let i = 0; i < toFetch.length; i++) {
    const listingId = toFetch[i];
    emitAssistantStatus(sink, {
      status: "thinking",
      label: `Reading reviews (${i + 1}/${toFetch.length})…`,
      agent: "review",
      phase: "answering",
      step: "load_reviews",
      progress: 10 + Math.round(((i + 1) / toFetch.length) * 40),
      requestId: trace.requestId,
    });

    const { items } = await getListingReviews(listingId, 1, 3);
    for (const r of items) {
      if (r.text) {
        citations.push({
          listingId,
          reviewId: r.id,
          excerpt: r.text.slice(0, 280),
        });
      }
    }
  }

  if (!hasOpenAI() || citations.length === 0) {
    return {
      answer:
        citations.length === 0
          ? "Search for stays first, then ask about reviews on specific listings."
          : "Here are excerpts from recent guest reviews for your top matches.",
      citations,
    };
  }

  emitAssistantStatus(sink, {
    status: "summarizing",
    label: "Summarizing review themes…",
    agent: "review",
    phase: "answering",
    step: "summarize",
    progress: 60,
    detail: `${citations.length} excerpts`,
    requestId: trace.requestId,
  });

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: config.openai.temperature,
    messages: [
      {
        role: "system",
        content:
          "Summarize review themes in 2-4 sentences. Only use provided excerpts. Do not invent review text.",
      },
      {
        role: "user",
        content: JSON.stringify({ question: userText, citations }),
      },
    ],
  });

  const usage = completion.usage;
  if (usage) {
    trace.tokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  }

  emitAssistantStatus(sink, {
    status: "summarizing",
    label: "Review summary ready",
    agent: "review",
    phase: "answering",
    step: "summarize",
    progress: 90,
    requestId: trace.requestId,
  });

  return {
    answer:
      completion.choices[0]?.message?.content?.trim() ??
      "Guests highlight location and cleanliness in recent reviews.",
    citations: citations.slice(0, 5),
  };
}
