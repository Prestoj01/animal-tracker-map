import { groupOrder, PRESETS, randomPick, speciesGroup, speciesIcon } from "./catalog";
import type { Species } from "./species";
import type { Summary } from "./summary";

// Map dots can sit beside any other colour, so every pair must stay distinct. This
// is the largest set that passes that check on the dark basemap, for normal and
// colour-blind vision, which is why selection is capped at its length. Yellow and
// green are only just apart for colour-blind readers, so the legend and hover
// labels must stay.
export const SERIES_COLORS = ["#3987e5", "#d55181", "#c98500", "#008300"];

export interface RowStatus {
  /** Shows text on the species' card, with a retry button if `retry` is given. */
  set(text: string, retry?: () => void): void;
}

export interface PickerHandlers {
  onSelect(species: Species, color: string, status: RowStatus): void;
  onDeselect(species: Species): void;
}

export interface PickerOptions {
  /** Data counts for badges. The picker still works without them. */
  loadSummary?: () => Promise<Summary>;
  /** Called with the picked species' ids, in the order they were picked. */
  onSelectionChange?: (ids: string[]) => void;
  /** Called once the cards are shown, with a way to change the selection. */
  onReady?: (api: PickerApi) => void;
  /** Called when the reader asks to learn more about a species. */
  onShowProfile?: (species: Species) => void;
}

export interface PickerApi {
  /** Replaces the selection with these species, as far as the colour limit allows. */
  pick(ids: string[]): void;
  /** Replaces the selection with `count` animals chosen at random. */
  pickRandom(count: number): void;
}

/** How many animals "Surprise me" picks: enough to compare, and room for one more. */
export const SURPRISE_COUNT = 3;

function showMessage(container: HTMLElement, text: string): HTMLElement {
  const message = document.createElement("p");
  message.className = "picker-message";
  message.setAttribute("role", "status");
  message.textContent = text;
  container.replaceChildren(message);
  return message;
}

function createStatus(element: HTMLElement): RowStatus {
  return {
    set(text, retry) {
      element.textContent = text;
      if (retry) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Try again";
        button.addEventListener("click", retry);
        element.append(" ", button);
      }
    },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

interface Card {
  item: HTMLElement;
  checkbox: HTMLInputElement;
  swatch: HTMLElement;
  status: HTMLElement;
  species: Species;
}

function createBadges(counts: Summary[string] | undefined): HTMLElement | null {
  if (!counts) {
    return null;
  }
  const badges = element("span", "badges");
  const add = (text: string, available: boolean, title: string) => {
    const badge = element("span", available ? "badge" : "badge badge-missing", text);
    badge.title = title;
    badges.append(badge);
  };
  add(
    "Sightings",
    counts.sightings > 0,
    counts.sightings > 0 ? "Has sightings" : "No sightings yet",
  );
  add(
    "Tracks",
    counts.tracks > 0,
    counts.tracks > 0 ? `${counts.tracks} animals tracked` : "No migration tracks",
  );
  return badges;
}

function createCard(
  species: Species,
  counts: Summary[string] | undefined,
  onShowProfile: (species: Species) => void,
): Card {
  const item = element("li", "species-card");

  // The checkbox stays in the page for keyboards and screen readers; the card is
  // its visible label.
  const label = document.createElement("label");
  const checkbox = element("input", "visually-hidden");
  checkbox.type = "checkbox";
  checkbox.value = species.id;

  const icon = element("span", "card-icon", speciesIcon(species.id));
  icon.setAttribute("aria-hidden", "true");
  const name = element("span", "species-name", species.commonName);
  name.title = species.scientificName;
  const swatch = element("span", "swatch");

  label.append(checkbox, swatch, icon, name);
  const badges = createBadges(counts);
  if (badges) {
    label.append(badges);
  }

  const status = element("span", "species-status");
  status.setAttribute("aria-live", "polite");

  // Outside the label, so asking about an animal doesn't also pick it.
  const info = element("button", "card-info", "i");
  info.type = "button";
  info.setAttribute("aria-label", `About ${species.commonName}`);
  info.addEventListener("click", () => onShowProfile(species));

  item.append(label, info, status);
  return { item, checkbox, swatch, status, species };
}

function showPicker(
  container: HTMLElement,
  species: Species[],
  summary: Summary | null,
  handlers: PickerHandlers,
  onSelectionChange: (ids: string[]) => void,
  onShowProfile: (species: Species) => void,
): PickerApi {
  // The colour stays with the species until it is deselected, so changing the
  // selection never repaints what is already on the map. Map order is pick order.
  const colorOf = new Map<string, string>();
  const cards = species.map((entry) => createCard(entry, summary?.[entry.id], onShowProfile));
  const cardOf = new Map(cards.map((card) => [card.species.id, card]));

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const heading = element("span", "");
  heading.setAttribute("aria-live", "polite");
  const clear = element("button", "clear-button", "Clear all");
  clear.type = "button";
  legend.append(heading, clear);

  // The tray lists what's on the map, so it can be read and changed without
  // scrolling through every card.
  const tray = element("ul", "picked-tray");
  tray.setAttribute("aria-label", "On the map");

  const presets = element("div", "presets");
  const presetLabel = element("span", "presets-label", "Quick picks");
  presets.append(presetLabel);

  const refresh = () => {
    const full = colorOf.size >= SERIES_COLORS.length;
    for (const { checkbox } of cards) {
      checkbox.disabled = full && !checkbox.checked;
    }
    clear.disabled = colorOf.size === 0;
    heading.textContent =
      colorOf.size === 0
        ? `Animals · pick up to ${SERIES_COLORS.length}`
        : `Animals · ${colorOf.size} of ${SERIES_COLORS.length} picked`;

    tray.replaceChildren(
      ...[...colorOf].map(([id, color]) => {
        const card = cardOf.get(id) as Card;
        const chip = element("li", "chip");
        chip.style.setProperty("--series", color);
        const dot = element("span", "swatch");
        dot.style.backgroundColor = color;
        const remove = element("button", "chip-remove", "✕");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${card.species.commonName}`);
        remove.addEventListener("click", () => {
          deselect(card);
          refresh();
        });
        const name = element("button", "chip-name", `${speciesIcon(id)} ${card.species.commonName}`);
        name.type = "button";
        name.title = `About ${card.species.commonName}`;
        name.addEventListener("click", () => onShowProfile(card.species));
        chip.append(dot, name, remove);
        return chip;
      }),
    );
    tray.hidden = colorOf.size === 0;
    onSelectionChange([...colorOf.keys()]);
  };

  const select = (card: Card): boolean => {
    const used = new Set(colorOf.values());
    const color = SERIES_COLORS.find((candidate) => !used.has(candidate));
    if (!color) {
      return false;
    }
    colorOf.set(card.species.id, color);
    card.checkbox.checked = true;
    card.item.style.setProperty("--series", color);
    card.swatch.style.backgroundColor = color;
    handlers.onSelect(card.species, color, createStatus(card.status));
    return true;
  };

  const deselect = (card: Card) => {
    colorOf.delete(card.species.id);
    card.checkbox.checked = false;
    card.item.style.removeProperty("--series");
    card.swatch.style.backgroundColor = "";
    card.status.replaceChildren();
    handlers.onDeselect(card.species);
  };

  const clearAll = () => {
    cards.filter(({ checkbox }) => checkbox.checked).forEach(deselect);
  };

  for (const card of cards) {
    card.checkbox.addEventListener("change", () => {
      if (card.checkbox.checked) {
        if (!select(card)) {
          card.checkbox.checked = false;
        }
      } else {
        deselect(card);
      }
      refresh();
    });
  }

  clear.addEventListener("click", () => {
    clearAll();
    refresh();
  });

  const api: PickerApi = {
    pick(ids) {
      clearAll();
      for (const id of ids) {
        const card = cardOf.get(id);
        if (card && !select(card)) {
          break;
        }
      }
      refresh();
    },
    pickRandom(count) {
      api.pick(randomPick([...cardOf.keys()], count));
    },
  };

  for (const preset of PRESETS) {
    const available = preset.ids.filter((id) => cardOf.has(id));
    if (available.length === 0) {
      continue;
    }
    const button = element("button", "preset", `${preset.icon} ${preset.label}`);
    button.type = "button";
    button.addEventListener("click", () => api.pick(available));
    presets.append(button);
  }
  const surprise = element("button", "preset preset-surprise", "🎲 Surprise me");
  surprise.type = "button";
  surprise.addEventListener("click", () => api.pickRandom(SURPRISE_COUNT));
  presets.append(surprise);

  const sections = groupOrder()
    .map((group) => {
      const members = cards.filter((card) => speciesGroup(card.species.id) === group);
      if (members.length === 0) {
        return null;
      }
      const section = element("section", "species-group");
      const title = element("h3", "group-title", group);
      const list = element("ul", "species-grid");
      list.append(...members.map((card) => card.item));
      section.append(title, list);
      return section;
    })
    .filter((section) => section !== null);

  fieldset.append(legend, tray, ...sections);
  container.replaceChildren(presets, fieldset);
  refresh();
  return api;
}

/** Renders the picker through its loading, empty, failed and ready states. */
export async function renderSpeciesPicker(
  container: HTMLElement,
  load: () => Promise<Species[]>,
  handlers: PickerHandlers,
  options: PickerOptions = {},
): Promise<void> {
  const {
    loadSummary,
    onSelectionChange = () => {},
    onReady = () => {},
    onShowProfile = () => {},
  } = options;
  showMessage(container, "Loading animals…");
  // Badges are a bonus: without the summary, the cards still work.
  const summaryRequest = loadSummary?.().catch((error: unknown) => {
    console.error("Could not load the data summary", error);
    return null;
  });
  try {
    const species = await load();
    if (species.length === 0) {
      showMessage(container, "No animals available yet.");
      return;
    }
    const summary = (await summaryRequest) ?? null;
    onReady(
      showPicker(container, species, summary, handlers, onSelectionChange, onShowProfile),
    );
  } catch (error) {
    console.error("Could not load species", error);
    const message = showMessage(container, "Could not load animals. ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      void renderSpeciesPicker(container, load, handlers, options);
    });
    message.append(retry);
  }
}
