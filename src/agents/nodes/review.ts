import { config } from "../../config";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ConversationState } from "../../services/chat.service";
import { getListingReviews } from "../tools";
import type { TraceHandle } from "../trace.service";

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
  trace: TraceHandle
): Promise<ReviewResult> {
  const listingIds = state.lastListingIds ?? [];
  const citations: CitationPayload[] = [];

  for (const listingId of listingIds.slice(0, 3)) {
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

  return {
    answer:
      completion.choices[0]?.message?.content?.trim() ??
      "Guests highlight location and cleanliness in recent reviews.",
    citations: citations.slice(0, 5),
  };
}
