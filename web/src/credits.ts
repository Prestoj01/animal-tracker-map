import { citationNodes, type GbifCitation } from "./gbifCitation";
import type { Profiles } from "./profiles";
import type { Species } from "./species";
import { licenceName, type Tracks } from "./tracks";

export interface CreditLoaders {
  species: () => Promise<Species[]>;
  tracks: (id: string) => Promise<Tracks>;
  profiles: () => Promise<Profiles>;
  gbif: () => Promise<GbifCitation | null>;
}

function link(text: string, href: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = text;
  anchor.rel = "noopener";
  return anchor;
}

function item(...content: (string | Node)[]): HTMLLIElement {
  const entry = document.createElement("li");
  entry.append(...content);
  return entry;
}

/**
 * Fills a credits list through its loading, empty, failed and ready states. A
 * failure offers a retry, and leaves the rest of the page as it was.
 */
async function fill(
  list: HTMLElement,
  build: () => Promise<HTMLLIElement[]>,
  emptyText: string,
): Promise<void> {
  list.replaceChildren(item("Loading…"));
  list.setAttribute("aria-busy", "true");
  try {
    const entries = await build();
    list.replaceChildren(...(entries.length ? entries : [item(emptyText)]));
  } catch (error) {
    console.error("Could not load credits", error);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => void fill(list, build, emptyText));
    list.replaceChildren(item("Could not load these credits. ", retry));
  } finally {
    list.removeAttribute("aria-busy");
  }
}

export interface CreditLists {
  gbif: HTMLElement;
  studies: HTMLElement;
  photos: HTMLElement;
}

/** Lists the GBIF citation, every Movebank study, and every photo's author and licence. */
export function renderCredits(lists: CreditLists, load: CreditLoaders): Promise<void[]> {
  const gbif = fill(
    lists.gbif,
    async () => {
      return [item(...citationNodes(await load.gbif()))];
    },
    "",
  );

  const studies = fill(
    lists.studies,
    async () => {
      const species = await load.species();
      const all = await Promise.all(species.map((entry) => load.tracks(entry.id)));
      return all.flatMap((tracks, index) => {
        const study = tracks.study;
        if (!study || tracks.tracks.length === 0) {
          return [];
        }
        const name = document.createElement("strong");
        name.textContent = species[index].commonName;
        return [
          item(
            name,
            `: ${study.citation} (${licenceName(study.licenseType)}). `,
            link("Movebank study", study.url),
          ),
        ];
      });
    },
    "No tracking studies are shown yet.",
  );

  const photos = fill(
    lists.photos,
    async () => {
      const [species, profiles] = await Promise.all([load.species(), load.profiles()]);
      return species.flatMap((entry) => {
        const photo = profiles[entry.id]?.photo;
        if (!photo) {
          return [];
        }
        const name = document.createElement("strong");
        name.textContent = entry.commonName;
        return [
          item(
            name,
            `: photo by ${photo.author}, `,
            link(photo.licence, photo.licenceUrl),
            ", via ",
            link("Wikimedia Commons", photo.sourceUrl),
          ),
        ];
      });
    },
    "No photos are shown yet.",
  );

  return Promise.all([gbif, studies, photos]);
}
