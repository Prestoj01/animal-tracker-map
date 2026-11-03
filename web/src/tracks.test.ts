import { describe, expect, it } from "vitest";
import {
  licenceName,
  parseTracks,
  splitAtAntimeridian,
  trackLabel,
  trackSoFar,
  type Track,
} from "./tracks";

const study = {
  id: 1,
  name: "Lions",
  citation: "Someone 2020",
  licenseType: "CC_BY",
  url: "https://www.movebank.org/x",
  firstYear: 2010,
  lastYear: 2012,
};
const rain: Track = {
  animal: "Rain",
  start: "2020-01-30",
  points: [
    [0, 0, 0],
    [10, 0, 10],
    [10, 20, 30],
  ],
};
const valid = { speciesId: "lion", study, tracks: [rain] };

describe("parseTracks", () => {
  it("accepts valid data and species without a study", () => {
    expect(parseTracks(valid, "lion")).toEqual(valid);
    const none = { speciesId: "lion", study: null, tracks: [] };
    expect(parseTracks(none, "lion")).toEqual(none);
  });

  it("rejects data for another species", () => {
    expect(() => parseTracks(valid, "tiger")).toThrow("Expected tracks for tiger");
  });

  it.each([
    [null],
    [{ speciesId: "lion", study }],
    [{ ...valid, tracks: [[[1, 2], [3, 4]]] }],
    [{ ...valid, tracks: [{ ...rain, points: [[1, 2]] }] }],
    [{ ...valid, tracks: [{ ...rain, animal: undefined }] }],
    [{ ...valid, study: { name: "x" } }],
  ])("rejects malformed data %j", (data) => {
    expect(() => parseTracks(data, "lion")).toThrow();
  });
});

describe("splitAtAntimeridian", () => {
  it("leaves ordinary tracks whole", () => {
    expect(splitAtAntimeridian([[0, 0], [10, 0], [20, 0]])).toEqual([[[0, 0], [10, 0], [20, 0]]]);
  });

  it("splits where a track crosses 180°", () => {
    expect(
      splitAtAntimeridian([
        [170, 0],
        [179, 1],
        [-179, 2],
        [-170, 3],
      ]),
    ).toEqual([
      [
        [170, 0],
        [179, 1],
      ],
      [
        [-179, 2],
        [-170, 3],
      ],
    ]);
  });

  it("drops single-point pieces", () => {
    expect(splitAtAntimeridian([[179, 0], [-179, 0], [-178, 0]])).toEqual([
      [
        [-179, 0],
        [-178, 0],
      ],
    ]);
  });
});

describe("licenceName", () => {
  it("names common licences and falls back for others", () => {
    expect(licenceName("CC_BY_NC")).toBe("CC BY-NC");
    expect(licenceName("CC_0")).toBe("CC0");
    expect(licenceName("CUSTOM_TERMS")).toBe("CUSTOM TERMS");
  });
});

describe("trackLabel", () => {
  it("names the animal and the months it was tracked", () => {
    expect(trackLabel("Lion", rain)).toBe("Lion · Rain · Jan 2020 – Feb 2020");
  });

  it("shows one month for a short track", () => {
    const short = { ...rain, points: rain.points.slice(0, 2) };
    expect(trackLabel("Lion", { ...short, start: "2020-03-01" })).toBe("Lion · Rain · Mar 2020");
  });
});

describe("trackSoFar", () => {
  it("cuts a track at a share of its timespan, placing the animal between fixes", () => {
    expect(trackSoFar(rain, 0.5)).toEqual({
      line: [
        [0, 0],
        [10, 0],
        [10, 5],
      ],
      head: [10, 5],
    });
  });

  it("starts at the first point and ends at the last", () => {
    expect(trackSoFar(rain, 0).head).toEqual([0, 0]);
    expect(trackSoFar(rain, 1).line).toHaveLength(3);
  });
});
