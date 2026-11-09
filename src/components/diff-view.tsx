import type { DiffPart } from "@/lib/diff";

export function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, i) =>
        part.kind === "added" ? (
          <ins key={i} className="bg-green-100 text-green-900 no-underline dark:bg-green-900/40 dark:text-green-100">
            {part.text}
          </ins>
        ) : part.kind === "removed" ? (
          <del key={i} className="bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100">
            {part.text}
          </del>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
