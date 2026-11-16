import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { VersionImages } from "../src/components/version-images";
import { ApiError } from "../src/lib/api/client";
import { isShownImage } from "../src/lib/images";

const state = vi.hoisted(() => ({ calls: [] as string[], answer: null as unknown, error: null as unknown }));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/client")>("../src/lib/api/client");
  return {
    ...actual,
    apiFetch: async (path: string) => {
      state.calls.push(path);
      if (state.error) throw state.error;
      return state.answer;
    },
  };
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.calls = [];
  state.error = null;
  state.answer = {
    images: [{ file_id: 1, filename: "084145598410.png", url: "https://storage.example/a?token=t" }],
    expires_at: "2026-11-17T12:10:00Z",
  };
});
afterEach(cleanup);

describe("VersionImages", () => {
  it("asks once per version and shows each image with its name", async () => {
    wrap(<VersionImages versionId={55} />);
    const img = (await screen.findByAltText("Image 084145598410.png")) as HTMLImageElement;
    expect(img.src).toBe("https://storage.example/a?token=t");
    expect(screen.getByText("084145598410.png")).toBeTruthy();
    expect(state.calls).toEqual(["/files/versions/55/image-links"]);
  });

  it("offers to load again when a link has expired", async () => {
    wrap(<VersionImages versionId={55} />);
    fireEvent.error(await screen.findByAltText("Image 084145598410.png"));
    fireEvent.click(await screen.findByRole("button", { name: "Load the images again" }));
    await vi.waitFor(() => expect(state.calls).toHaveLength(2));
  });

  it("shows the server's reason for the daily limit, and a plain message otherwise", async () => {
    state.error = new ApiError(429, "daily limit of 1000 image views reached; download single files instead");
    wrap(<VersionImages versionId={55} />);
    expect((await screen.findByRole("alert")).textContent).toContain("daily limit of 1000 image views");
    cleanup();
    state.error = new ApiError(500, "boom");
    wrap(<VersionImages versionId={55} />);
    expect((await screen.findByRole("alert")).textContent).toBe("The images could not be loaded.");
  });
});

describe("isShownImage", () => {
  it("is true for text images and attached image files only", () => {
    expect(isShownImage("x.bin", "inline_image")).toBe(true);
    expect(isShownImage("Flow.JPG", "unsupported_format")).toBe(true);
    expect(isShownImage("규정.pdf", null)).toBe(false);
  });
});
