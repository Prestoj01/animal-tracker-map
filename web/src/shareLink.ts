/** Keeps the picked animals in the page address, so a link reopens the same map. */

const PARAM = "animals";

/** The animal ids in a query string, in order and without repeats. */
export function readAnimals(search: string): string[] {
  const value = new URLSearchParams(search).get(PARAM) ?? "";
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/** The same address with `ids` as its animals, or without them if there are none. */
export function withAnimals(href: string, ids: string[]): string {
  const url = new URL(href);
  if (ids.length > 0) {
    url.searchParams.set(PARAM, ids.join(","));
  } else {
    url.searchParams.delete(PARAM);
  }
  // Commas read better in a shared link than %2C, and are valid in a query.
  return url.toString().replaceAll("%2C", ",");
}

/**
 * Copies `text` to the clipboard. Returns false if the browser refuses, so the
 * caller can offer another way to copy it.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Could not copy the link", error);
    return false;
  }
}
