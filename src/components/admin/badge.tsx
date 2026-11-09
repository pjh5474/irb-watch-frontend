export function Badge({
  children,
  tone = "plain",
  title,
}: {
  children: React.ReactNode;
  tone?: "plain" | "warn" | "good";
  title?: string;
}) {
  const tones = {
    plain: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100",
    good: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-100",
  };
  return (
    <span title={title} className={`rounded px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}
