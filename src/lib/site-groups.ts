// Which hospital site a source belongs to, for grouping long source lists.
//   * R-BAY: one group per hospital (the code in /agency/main/<code>), whatever the board;
//   * any other site: one group per host (all SNUH boards share hrpp.snuh.org).
// The label is what the group's sources' names start with ("이화목동 공지", "이화목동 양식함"
// -> "이화목동"); with nothing in common it falls back to the hospital code or the host.

export type SiteInfo = { key: string; kind: "rbay" | "web"; fallback: string };

const RBAY_HOSTS = new Set(["www.r-bay.co.kr", "r-bay.co.kr"]);

export function siteOf(sourceUrl: string): SiteInfo {
  try {
    const url = new URL(sourceUrl);
    if (RBAY_HOSTS.has(url.hostname)) {
      const code = url.pathname.match(/^\/agency\/main\/([^/]+)$/)?.[1];
      if (code) return { key: `rbay:${code}`, kind: "rbay", fallback: `R-BAY ${code.slice(0, 8)}…` };
    }
    return { key: url.hostname, kind: "web", fallback: url.hostname };
  } catch {
    return { key: sourceUrl, kind: "web", fallback: sourceUrl };
  }
}

/** The common start of the names, cut back to a whole word; "" when too short to mean anything. */
export function commonLabel(names: string[]): string {
  if (names.length < 2) return "";
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    prefix = prefix.slice(0, i);
  }
  // Only keep whole words: "이화목동 관련규정" and "이화목동 공지" share "이화목동 ".
  const everyNameContinues = names.every((n) => n.length === prefix.length || /[\s\-·:|(\[_/]/.test(n[prefix.length] ?? " "));
  if (!everyNameContinues) prefix = prefix.replace(/[^\s\-·:|(\[_/]*$/, "");
  const label = prefix.replace(/[\s\-·:|(\[_/]+$/, "").trim();
  return label.length >= 2 ? label : "";
}

export type SiteGroup<T> = { key: string; kind: SiteInfo["kind"]; label: string; items: T[] };

export function groupBySite<T extends { name: string; url: string }>(sources: T[]): SiteGroup<T>[] {
  const groups = new Map<string, { info: SiteInfo; items: T[] }>();
  for (const source of sources) {
    const info = siteOf(source.url);
    const group = groups.get(info.key) ?? { info, items: [] };
    group.items.push(source);
    groups.set(info.key, group);
  }
  return [...groups.values()]
    .map(({ info, items }) => ({
      key: info.key,
      kind: info.kind,
      label: commonLabel(items.map((s) => s.name)) || (items.length === 1 ? items[0].name : info.fallback),
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}
