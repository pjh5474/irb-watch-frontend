import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pageHref, pageItems } from "@/lib/paging";

// A pager: Previous, numbered pages, Next. Two ways to use it:
//   * server pages give `pathname`, `query` (the other parameters to keep) and `param` (the name
//     of this list's page parameter); the pages are links, so the address remembers the page;
//   * client lists give `onPage`; the pages are buttons.
// It draws nothing when there is only one page.
type Props = {
  page: number;
  pages: number;
  pathname?: string;
  query?: Record<string, string | undefined>;
  param?: string;
  onPage?: (page: number) => void;
};

const base = "rounded px-2.5 py-1 text-sm";
const idle = `${base} hover:bg-neutral-100 dark:hover:bg-neutral-800`;
const current = `${base} bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900`;

export function Pagination({ page, pages, pathname = "/", query = {}, param = "page", onPage }: Props) {
  const t = useTranslations("pagination");
  if (pages <= 1) return null;

  function control(target: number, label: React.ReactNode, className: string, ariaLabel?: string, isCurrent = false) {
    const aria = { "aria-label": ariaLabel, "aria-current": isCurrent ? ("page" as const) : undefined };
    if (onPage) {
      return (
        <button type="button" className={className} onClick={() => onPage(target)} {...aria}>
          {label}
        </button>
      );
    }
    return (
      <Link href={pageHref(pathname, query, param, target)} className={className} {...aria}>
        {label}
      </Link>
    );
  }

  return (
    <nav aria-label={t("paging")} className="mt-4 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? control(page - 1, `← ${t("previous")}`, idle) : <span aria-hidden className={`${base} opacity-40`}>← {t("previous")}</span>}
      {pageItems(page, pages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} aria-hidden className={`${base} opacity-60`}>
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" aria-label={t("pageOf", { page, total: pages })} className={current}>
            {item}
          </span>
        ) : (
          <span key={item}>{control(item, item, idle, t("goTo", { n: item }))}</span>
        ),
      )}
      {page < pages ? control(page + 1, `${t("next")} →`, idle) : <span aria-hidden className={`${base} opacity-40`}>{t("next")} →</span>}
    </nav>
  );
}
