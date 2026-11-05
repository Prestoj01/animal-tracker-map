import { describe, expect, it } from "vitest";
import { countPlaces, parseSightings, pointYear } from "./sightings";

const valid = { speciesId: "lion", totalRecords: 2, points: [[36.8, -1.3]] };

describe("parseSightings", () => {
  it("accepts valid data, including no points", () => {
    expect(parseSightings(valid, "lion")).toEqual(valid);
    expect(parseSightings({ ...valid, points: [] }, "lion").points).toEqual([]);
  });

  it("accepts points with a year, or an unknown one", () => {
    const points = [[36.8, -1.3, 2015], [36.8, -1.3, null]];
    expect(parseSightings({ ...valid, points }, "lion").points).toEqual(points);
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
    [{ ...valid, points: [[1, 2, 2015.5]] }],
    [{ ...valid, points: [[1, 2, "2015"]] }],
    [{ ...valid, points: [[1, 2, 3, 4]] }],
  ])("rejects malformed data %j", (data) => {
    expect(() => parseSightings(data, "lion")).toThrow();
  });
});

describe("pointYear and countPlaces", () => {
  it("reads years and counts each place once", () => {
    expect(pointYear([1, 2])).toBeNull();
    expect(pointYear([1, 2, null])).toBeNull();
    expect(pointYear([1, 2, 2001])).toBe(2001);
    expect(countPlaces([[1, 2, 2001], [1, 2, 2002], [3, 4]])).toBe(2);
  });
});
