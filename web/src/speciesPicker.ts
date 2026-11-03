import type { Species } from "./species";
import { speciesIcon } from "./speciesIcons";

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

interface Card {
  item: HTMLElement;
  checkbox: HTMLInputElement;
  swatch: HTMLElement;
  status: HTMLElement;
  species: Species;
}

function createCard(species: Species): Card {
  const item = document.createElement("li");
  item.className = "species-card";

  // The checkbox stays in the page for keyboards and screen readers; the card is
  // its visible label.
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = species.id;
  checkbox.className = "visually-hidden";

  const icon = document.createElement("span");
  icon.className = "card-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = speciesIcon(species.id);

  const name = document.createElement("span");
  name.className = "species-name";
  name.textContent = species.commonName;
  name.title = species.scientificName;

  const swatch = document.createElement("span");
  swatch.className = "swatch";

  const status = document.createElement("span");
  status.className = "species-status";
  status.setAttribute("aria-live", "polite");

  label.append(checkbox, swatch, icon, name);
  item.append(label, status);
  return { item, checkbox, swatch, status, species };
}

function showPicker(
  container: HTMLElement,
  species: Species[],
  handlers: PickerHandlers,
): void {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const heading = document.createElement("span");
  heading.setAttribute("aria-live", "polite");

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear-button";
  clear.textContent = "Clear all";
  clear.disabled = true;

  // The colour stays with the species until it is deselected, so changing the
  // selection never repaints what is already on the map.
  const colorOf = new Map<string, string>();
  const cards = species.map(createCard);

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
  };

  const deselect = (card: Card) => {
    colorOf.delete(card.species.id);
    card.checkbox.checked = false;
    card.item.style.removeProperty("--series");
    card.swatch.style.backgroundColor = "";
    card.status.replaceChildren();
    handlers.onDeselect(card.species);
  };

  const list = document.createElement("ul");
  list.className = "species-grid";
  for (const card of cards) {
    list.append(card.item);
    card.checkbox.addEventListener("change", () => {
      if (card.checkbox.checked) {
        const used = new Set(colorOf.values());
        const color = SERIES_COLORS.find((candidate) => !used.has(candidate));
        if (!color) {
          card.checkbox.checked = false;
          return;
        }
        colorOf.set(card.species.id, color);
        card.item.style.setProperty("--series", color);
        card.swatch.style.backgroundColor = color;
        handlers.onSelect(card.species, color, createStatus(card.status));
      } else {
        deselect(card);
      }
      refresh();
    });
  }

  clear.addEventListener("click", () => {
    cards.filter(({ checkbox }) => checkbox.checked).forEach(deselect);
    refresh();
  });

  legend.append(heading, clear);
  fieldset.append(legend, list);
  container.replaceChildren(fieldset);
  refresh();
}

/** Renders the picker through its loading, empty, failed and ready states. */
export async function renderSpeciesPicker(
  container: HTMLElement,
  load: () => Promise<Species[]>,
  handlers: PickerHandlers,
): Promise<void> {
  showMessage(container, "Loading animals…");
  try {
    const species = await load();
    if (species.length === 0) {
      showMessage(container, "No animals available yet.");
    } else {
      showPicker(container, species, handlers);
    }
  } catch (error) {
    console.error("Could not load species", error);
    const message = showMessage(container, "Could not load animals. ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      void renderSpeciesPicker(container, load, handlers);
    });
    message.append(retry);
  }
}
