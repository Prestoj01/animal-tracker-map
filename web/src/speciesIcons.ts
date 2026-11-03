const ICONS: Record<string, string> = {
  tiger: "🐅",
  lion: "🦁",
  "african-bush-elephant": "🐘",
  "african-forest-elephant": "🐘",
  "asian-elephant": "🐘",
  giraffe: "🦒",
  leopard: "🐆",
  "giant-panda": "🐼",
  cheetah: "🐆",
  "polar-bear": "🐻‍❄️",
  "grey-wolf": "🐺",
  "western-gorilla": "🦍",
  "eastern-gorilla": "🦍",
  chimpanzee: "🐒",
  koala: "🐨",
  orca: "🐋",
  jaguar: "🐆",
  "brown-bear": "🐻",
  "plains-zebra": "🦓",
  "humpback-whale": "🐋",
  "blue-whale": "🐳",
  "green-sea-turtle": "🐢",
  "emperor-penguin": "🐧",
  "bald-eagle": "🦅",
  "snowy-owl": "🦉",
};

/** An emoji for each species, with a paw print for any added later. */
export function speciesIcon(id: string): string {
  return ICONS[id] ?? "🐾";
}
