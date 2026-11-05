import { randomPick, speciesIcon } from "./catalog";
import type { SightingPoint } from "./sightings";
import type { Species } from "./species";

/** How many names to choose from each round. */
export const CHOICES = 4;
/** How many animals are tried before giving up on a round with no sightings. */
const ATTEMPTS = 5;

export interface Round {
  answer: Species;
  /** The answer and the decoys, shuffled. */
  choices: Species[];
}

/**
 * Picks an animal that hasn't been asked yet, plus decoys. Once every animal has
 * been asked, the list starts over.
 */
export function makeRound(
  species: Species[],
  asked: Set<string>,
  random: () => number = Math.random,
): Round | null {
  if (species.length < 2) {
    return null;
  }
  let fresh = species.filter((entry) => !asked.has(entry.id));
  if (fresh.length === 0) {
    asked.clear();
    fresh = species;
  }
  const [answerId] = randomPick(
    fresh.map((entry) => entry.id),
    1,
    random,
  );
  const answer = species.find((entry) => entry.id === answerId) as Species;
  const decoyIds = randomPick(
    species.filter((entry) => entry !== answer).map((entry) => entry.id),
    CHOICES - 1,
    random,
  );
  const shuffled = randomPick([answer.id, ...decoyIds], decoyIds.length + 1, random);
  return {
    answer,
    choices: shuffled.map((id) => species.find((entry) => entry.id === id) as Species),
  };
}

export interface GameOptions {
  loadSpecies: () => Promise<Species[]>;
  loadPoints: (speciesId: string) => Promise<SightingPoint[]>;
  /** Shows the mystery animal's sightings, unnamed. */
  show: (points: SightingPoint[]) => void;
  /** Takes the mystery animal off the map. */
  hide: () => void;
  /** Called when the game starts and stops, so the page can clear the map and restore it. */
  onPlayingChange: (playing: boolean) => void;
  random?: () => number;
}

export interface Game {
  start(): void;
  stop(): void;
}

function button(text: string, onClick: () => void, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** "Guess the animal": shows an animal's sightings and asks which animal it is. */
export function createGame(container: HTMLElement, options: GameOptions): Game {
  const asked = new Set<string>();
  let score = 0;
  let played = 0;
  let playing = false;
  // Each round has its own token, so a slow load can't show an old round.
  let round = 0;

  const scoreText = () => (played === 0 ? "" : `Score: ${score} of ${played}`);

  const render = (...content: Node[]) => {
    const heading = document.createElement("h2");
    heading.textContent = "🎯 Guess the animal";
    const score = document.createElement("p");
    score.className = "game-score";
    score.textContent = scoreText();
    const stop = button("Stop playing", () => game.stop(), "game-stop");
    container.replaceChildren(heading, ...content, score, stop);
    container.hidden = false;
  };

  const message = (text: string, retry?: () => void) => {
    const paragraph = document.createElement("p");
    paragraph.setAttribute("role", "status");
    paragraph.textContent = text;
    if (retry) {
      paragraph.append(" ", button("Try again", retry));
    }
    render(paragraph);
  };

  const ask = ({ answer, choices }: Round) => {
    const question = document.createElement("p");
    question.className = "game-question";
    question.textContent = "Whose sightings are these?";
    const options = document.createElement("div");
    options.className = "game-choices";
    const result = document.createElement("p");
    result.className = "game-result";
    result.setAttribute("role", "status");
    const next = button("Next animal →", () => void nextRound(), "game-next");
    next.hidden = true;

    const buttons = choices.map((choice) =>
      button(`${speciesIcon(choice.id)} ${choice.commonName}`, () => {
        played += 1;
        const right = choice === answer;
        if (right) {
          score += 1;
        }
        buttons.forEach((other, index) => {
          other.disabled = true;
          if (choices[index] === answer) {
            other.classList.add("game-right");
          } else if (choices[index] === choice) {
            other.classList.add("game-wrong");
          }
        });
        result.textContent = right
          ? `✅ Yes! It's the ${answer.commonName.toLowerCase()}.`
          : `❌ Not quite: it's the ${answer.commonName.toLowerCase()}.`;
        (container.querySelector(".game-score") as HTMLElement).textContent = scoreText();
        next.hidden = false;
        next.focus();
      }),
    );
    options.append(...buttons);
    render(question, options, result, next);
    buttons[0]?.focus();
  };

  const nextRound = async () => {
    const token = ++round;
    options.hide();
    message("Finding a mystery animal…");
    try {
      const species = await options.loadSpecies();
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const next = makeRound(species, asked, options.random);
        if (!next) {
          break;
        }
        asked.add(next.answer.id);
        const points = await options.loadPoints(next.answer.id);
        if (token !== round || !playing) {
          return;
        }
        if (points.length > 0) {
          options.show(points);
          ask(next);
          return;
        }
      }
      if (token === round) {
        message("There aren't enough animals with sightings to play yet.");
      }
    } catch (error) {
      if (token !== round || !playing) {
        return;
      }
      console.error("Could not load a round", error);
      message("Could not load a mystery animal.", () => void nextRound());
    }
  };

  const game: Game = {
    start() {
      if (playing) {
        return;
      }
      playing = true;
      score = 0;
      played = 0;
      options.onPlayingChange(true);
      void nextRound();
    },
    stop() {
      if (!playing) {
        return;
      }
      playing = false;
      round += 1;
      options.hide();
      container.hidden = true;
      container.replaceChildren();
      options.onPlayingChange(false);
    },
  };
  return game;
}
