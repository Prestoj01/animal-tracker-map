import { describe, expect, it, vi } from "vitest";
import { ALL_YEARS, createTimeline, inPeriod, periodPhrase, PERIODS } from "./timeline";

const byLabel = (label: string) => PERIODS.find((period) => period.label === label)!;

describe("inPeriod", () => {
  it("keeps everything, even unknown years, for all years", () => {
    expect(inPeriod(null, ALL_YEARS)).toBe(true);
    expect(inPeriod(1850, ALL_YEARS)).toBe(true);
  });

  it("keeps only years inside a period, and never unknown ones", () => {
    const nineties = byLabel("1990s");
    expect(inPeriod(1990, nineties)).toBe(true);
    expect(inPeriod(1999, nineties)).toBe(true);
    expect(inPeriod(2000, nineties)).toBe(false);
    expect(inPeriod(null, nineties)).toBe(false);
    expect(inPeriod(1850, byLabel("Before 1990"))).toBe(true);
    expect(inPeriod(2026, byLabel("2020s"))).toBe(true);
  });

  it("covers every known year with exactly one decade period", () => {
    for (const year of [1700, 1989, 1990, 2009, 2010, 2030]) {
      expect(PERIODS.slice(1).filter((period) => inPeriod(year, period))).toHaveLength(1);
    }
  });
});

describe("periodPhrase", () => {
  it("reads naturally in a sentence", () => {
    expect(periodPhrase(ALL_YEARS)).toBe("");
    expect(periodPhrase(byLabel("Before 1990"))).toBe("before 1990");
    expect(periodPhrase(byLabel("2010s"))).toBe("in the 2010s");
  });
});

describe("createTimeline", () => {
  it("steps through the periods and can reset", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const timeline = createTimeline(container, onChange);
    const slider = container.querySelector("input") as HTMLInputElement;
    expect(container.querySelector("output")?.textContent).toBe("All years");

    slider.value = "2";
    slider.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenLastCalledWith(byLabel("1990s"));
    expect(container.querySelector("output")?.textContent).toBe("1990s");
    expect(slider.getAttribute("aria-valuetext")).toBe("1990s");

    timeline.reset();
    expect(onChange).toHaveBeenLastCalledWith(ALL_YEARS);
    expect(slider.value).toBe("0");
  });
});
