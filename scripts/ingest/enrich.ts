const ASPECT_KEYWORDS: Record<string, string[]> = {
  cleanliness: ["clean", "dirty", "spotless", "tidy"],
  location: ["location", "located", "walk", "central", "neighborhood"],
  value: ["value", "price", "worth", "expensive", "cheap"],
  noise: ["noise", "noisy", "quiet", "loud"],
  staff: ["host", "responsive", "communication", "helpful"],
};

export function scoreAspects(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [aspect, words] of Object.entries(ASPECT_KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      if (lower.includes(w)) score += 1;
    }
    if (score > 0) scores[aspect] = Math.min(1, score / 3);
  }
  return scores;
}

export function buildReviewSummary(
  aspectScores: Record<string, number>,
  reviewCount: number
): string {
  const top = Object.entries(aspectScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
  if (!top.length) {
    return `Based on ${reviewCount} reviews, guests share mixed feedback.`;
  }
  return `Guests consistently mention ${top.join(" and ")} (${reviewCount} reviews).`;
}

export function aggregateAspectScores(
  rows: Record<string, number>[]
): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      sums[k] = (sums[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(sums)) {
    out[k] = Math.round((sums[k]! / counts[k]!) * 100) / 100;
  }
  return out;
}
