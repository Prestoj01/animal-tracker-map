import { describe, expect, it } from "vitest";
import { parseProfiles } from "./profiles";

const profile = {
  title: "Cougar",
  description: "",
  extract: "",
  url: "https://en.wikipedia.org/wiki/Cougar",
  photo: null,
};

describe("parseProfiles", () => {
  it("accepts profiles with or without photos", () => {
    const withPhoto = {
      ...profile,
      photo: { url: "u", author: "a", licence: "CC0", licenceUrl: "", sourceUrl: "s" },
    };
    expect(parseProfiles({ puma: profile, lion: withPhoto })).toEqual({
      puma: profile,
      lion: withPhoto,
    });
  });

  it.each([[null], [[]], [{ puma: { url: "u" } }], [{ puma: { ...profile, photo: { url: "u" } } }]])(
    "rejects malformed data %j",
    (data) => {
      expect(() => parseProfiles(data)).toThrow();
    },
  );
});
