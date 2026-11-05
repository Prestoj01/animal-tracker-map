import { describe, expect, it, vi } from "vitest";
import { createTrackColouring } from "./trackColouring";
import { MONTH_STEPS } from "./tracks";

describe("createTrackColouring", () => {
  it("switches between animal and month colours, with a named key", () => {
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    const onChange = vi.fn();
    const colouring = createTrackColouring(container, onChange);
    const input = container.querySelector("input") as HTMLInputElement;
    const key = container.querySelector(".month-key") as HTMLElement;
    expect(key.hidden).toBe(true);

    input.click();
    expect(onChange).toHaveBeenLastCalledWith("month");
    expect(key.hidden).toBe(false);
    expect([...key.querySelectorAll("li")].map((step) => step.textContent)).toEqual(
      MONTH_STEPS.map((step) => step.label),
    );

    colouring.set("animal");
    expect(input.checked).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith("animal");
    expect(key.hidden).toBe(true);
  });
});
