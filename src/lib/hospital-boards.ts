// A hospital's boards as tabs, and the sources page grouped by hospital.

export const KIND_ORDER = ["notice", "forms", "regulations", "other"] as const;
export type Kind = (typeof KIND_ORDER)[number];

type Board = { id: number; board_kind: string; name: string };

/** The tabs in a fixed order: notices, forms, regulations, others; then by id within a kind. */
export function orderBoards<T extends Board>(boards: T[]): T[] {
  const rank = (k: string) => {
    const i = KIND_ORDER.indexOf(k as Kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return [...boards].sort((a, b) => rank(a.board_kind) - rank(b.board_kind) || a.id - b.id);
}

/** The board of the address's `board` parameter when it is one of the hospital's, else the first. */
export function pickBoard<T extends Board>(boards: T[], param: string | undefined): T | null {
  const ordered = orderBoards(boards);
  if (param && /^\d+$/.test(param)) {
    const found = ordered.find((b) => b.id === Number(param));
    if (found) return found;
  }
  return ordered[0] ?? null;
}

/** A tab's label: its kind's name when the hospital has one board of that kind, else the board's own
 * name part after " : " (R-BAY boards are named "<hospital> : <board>"), else the full name. */
export function tabLabel(board: Board, boards: Board[], kindName: (kind: string) => string): string {
  const sameKind = boards.filter((b) => b.board_kind === board.board_kind).length;
  if (sameKind === 1 && board.board_kind !== "other") return kindName(board.board_kind);
  const part = board.name.split(" : ").slice(1).join(" : ").trim();
  return part || board.name;
}

export type HospitalGroup<T> = { hospitalId: number | null; name: string; boards: T[] };

/** Boards grouped by hospital (a board with no hospital stays its own group), sorted by name. */
export function groupByHospital<T extends Board & { hospital_id: number | null }>(
  boards: T[],
  hospitalNames: Map<number, string>,
): HospitalGroup<T>[] {
  const groups = new Map<string, HospitalGroup<T>>();
  for (const b of boards) {
    const key = b.hospital_id === null ? `board:${b.id}` : `hospital:${b.hospital_id}`;
    const group = groups.get(key) ?? {
      hospitalId: b.hospital_id,
      name: b.hospital_id === null ? b.name : (hospitalNames.get(b.hospital_id) ?? b.name),
      boards: [],
    };
    group.boards.push(b);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, boards: orderBoards(g.boards) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
