import type { LucideIcon } from "lucide-react";

// A card for one part of an admin page: a quiet coloured edge and a small icon tell the parts
// apart at a glance. The colour is only a cue; every part also has its own heading text.
export type Accent = "slate" | "violet" | "amber" | "blue";

const ACCENTS: Record<Accent, { edge: string; icon: string }> = {
  slate: {
    edge: "border-l-slate-400 dark:border-l-slate-500",
    icon: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  violet: {
    edge: "border-l-violet-400 dark:border-l-violet-500",
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  },
  amber: {
    edge: "border-l-amber-400 dark:border-l-amber-500",
    icon: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  blue: {
    edge: "border-l-blue-400 dark:border-l-blue-500",
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  },
};

export function Section({
  icon: Icon,
  accent,
  title,
  level = 2,
  aside,
  children,
}: {
  icon: LucideIcon;
  accent: Accent;
  title: React.ReactNode;
  level?: 1 | 2;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const a = ACCENTS[accent];
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className={`flex flex-col gap-3 rounded border border-l-4 p-4 ${a.edge}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded ${a.icon}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <Heading className={level === 1 ? "text-2xl font-semibold" : "font-medium"}>{title}</Heading>
        {aside}
      </div>
      {children}
    </section>
  );
}
