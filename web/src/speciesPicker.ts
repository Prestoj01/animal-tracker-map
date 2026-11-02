import type { Species } from "./species";

// Map dots can sit beside any other colour, so every pair must stay distinct. This
// is the largest set that passes that check for normal and colour-blind vision,
// which is why selection is capped at its length. Validated against the basemap.
export const SERIES_COLORS = ["#2a78d6", "#e34948", "#eda100", "#008300", "#1baf7a"];

export interface RowStatus {
  /** Shows text beside the species, with a retry button if `retry` is given. */
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

function showPicker(
  container: HTMLElement,
  species: Species[],
  handlers: PickerHandlers,
): void {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = `Species (up to ${SERIES_COLORS.length} at once)`;

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear all";
  clear.disabled = true;

  // The colour stays with the species until it is deselected, so changing the
  // selection never repaints what is already on the map.
  const colorOf = new Map<string, string>();
  const rows: {
    checkbox: HTMLInputElement;
    swatch: HTMLElement;
    status: HTMLElement;
    species: Species;
  }[] = [];

  const refresh = () => {
    const full = colorOf.size >= SERIES_COLORS.length;
    for (const { checkbox } of rows) {
      checkbox.disabled = full && !checkbox.checked;
    }
    clear.disabled = colorOf.size === 0;
  };

  const deselect = (row: (typeof rows)[number]) => {
    colorOf.delete(row.species.id);
    row.checkbox.checked = false;
    row.swatch.style.backgroundColor = "";
    row.status.replaceChildren();
    handlers.onDeselect(row.species);
  };

  const list = document.createElement("ul");
  list.className = "species-list";
  for (const entry of species) {
    const item = document.createElement("li");
    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry.id;

    const swatch = document.createElement("span");
    swatch.className = "swatch";

    const name = document.createElement("span");
    name.className = "species-name";
    name.textContent = entry.commonName;
    name.title = entry.scientificName;

    const status = document.createElement("span");
    status.className = "species-status";
    status.setAttribute("aria-live", "polite");

    label.append(checkbox, swatch, name);
    item.append(label, status);
    list.append(item);

    const row = { checkbox, swatch, status, species: entry };
    rows.push(row);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        const used = new Set(colorOf.values());
        const color = SERIES_COLORS.find((candidate) => !used.has(candidate));
        if (!color) {
          checkbox.checked = false;
          return;
        }
        colorOf.set(entry.id, color);
        swatch.style.backgroundColor = color;
        handlers.onSelect(entry, color, createStatus(status));
      } else {
        deselect(row);
      }
      refresh();
    });
  }

  clear.addEventListener("click", () => {
    rows.filter(({ checkbox }) => checkbox.checked).forEach(deselect);
    refresh();
  });

  fieldset.append(legend, list);
  container.replaceChildren(fieldset, clear);
}

/** Renders the picker through its loading, empty, failed and ready states. */
export async function renderSpeciesPicker(
  container: HTMLElement,
  load: () => Promise<Species[]>,
  handlers: PickerHandlers,
): Promise<void> {
  showMessage(container, "Loading species…");
  try {
    const species = await load();
    if (species.length === 0) {
      showMessage(container, "No species available yet.");
    } else {
      showPicker(container, species, handlers);
    }
  } catch (error) {
    console.error("Could not load species", error);
    const message = showMessage(container, "Could not load species. ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      void renderSpeciesPicker(container, load, handlers);
    });
    message.append(retry);
  }
}
