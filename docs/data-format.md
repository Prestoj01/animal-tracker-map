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
