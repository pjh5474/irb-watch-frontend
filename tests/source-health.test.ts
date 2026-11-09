import { describe, expect, it } from "vitest";
import { dataMayBeOld, sourceHealth, STALE_HOURS, type HealthInput } from "../src/lib/source-health";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const base: HealthInput = {
  is_active: true,
  last_scan_at: hoursAgo(2),
  last_scan_status: "ok",
};

describe("sourceHealth", () => {
  it("a recent good scan is ok", () => {
    expect(sourceHealth(base, NOW)).toEqual({ level: "ok", reason: null });
  });

  it("an inactive source is inactive, whatever else it says", () => {
    const s = { ...base, is_active: false, last_scan_status: "failed" };
    expect(sourceHealth(s, NOW).level).toBe("inactive");
  });

  it("a running scan shows as scanning", () => {
    expect(sourceHealth({ ...base, scan_in_progress: true }, NOW).level).toBe("scanning");
  });

  it("a rejected login (scans paused) is a problem that needs a person", () => {
    const h = sourceHealth({ ...base, scans_paused_reason: "login rejected" }, NOW);
    expect(h).toEqual({ level: "problem", reason: "paused" });
  });

  it("needs_review (for example a changed page layout) is a problem", () => {
    const h = sourceHealth({ ...base, last_scan_status: "needs_review" }, NOW);
    expect(h).toEqual({ level: "problem", reason: "needsReview" });
  });

  it("a failed scan is attention: it is often temporary", () => {
    const h = sourceHealth({ ...base, last_scan_status: "failed" }, NOW);
    expect(h).toEqual({ level: "attention", reason: "failed" });
  });

  it("no good scan for more than the stale limit is attention", () => {
    expect(sourceHealth({ ...base, last_scan_at: hoursAgo(STALE_HOURS - 1) }, NOW).level).toBe("ok");
    const h = sourceHealth({ ...base, last_scan_at: hoursAgo(STALE_HOURS + 1) }, NOW);
    expect(h).toEqual({ level: "attention", reason: "stale" });
  });

  it("a source that was never scanned is idle, not an error", () => {
    const h = sourceHealth({ ...base, last_scan_at: null, last_scan_status: null }, NOW);
    expect(h).toEqual({ level: "idle", reason: null });
  });

  it("an unreadable date counts as stale, never as ok", () => {
    expect(sourceHealth({ ...base, last_scan_at: "not a date" }, NOW).reason).toBe("stale");
  });

  it("only attention and problem tell normal users the data may be old", () => {
    expect(dataMayBeOld("ok")).toBe(false);
    expect(dataMayBeOld("idle")).toBe(false);
    expect(dataMayBeOld("scanning")).toBe(false);
    expect(dataMayBeOld("inactive")).toBe(false);
    expect(dataMayBeOld("attention")).toBe(true);
    expect(dataMayBeOld("problem")).toBe(true);
  });
});
