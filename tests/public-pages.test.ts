import { describe, expect, it } from "vitest";
import { isPublicPage } from "../src/lib/public-pages";

describe("isPublicPage", () => {
  it("login and the unsubscribe page work without signing in", () => {
    expect(isPublicPage("login")).toBe(true);
    expect(isPublicPage("unsubscribe")).toBe(true);
  });

  it("everything else needs a sign-in, including look-alikes", () => {
    for (const page of ["admin", "settings", "sources", "documents", "", "Login", "unsubscribe2", "login/x"]) {
      expect(isPublicPage(page), page).toBe(false);
    }
    expect(isPublicPage(undefined)).toBe(false); // the home page has no segment
  });
});
