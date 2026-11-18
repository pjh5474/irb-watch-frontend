import { describe, expect, it } from "vitest";
import { cutoffPassed, isUnreviewedAi } from "@/lib/api/calendar";

describe("session marks (owner, 2026-11-18)", () => {
  it("marks an AI date nobody reviewed, and only that", () => {
    expect(isUnreviewedAi({ origin: "ai", state: "proposed", reviewed_at: null })).toBe(true);
    expect(isUnreviewedAi({ origin: "ai", state: "confirmed", reviewed_at: "2026-11-18T00:00:00Z" })).toBe(false);
    expect(isUnreviewedAi({ origin: "ai", state: "tentative", reviewed_at: "2026-11-18T00:00:00Z" })).toBe(false);
    expect(isUnreviewedAi({ origin: "user", state: "proposed", reviewed_at: null })).toBe(false);
  });

  it("warns when a known cutoff has passed and the meeting is still ahead", () => {
    const today = "2026-12-01";
    expect(cutoffPassed({ cutoff_on: "2026-11-26", meets_on: "2026-12-10" }, today)).toBe(true);
    expect(cutoffPassed({ cutoff_on: "2026-12-01", meets_on: "2026-12-10" }, today)).toBe(false); // today still counts
    expect(cutoffPassed({ cutoff_on: null, meets_on: "2026-12-10" }, today)).toBe(false); // unknown: nothing invented
    expect(cutoffPassed({ cutoff_on: "2026-11-01", meets_on: "2026-11-15" }, today)).toBe(false); // meeting is past
  });
});
