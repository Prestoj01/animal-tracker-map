import { describe, expect, it } from "vitest";
import { parseSightings } from "./sightings";

const valid = { speciesId: "lion", totalRecords: 2, points: [[36.8, -1.3]] };

describe("parseSightings", () => {
  it("accepts valid data, including no points", () => {
    expect(parseSightings(valid, "lion")).toEqual(valid);
    expect(parseSightings({ ...valid, points: [] }, "lion").points).toEqual([]);
  });

  it("rejects data for another species", () => {
    expect(() => parseSightings(valid, "tiger")).toThrow("Expected sightings for tiger");
  });

  it.each([
    [null],
    [{ speciesId: "lion", points: [] }],
    [{ speciesId: "lion", totalRecords: 1 }],
    [{ ...valid, points: [[1]] }],
    [{ ...valid, points: [["1", "2"]] }],
  ])("rejects malformed data %j", (data) => {
    expect(() => parseSightings(data, "lion")).toThrow();
  });
});
