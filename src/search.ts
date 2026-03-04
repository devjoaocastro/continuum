/**
 * TF-IDF ranking for memory search.
 * Zero dependencies — pure TypeScript.
 * Scores results by term frequency × inverse document frequency.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "is", "are", "was", "be", "been", "have", "has", "do",
  "use", "uses", "used", "using", "que", "de", "da", "do", "em", "um",
  "uma", "para", "com", "se", "por", "no", "na", "as", "os",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function rankByRelevance(
  query: string,
  items: string[],
  topK = 10
): string[] {
  if (!items.length) return [];

  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size) return items.slice(0, topK);

  // IDF: log(N / df) — how rare is this term across all items
  const df = new Map<string, number>();
  const tokenizedItems = items.map((item) => {
    const tokens = new Set(tokenize(item));
    for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
    return tokens;
  });

  const N = items.length;
  const scored = items.map((item, i) => {
    const itemTokens = tokenizedItems[i];
    let score = 0;
    for (const term of queryTerms) {
      if (itemTokens.has(term)) {
        const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
        score += idf;
      }
    }
    // Boost exact phrase match
    if (item.toLowerCase().includes(query.toLowerCase())) score *= 1.5;
    return { item, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => r.item);
}
