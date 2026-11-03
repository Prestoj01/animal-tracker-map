import { describe, expect, it } from "vitest";
import { createBottomSheet, nextOnTap, settle, visibleHeight } from "./bottomSheet";

const viewport = 800;

describe("settle", () => {
  it("snaps to the nearest height", () => {
    expect(settle(130, viewport, 0)).toBe("peek");
    expect(settle(390, viewport, 0)).toBe("half");
    expect(settle(700, viewport, 0)).toBe("full");
  });

  it("follows a quick flick to the next height", () => {
    expect(settle(400, viewport, -1)).toBe("full");
    expect(settle(400, viewport, 1)).toBe("peek");
    expect(settle(720, viewport, -1)).toBe("full");
    expect(settle(120, viewport, 1)).toBe("peek");
  });
});

describe("heights", () => {
  it("peeks at a fixed height and scales the others with the screen", () => {
    expect(visibleHeight("peek", viewport)).toBe(120);
    expect(visibleHeight("half", viewport)).toBe(400);
    expect(visibleHeight("full", viewport)).toBe(720);
  });

  it("steps up on tap and wraps back to peek", () => {
    expect(nextOnTap("peek")).toBe("half");
    expect(nextOnTap("half")).toBe("full");
    expect(nextOnTap("full")).toBe("peek");
  });
});

describe("createBottomSheet", () => {
  it("starts half open and cycles on click, keeping the handle's label current", () => {
    const sheet = document.createElement("aside");
    const handle = document.createElement("button");
    const api = createBottomSheet(sheet, handle);

    expect(sheet.dataset.sheet).toBe("half");
    handle.click();
    expect(sheet.dataset.sheet).toBe("full");
    expect(handle.getAttribute("aria-label")).toBe("Shrink the animal list");

    api.set("peek");
    expect(sheet.dataset.sheet).toBe("peek");
    expect(handle.getAttribute("aria-expanded")).toBe("false");
  });
});
