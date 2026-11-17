import { describe, expect, it } from "vitest";
import { groupByHospital, orderBoards, pickBoard, tabLabel } from "../src/lib/hospital-boards";
import { type ContactsRow, shownField, staffGroups } from "../src/lib/api/contacts";

const b = (id: number, kind: string, name = `H : ${id}`, hospital_id: number | null = 1) => ({
  id, board_kind: kind, name, hospital_id,
});

describe("hospital tabs", () => {
  it("orders notices, forms, regulations, then others, by id inside a kind", () => {
    const got = orderBoards([b(5, "regulations"), b(3, "other"), b(9, "notice"), b(2, "forms"), b(1, "other")]);
    expect(got.map((x) => x.id)).toEqual([9, 2, 5, 1, 3]);
  });

  it("an unknown kind goes last", () => {
    expect(orderBoards([b(1, "weird"), b(2, "notice")]).map((x) => x.id)).toEqual([2, 1]);
  });

  it("picks the board of the address, else the first tab, else none", () => {
    const boards = [b(5, "regulations"), b(9, "notice")];
    expect(pickBoard(boards, "5")?.id).toBe(5);
    expect(pickBoard(boards, "999")?.id).toBe(9); // not this hospital's: the first tab
    expect(pickBoard(boards, "abc")?.id).toBe(9);
    expect(pickBoard(boards, undefined)?.id).toBe(9);
    expect(pickBoard([], "5")).toBeNull();
  });

  it("labels a tab with its kind when the kind is unique, else with the part after ' : '", () => {
    const boards = [b(1, "notice", "Gachon : 공지"), b(2, "other", "Gachon : QnA"), b(3, "other", "Gachon : FAQ")];
    const kind = (k: string) => `kind-${k}`;
    expect(tabLabel(boards[0], boards, kind)).toBe("kind-notice");
    expect(tabLabel(boards[1], boards, kind)).toBe("QnA"); // two "other" boards: their own names
    expect(tabLabel(b(4, "notice", "No separator"), [b(4, "notice", "No separator")], kind)).toBe("kind-notice");
    expect(tabLabel(b(6, "other", "Plain name"), [b(6, "other", "Plain name")], kind)).toBe("Plain name");
  });
});

describe("the hospital list", () => {
  it("groups boards by hospital, names from the catalog, sorted, boards in tab order", () => {
    const names = new Map([[1, "Gachon"], [2, "Asan"]]);
    const groups = groupByHospital(
      [b(10, "regulations", "x", 1), b(11, "notice", "y", 1), b(12, "notice", "z", 2)],
      names,
    );
    expect(groups.map((g) => g.name)).toEqual(["Asan", "Gachon"]);
    expect(groups[1].boards.map((x) => x.id)).toEqual([11, 10]);
  });

  it("a board with no hospital stays alone under its own name", () => {
    const groups = groupByHospital([b(7, "other", "Loose board", null), b(8, "other", "Other loose", null)], new Map());
    expect(groups.map((g) => g.name).sort()).toEqual(["Loose board", "Other loose"]);
    expect(groups.every((g) => g.hospitalId === null && g.boards.length === 1)).toBe(true);
  });

  it("a hospital missing from the catalog falls back to its first board's name", () => {
    expect(groupByHospital([b(1, "notice", "Board name", 99)], new Map())[0].name).toBe("Board name");
  });
});

const row = (over: Partial<ContactsRow> = {}): ContactsRow => ({
  hospital_id: 1, scanned_phone: "02-1", scanned_fax: "", scanned_email: "a@b.kr",
  manual_phone: null, manual_fax: null, manual_email: null, check_status: "ok", checked_at: "2026-11-17T04:00:00Z",
  last_ok_at: "2026-11-17T04:00:00Z", error_kind: null, staff: [], staff_status: "none", staff_error_kind: null, ...over,
});

describe("contact fields", () => {
  it("a typed text wins, else the scanned one, else none", () => {
    expect(shownField(row({ manual_phone: "02-999" }), "phone")).toEqual({ text: "02-999", from: "admin" });
    expect(shownField(row(), "phone")).toEqual({ text: "02-1", from: "r-bay" });
    expect(shownField(row(), "fax")).toEqual({ text: "", from: "none" });
    expect(shownField(null, "email")).toEqual({ text: "", from: "none" });
  });

  it("a typed blank does not hide the scanned text", () => {
    expect(shownField(row({ manual_phone: "" }), "phone").from).toBe("r-bay");
  });

  it("staff of the wrong shape is dropped, not thrown on", () => {
    expect(staffGroups(null)).toEqual([]);
    expect(staffGroups("x")).toEqual([]);
    expect(staffGroups([{ tab: "IRB" }, 5, { tab: "A", entries: [null, { title: "T", name: 3 }] }])).toEqual([
      { tab: "A", entries: [{ title: "T", name: "", email: "", tel: "" }] },
    ]);
  });
});
