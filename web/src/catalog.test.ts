import { describe, expect, it } from "vitest";
import speciesList from "../../data/species.json";
import { GROUPS, PRESETS, randomPick, speciesGroup, speciesIcon } from "./catalog";
import { SERIES_COLORS } from "./speciesPicker";

const ids = new Set(speciesList.map((species) => species.id));

describe("catalog", () => {
  it("has an icon and group for known species, and fallbacks for new ones", () => {
    expect(speciesIcon("lion")).toBe("🦁");
    expect(speciesGroup("lion")).toBe("Big cats");
    expect(speciesIcon("unknown-animal")).toBe("🐾");
    expect(speciesGroup("unknown-animal")).toBe("Other animals");
  });

  it("puts every species in data/species.json into a named group", () => {
    for (const id of ids) {
      expect(GROUPS).toContain(speciesGroup(id));
    }
  });

  it("only uses real species in presets, within the colour limit", () => {
    for (const preset of PRESETS) {
      expect(preset.ids.length).toBeLessThanOrEqual(SERIES_COLORS.length);
      for (const id of preset.ids) {
        expect(ids).toContain(id);
      }
    }
  });
});

describe("randomPick", () => {
  it("picks the requested number of different ids", () => {
    const picked = randomPick(["a", "b", "c", "d"], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("follows the random source, and stops when it runs out of ids", () => {
    expect(randomPick(["a", "b", "c"], 2, () => 0)).toEqual(["a", "b"]);
    expect(randomPick(["a", "b"], 5, () => 0.99)).toEqual(["b", "a"]);
  });
});

