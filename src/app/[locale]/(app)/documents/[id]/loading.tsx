import { Skeleton } from "@/components/ui/skeleton";

// Shown at once while a document page loads (shaped like the real page).
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" aria-busy="true">
      <header className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </header>
      <section className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </section>
      <section className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-full" />
      </section>
    </main>
  );
}
