import type { Species } from "./species";

function showMessage(container: HTMLElement, text: string): HTMLElement {
  const message = document.createElement("p");
  message.className = "picker-message";
  message.setAttribute("role", "status");
  message.textContent = text;
  container.replaceChildren(message);
  return message;
}

function showPicker(container: HTMLElement, species: Species[]): void {
  const label = document.createElement("label");
  label.textContent = "Species ";

  const select = document.createElement("select");
  select.add(new Option("Choose a species", ""));
  for (const { id, commonName } of species) {
    select.add(new Option(commonName, id));
  }
  label.append(select);

  const selection = document.createElement("p");
  selection.className = "picker-selection";
  selection.setAttribute("aria-live", "polite");

  select.addEventListener("change", () => {
    const chosen = species.find(({ id }) => id === select.value);
    selection.textContent = chosen
      ? `${chosen.commonName} (${chosen.scientificName})`
      : "";
  });

  container.replaceChildren(label, selection);
}

/** Renders the picker through its loading, empty, failed and ready states. */
export async function renderSpeciesPicker(
  container: HTMLElement,
  load: () => Promise<Species[]>,
): Promise<void> {
  showMessage(container, "Loading species…");
  try {
    const species = await load();
    if (species.length === 0) {
      showMessage(container, "No species available yet.");
    } else {
      showPicker(container, species);
    }
  } catch (error) {
    console.error("Could not load species", error);
    const message = showMessage(container, "Could not load species. ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      void renderSpeciesPicker(container, load);
    });
    message.append(retry);
  }
}
