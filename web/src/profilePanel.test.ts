import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfilePanel } from "./profilePanel";
import type { Profiles } from "./profiles";

const puma = { id: "puma", commonName: "Puma", scientificName: "Puma concolor" };
const profiles: Profiles = {
  puma: {
    title: "Cougar",
    description: "Wild cat of the Americas",
    extract: "The cougar is a large cat.",
    url: "https://en.wikipedia.org/wiki/Cougar",
    photo: {
      url: "https://upload.wikimedia.org/puma.jpg",
      author: "Jane Doe",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Puma.jpg",
    },
  },
};
const summary = { puma: { sightings: 120, tracks: 1 } };

let panel: HTMLElement;

function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

beforeEach(() => {
  panel = document.createElement("aside");
  document.body.replaceChildren(panel);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createProfilePanel", () => {
  it("starts hidden, shows loading, then the profile with credits and facts", async () => {
    const profilePanel = createProfilePanel(panel, async () => profiles, async () => summary);
    expect(panel.hidden).toBe(true);

    profilePanel.open(puma);
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Loading…");

    await flush();
    expect(panel.querySelector("h2")?.textContent).toContain("Puma");
    expect(panel.querySelector("img")?.getAttribute("alt")).toBe("Puma");
    expect(panel.querySelector("figcaption")?.textContent).toBe(
      "Photo: Jane Doe, CC BY-SA 4.0, via Wikimedia Commons",
    );
    expect(panel.textContent).toContain("The cougar is a large cat.");
    expect(panel.textContent).toContain("120 places");
    expect(panel.textContent).toContain("1 animal");
    expect(panel.textContent).toContain("Coming soon");
    const links = [...panel.querySelectorAll("a")].map((anchor) => anchor.href);
    expect(links).toContain("https://en.wikipedia.org/wiki/Cougar");
  });

  it("works without a photo or a summary", async () => {
    const profilePanel = createProfilePanel(
      panel,
      async () => ({ puma: { ...profiles.puma, photo: null } }),
      async () => null,
    );

    profilePanel.open(puma);
    await flush();

    expect(panel.querySelector("img")).toBeNull();
    expect(panel.textContent).toContain("The cougar is a large cat.");
  });

  it("shows an empty state for a species without a profile", async () => {
    const profilePanel = createProfilePanel(panel, async () => ({}), async () => summary);

    profilePanel.open(puma);
    await flush();

    expect(panel.textContent).toContain("No profile for Puma yet.");
  });

  it("shows a failed state that can retry", async () => {
    const load = vi
      .fn<() => Promise<Profiles>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(profiles);
    const profilePanel = createProfilePanel(panel, load, async () => summary);

    profilePanel.open(puma);
    await flush();
    expect(panel.textContent).toContain("Could not load this profile.");

    (panel.querySelector(".profile-message button") as HTMLButtonElement).click();
    await flush();
    expect(panel.querySelector("h2")?.textContent).toContain("Puma");
  });

  it("closes with its button or Escape and returns focus", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const profilePanel = createProfilePanel(panel, async () => profiles, async () => summary);

    profilePanel.open(puma);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    (panel.querySelector(".profile-close") as HTMLButtonElement).click();
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);

    profilePanel.open(puma);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(true);
  });
});
