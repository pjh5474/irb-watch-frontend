import { diffWords } from "diff";

export type DiffPart = { text: string; kind: "same" | "added" | "removed" };

// Same cap as the backend (docs/decisions.md "Seeing what changed"): beyond this a word
// diff is slow and unreadable, so the caller shows the new text plainly instead.
export const MAX_DIFF_WORDS = 20_000;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function wordDiff(before: string, after: string): DiffPart[] | null {
  if (wordCount(before) > MAX_DIFF_WORDS || wordCount(after) > MAX_DIFF_WORDS) return null;
  return diffWords(before, after).map((part) => ({
    text: part.value,
    kind: part.added ? "added" : part.removed ? "removed" : "same",
  }));
}
