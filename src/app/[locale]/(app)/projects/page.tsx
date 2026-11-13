import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { NewProjectForm } from "@/components/projects";
import { OrganizationProjectsLink, SharedProjects } from "@/components/projects/shared-projects";
import { Link } from "@/i18n/navigation";
import { MAX_PROJECTS } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projects");
  const format = await getFormatter();
  const supabase = await createClient();

  // The user's own projects. Row-level security also lets members, organization admins and
  // platform admins read other projects (phase B1), so the list asks for its own rows; shared
  // projects come from the server below with their owner's name. Hospital names are readable
  // by every signed-in user.
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub ?? "";
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, note, updated_at, project_hospitals(hospital_id, hospitals(name))")
    .eq("user_id", me)
    .order("updated_at", { ascending: false });

  const full = (projects?.length ?? 0) >= MAX_PROJECTS;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm opacity-80">{t("intro")}</p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!error && projects?.length === 0 && <p className="text-sm opacity-70">{t("empty")}</p>}

      <ul className="flex flex-col gap-3">
        {projects?.map((p, index) => {
          const names = p.project_hospitals.map((l) => l.hospitals?.name ?? t("siteUnavailable"));
          return (
            <li key={p.id} className="reveal rounded border p-4" style={{ "--i": index } as React.CSSProperties}>
              <h2 className="font-medium">
                <Link href={`/projects/${p.id}`} className="underline-offset-4 hover:underline">
                  {p.name}
                </Link>
              </h2>
              {p.note && <p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap opacity-80">{p.note}</p>}
              <p className="mt-2 text-xs opacity-70">
                {names.length ? t("sitesList", { names: names.join(", ") }) : t("noSites")}
              </p>
              <p className="mt-1 text-xs opacity-60">
                {t("updated", { date: format.dateTime(new Date(p.updated_at), { dateStyle: "medium" }) })}
              </p>
            </li>
          );
        })}
      </ul>

      <SharedProjects />
      <OrganizationProjectsLink />

      {!error && (
        <section className="flex flex-col gap-3 rounded border p-4">
          <h2 className="font-medium">{t("newTitle")}</h2>
          {full ? <p className="text-sm opacity-70">{t("errors.tooManyProjects")}</p> : <NewProjectForm />}
        </section>
      )}
    </main>
  );
}
