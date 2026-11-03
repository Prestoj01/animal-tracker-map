import { describe, expect, it } from "vitest";
import { speciesIcon } from "./speciesIcons";

describe("speciesIcon", () => {
  it("has an icon for known species and a fallback for new ones", () => {
    expect(speciesIcon("lion")).toBe("🦁");
    expect(speciesIcon("unknown-animal")).toBe("🐾");
  });
});
