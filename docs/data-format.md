# Data format

## `data/species.json`

A JSON array of species. The web app fetches it at runtime as `/species.json`, because Vite's `publicDir` is `../data`. Every file in `data/` is therefore published with the site, so raw or licence-restricted data must not go there.

| Field            | Type   | Rules                         |
| ---------------- | ------ | ----------------------------- |
| `id`             | string | Non-empty, unique in the file |
| `commonName`     | string | Non-empty                     |
| `scientificName` | string | Non-empty                     |

Both consumers validate these rules: `web/src/species.ts` and `pipeline/src/animal_tracker_pipeline/species.py`. Change them together.
