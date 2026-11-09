import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "../src/components/count-up";

function show(value: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <p>
        <CountUp value={value} />
      </p>
    </NextIntlClientProvider>,
  );
}

// The animated (aria-hidden) number is the second span; the first is the screen-reader copy.
const visible = (c: HTMLElement) => c.querySelectorAll("span")[1].textContent;
const spoken = (c: HTMLElement) => c.querySelectorAll("span")[0].textContent;

let frames: Array<(t: number) => void> = [];

function runFrames(times: number[]) {
  for (const t of times) {
    const batch = frames;
    frames = [];
    act(() => batch.forEach((f) => f(t)));
  }
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CountUp", () => {
  it("renders the final value first, so the page is right before any script runs", () => {
    const { container } = show(1234);
    expect(visible(container)).toBe("1,234");
    expect(spoken(container)).toBe("1,234");
  });

  it("counts up and ends exactly on the value", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { container } = show(100);
    runFrames([1000]); // first frame: start of the animation
    expect(Number((visible(container) ?? "").replace(",", ""))).toBeLessThan(5);
    runFrames([1350]); // halfway through
    const mid = Number(visible(container));
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThan(100);
    runFrames([2000]); // past the end
    expect(visible(container)).toBe("100");
    expect(spoken(container)).toBe("100"); // the spoken value never changed
  });

  it("does not animate when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = show(100);
    expect(frames).toHaveLength(0); // nothing was scheduled
    expect(visible(container)).toBe("100");
  });

  it("never stays on an old number when the value changes", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const view = render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <p>
          <CountUp value={5} />
        </p>
      </NextIntlClientProvider>,
    );
    runFrames([1000, 2000]); // finished at 5
    expect(visible(view.container)).toBe("5");

    // The value drops to 0: no animation runs for 0, and the old 5 must not stay on screen.
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{}}>
        <p>
          <CountUp value={0} />
        </p>
      </NextIntlClientProvider>,
    );
    expect(visible(view.container)).toBe("0");
    expect(spoken(view.container)).toBe("0");
  });

  it("with reduced motion a new value shows at once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <p>
          <CountUp value={5} />
        </p>
      </NextIntlClientProvider>,
    );
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{}}>
        <p>
          <CountUp value={9} />
        </p>
      </NextIntlClientProvider>,
    );
    expect(visible(view.container)).toBe("9");
    expect(frames).toHaveLength(0);
  });

  it("does not animate zero", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { container } = show(0);
    expect(frames).toHaveLength(0);
    expect(visible(container)).toBe("0");
  });
});
