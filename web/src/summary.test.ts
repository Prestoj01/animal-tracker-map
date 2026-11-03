import { describe, expect, it } from "vitest";
import { parseSummary } from "./summary";

describe("parseSummary", () => {
  it("accepts counts per species", () => {
    const summary = { lion: { sightings: 3, tracks: 0 } };
    expect(parseSummary(summary)).toEqual(summary);
  });

  it.each([[null], [[]], [{ lion: { sightings: "3", tracks: 0 } }], [{ lion: null }]])(
    "rejects malformed data %j",
    (data) => {
      expect(() => parseSummary(data)).toThrow();
    },
  );
});
