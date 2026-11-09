import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusDot } from "../src/components/status-dot";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("StatusDot", () => {
  it("is decoration: hidden from screen readers", () => {
    expect(html(<StatusDot tone="green" />)).toContain('aria-hidden="true"');
  });

  it("a still dot has no ring", () => {
    const out = html(<StatusDot tone="gray" />);
    expect(out).not.toContain("dot-ring");
    expect(out).toContain('data-pulse="none"');
  });

  it("a pulsing dot has a ring in the same color, slower for calm and faster for alert", () => {
    const calm = html(<StatusDot tone="green" pulse="slow" />);
    const alert = html(<StatusDot tone="red" pulse="fast" />);
    expect(calm).toContain("dot-ring");
    expect(calm).toContain("bg-green-500");
    expect(calm).toContain("--ring-speed:2.8s");
    expect(alert).toContain("bg-red-500");
    expect(alert).toContain("--ring-speed:1.3s");
  });
});
