import { renderCredits } from "./credits";
import { loadGbifCitation } from "./gbifCitation";
import { loadProfiles } from "./profiles";
import { loadSpecies } from "./species";
import { loadTracks } from "./tracks";
import "./style.css";

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in about.html`);
  }
  return element;
}

// Both lists need the species, so it loads once, or again after a failure.
let request: ReturnType<typeof loadSpecies> | undefined;
const species = () =>
  (request ??= loadSpecies().catch((error: unknown) => {
    request = undefined;
    throw error;
  }));

void renderCredits(
  { gbif: byId("credits-gbif"), studies: byId("credits-studies"), photos: byId("credits-photos") },
  { species, tracks: loadTracks, profiles: loadProfiles, gbif: loadGbifCitation },
);
