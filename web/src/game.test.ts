import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHOICES, createGame, makeRound, type GameOptions } from "./game";
import type { SightingPoint } from "./sightings";
import type { Species } from "./species";

const species: Species[] = ["lion", "tiger", "giraffe", "puma", "caribou"].map((id) => ({
  id,
  commonName: id[0].toUpperCase() + id.slice(1),
  scientificName: id,
}));

/** Always picks the first remaining item, so rounds are predictable. */
const first = () => 0;

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("section");
  container.hidden = true;
  document.body.replaceChildren(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function options(overrides: Partial<GameOptions> = {}): GameOptions {
  return {
    loadSpecies: async () => species,
    loadPoints: async () => [[1, 2, 2000]] as SightingPoint[],
    show: vi.fn(),
    hide: vi.fn(),
    onPlayingChange: vi.fn(),
    random: first,
    ...overrides,
  };
}

function choiceButtons() {
  return [...container.querySelectorAll<HTMLButtonElement>(".game-choices button")];
}

function button(text: string) {
  return [...container.querySelectorAll("button")].find((element) =>
    element.textContent?.includes(text),
  ) as HTMLButtonElement;
}

describe("makeRound", () => {
  it("offers the answer among distinct decoys", () => {
    const round = makeRound(species, new Set(), Math.random)!;
    expect(round.choices).toHaveLength(CHOICES);
    expect(round.choices).toContain(round.answer);
    expect(new Set(round.choices).size).toBe(CHOICES);
  });

  it("asks every animal once before repeating", () => {
    const asked = new Set<string>();
    const answers = species.map(() => {
      const round = makeRound(species, asked, Math.random)!;
      asked.add(round.answer.id);
      return round.answer.id;
    });
    expect(new Set(answers).size).toBe(species.length);
    expect(makeRound(species, asked)).not.toBeNull();
    expect(asked.size).toBe(0);
  });

  it("needs at least two animals", () => {
    expect(makeRound(species.slice(0, 1), new Set())).toBeNull();
  });
});

describe("createGame", () => {
  it("shows the mystery sightings and scores a right answer", async () => {
    const setup = options();
    const game = createGame(container, setup);

    game.start();
    expect(setup.onPlayingChange).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain("Finding a mystery animal");
    await vi.waitFor(() => expect(choiceButtons()).toHaveLength(CHOICES));
    expect(setup.show).toHaveBeenCalledWith([[1, 2, 2000]]);

    // With `first`, the answer is the lion.
    button("Lion").click();
    expect(container.textContent).toContain("Yes! It's the lion");
    expect(container.textContent).toContain("Score: 1 of 1");
    expect(choiceButtons().every((choice) => choice.disabled)).toBe(true);
    expect(button("Lion").classList.contains("game-right")).toBe(true);
  });

  it("marks a wrong answer and reveals the right one", async () => {
    createGame(container, options()).start();
    await vi.waitFor(() => expect(choiceButtons()).toHaveLength(CHOICES));

    const wrong = choiceButtons().find((choice) => !choice.textContent?.includes("Lion"))!;
    wrong.click();
    expect(wrong.classList.contains("game-wrong")).toBe(true);
    expect(container.textContent).toContain("Not quite: it's the lion");
    expect(container.textContent).toContain("Score: 0 of 1");
  });

  it("moves on to a different animal", async () => {
    const setup = options();
    createGame(container, setup).start();
    await vi.waitFor(() => expect(choiceButtons()).toHaveLength(CHOICES));
    button("Lion").click();

    button("Next animal").click();
    await vi.waitFor(() =>
      expect(choiceButtons().filter((choice) => !choice.disabled)).toHaveLength(CHOICES),
    );
    button("Tiger").click();
    expect(container.textContent).toContain("Yes! It's the tiger");
    expect(container.textContent).toContain("Score: 2 of 2");
  });

  it("skips animals without sightings", async () => {
    const loadPoints = vi.fn(async (id: string) =>
      id === "lion" ? [] : ([[1, 2]] as SightingPoint[]),
    );
    createGame(container, options({ loadPoints })).start();
    await vi.waitFor(() => expect(choiceButtons()).toHaveLength(CHOICES));
    button("Tiger").click();
    expect(container.textContent).toContain("Yes! It's the tiger");
  });

  it("has an empty state", async () => {
    createGame(container, options({ loadPoints: async () => [] })).start();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("aren't enough animals with sightings"),
    );
  });

  it("shows a failure that can retry", async () => {
    const loadSpecies = vi
      .fn<() => Promise<Species[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(species);
    createGame(container, options({ loadSpecies })).start();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Could not load a mystery animal"),
    );

    button("Try again").click();
    await vi.waitFor(() => expect(choiceButtons()).toHaveLength(CHOICES));
  });

  it("stops: clears the map and panel, and ignores a late round", async () => {
    let resolve: (points: SightingPoint[]) => void = () => {};
    const setup = options({ loadPoints: () => new Promise((r) => (resolve = r)) });
    const game = createGame(container, setup);
    game.start();
    await vi.waitFor(() => expect(setup.hide).toHaveBeenCalled());

    button("Stop playing").click();
    expect(container.hidden).toBe(true);
    expect(setup.onPlayingChange).toHaveBeenLastCalledWith(false);

    resolve([[1, 2]]);
    await new Promise((r) => setTimeout(r));
    expect(setup.show).not.toHaveBeenCalled();
    expect(container.hidden).toBe(true);
  });
});
