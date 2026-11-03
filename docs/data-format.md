# Data format

## `data/species.json`

A JSON array of species. The web app fetches it at runtime as `/species.json`, because Vite's `publicDir` is `../data`. Every file in `data/` is therefore published with the site, so raw or licence-restricted data must not go there.

| Field            | Type   | Rules                         |
| ---------------- | ------ | ----------------------------- |
| `id`             | string | Non-empty, unique in the file |
| `commonName`     | string | Non-empty                     |
| `scientificName` | string | Non-empty                     |

Both consumers validate these rules: `web/src/species.ts` and `pipeline/src/animal_tracker_pipeline/species.py`. Change them together.

## `data/sightings/<species id>.json.gz`

Gzipped JSON, generated from GBIF by `pipeline/src/animal_tracker_pipeline/sightings.py` and read by `web/src/sightings.ts`.

| Field          | Type   | Meaning                                                    |
| -------------- | ------ | ---------------------------------------------------------- |
| `speciesId`    | string | Matches `id` in `species.json`                             |
| `totalRecords` | number | GBIF records that passed the filters, before sampling      |
| `points`       | array  | Unique `[longitude, latitude]` pairs, rounded to 0.1°      |

The points show where a species has been recorded, not how many animals are there:

- **Sampling:** up to about 3,000 records are split across a species' countries, with 30 to 300 from each. Points are capped per country and repeats are merged, so dense areas look thinner than they are.
- **Record types:** only human and machine observations are used, which leaves out museum specimens, fossils and records marked as zoo animals.
- **Excluded countries:** `EXCLUDED_COUNTRIES` lists countries outside a species' range, where records are captive or misidentified. It was written by hand from GBIF's per-country counts, so review it when species change.
- **Grey wolf:** GBIF files domestic dogs and dingoes under *Canis lupus*, so wolves are queried by their wild taxa using `TAXON_FILTERS`.

## `data/tracks/<species id>.json.gz`

Gzipped JSON, generated from Movebank by `pipeline/src/animal_tracker_pipeline/tracks.py` and read by `web/src/tracks.ts`.

| Field       | Type           | Meaning                                                                  |
| ----------- | -------------- | ------------------------------------------------------------------------ |
| `speciesId` | string         | Matches `id` in `species.json`                                           |
| `study`     | object or null | `id`, `name`, `citation`, `licenseType`, `url`, `firstYear`, `lastYear`; null when the species has no study |
| `tracks`    | array          | One line per animal: `[longitude, latitude]` pairs, rounded to 0.01°     |

- **Raw data:** Movebank data is streamed and reduced in memory. It is never written to disk or committed, as the Movebank rule in `CLAUDE.md` requires.
- **Reduction:** each animal keeps its first location per day, thinned to at most 400 points, for the 30 most-tracked animals.
- **Filtering:** the pipeline drops locations the data owner marked as outliers, locations with no animal assigned (a tag's readings before or after it was fitted), and animals of other species in shared studies.
- **Citations:** every study's citation and licence are shown on the site whenever its tracks are on the map. CC BY and CC BY-NC licences require this.
- **Licences:** a study's licence must be accepted on Movebank before its data can be downloaded. Until then, the pipeline reports it and the species shows "no tracks".
