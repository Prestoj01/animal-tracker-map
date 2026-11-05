import type { SightingsMap } from "./map";

/**
 * Stands in for the map while its library downloads, so the animal list can be
 * used straight away. Anything asked of the map before then is replayed in order
 * once it arrives.
 */
export function createLazyMap(
  loading: Promise<SightingsMap>,
  onFail: (error: unknown) => void,
): SightingsMap {
  let map: SightingsMap | null = null;
  let queue: ((map: SightingsMap) => void)[] = [];

  loading.then(
    (loaded) => {
      map = loaded;
      queue.forEach((call) => call(loaded));
      queue = [];
    },
    (error: unknown) => {
      queue = [];
      console.error("Could not load the map", error);
      onFail(error);
    },
  );

  const later = (call: (map: SightingsMap) => void) => {
    if (map) {
      call(map);
    } else {
      queue.push(call);
    }
  };

  return {
    showSightings: (...args) => later((map) => map.showSightings(...args)),
    showTracks: (...args) => later((map) => map.showTracks(...args)),
    hideSpecies: (...args) => later((map) => map.hideSpecies(...args)),
    setKindVisible: (...args) => later((map) => map.setKindVisible(...args)),
    showYouAreHere: (...args) => later((map) => map.showYouAreHere(...args)),
    playTracks(handlers) {
      // There is nothing to replay until the map exists.
      if (!map) {
        handlers.onEnd();
        return () => {};
      }
      return map.playTracks(handlers);
    },
  };
}
