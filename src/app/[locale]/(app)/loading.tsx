import { Skeleton } from "@/components/ui/skeleton";

// Shown at once while a page of the signed-in area (feed, sources, source) loads its data.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl p-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <ul className="mt-6 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="rounded border p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-5 w-3/4" />
            <Skeleton className="mt-2 h-4 w-full" />
          </li>
        ))}
      </ul>
    </main>
  );
}
