import { describe, expect, it } from "vitest";
import { parseSpecies } from "./species";

const wolf = {
  id: "grey-wolf",
  commonName: "Grey wolf",
  scientificName: "Canis lupus",
};

describe("parseSpecies", () => {
  it("accepts valid entries and an empty list", () => {
    expect(parseSpecies([wolf])).toEqual([wolf]);
    expect(parseSpecies([])).toEqual([]);
  });

  it("rejects anything but an array", () => {
    expect(() => parseSpecies({ species: [] })).toThrow("must be an array");
  });

  it.each([
    [{ ...wolf, id: "" }, "species[0].id"],
    [{ ...wolf, commonName: 3 }, "species[0].commonName"],
    [{ id: "x", commonName: "X" }, "species[0].scientificName"],
    [null, "species[0].id"],
  ])("rejects invalid entry %j", (entry, message) => {
    expect(() => parseSpecies([entry])).toThrow(message);
  });

  it("rejects duplicate ids", () => {
    expect(() => parseSpecies([wolf, wolf])).toThrow("Duplicate species id");
  });
});
