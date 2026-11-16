import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { FileList, type FileRow } from "../src/components/file-list";

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

function file(id: number, filename: string): FileRow {
  return { id, filename, size_label: null, hasOriginal: true, note: null };
}

function show(files: FileRow[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FileList files={files} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("FileList zip cards", () => {
  const members = Array.from({ length: 11 }, (_, i) => file(i + 2, `pack.zip/m-${String(i + 1).padStart(2, "0")}.pdf`));

  it("hides the files until the zip is opened, then pages them ten at a time", () => {
    show([file(1, "pack.zip"), ...members, file(20, "readme.pdf")]);
    expect(screen.getByText("readme.pdf")).toBeTruthy();
    expect(screen.queryByText("m-01.pdf")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show files in pack.zip" });
    const icon = toggle.querySelector("svg");
    expect(icon?.classList.contains("size-5")).toBe(true);
    expect(icon?.parentElement?.classList.contains("rounded-full")).toBe(true);
    expect(icon?.classList.contains("rotate-90")).toBe(false);

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide files in pack.zip" }).querySelector("svg")?.classList.contains("rotate-90"),
    ).toBe(true);
    expect(screen.getByText("m-01.pdf")).toBeTruthy();
    expect(screen.queryByText("m-11.pdf")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("m-11.pdf")).toBeTruthy();
    expect(screen.queryByText("m-01.pdf")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide files in pack.zip" }));
    expect(screen.queryByText("m-11.pdf")).toBeNull();
  });

  it("filters the open zip by the name inside it", () => {
    show([file(1, "pack.zip"), ...members]);
    fireEvent.click(screen.getByRole("button", { name: "Show files in pack.zip" }));
    fireEvent.change(screen.getByPlaceholderText("File name"), { target: { value: "m-11" } });
    expect(screen.getByText("m-11.pdf")).toBeTruthy();
    expect(screen.queryByText("m-01.pdf")).toBeNull();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
  });

  it("does not open the zip when its own download is clicked", () => {
    show([file(1, "pack.zip"), file(2, "pack.zip/a.pdf")]);
    const downloads = screen.getAllByRole("button", { name: "Download" });
    fireEvent.click(downloads[0]);
    expect(screen.queryByText("a.pdf")).toBeNull();
  });
});
