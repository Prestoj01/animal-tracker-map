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
| `points`       | array  | Unique `[longitude, latitude, year]` entries, coordinates rounded to 0.1°; `year` is null when the record has none |

The points show where a species has been recorded, not how many animals are there:

- **Older records:** GBIF returns its newest records first, so the country sample is mostly recent. Up to 300 more records are sampled from each older period (before 1990, the 1990s, 2000s and 2010s) using `HISTORY_PERIODS`, which matches the slider's periods in `web/src/timeline.ts`.
- **Years:** a place recorded in several years appears once per year, so the site's time slider can show each decade. The site counts distinct places, and records with no year only appear under "All years". Older files may have `[longitude, latitude]` pairs, which the site still reads.
- **Sampling:** up to about 3,000 records are split across a species' countries, with 30 to 300 from each. Points are capped per country and repeats are merged, so dense areas look thinner than they are.
- **Record types:** only human and machine observations are used, which leaves out museum specimens, fossils and records marked as zoo animals.
- **Excluded countries:** `EXCLUDED_COUNTRIES` lists countries outside a species' range, where records are captive or misidentified. It was written by hand from GBIF's per-country counts, so review it when species change.
- **Grey wolf:** GBIF files domestic dogs and dingoes under *Canis lupus*, so wolves are queried by their wild taxa using `TAXON_FILTERS`.

## `data/gbif-datasets/<species id>.json.gz`

Gzipped JSON, `{ "speciesId": ..., "datasets": { "<GBIF dataset key>": <records used> } }`, written by the sightings pipeline beside each sightings file. It counts every record that produced a point, including repeats of a place, and leaves out records without coordinates or from excluded countries. The site doesn't load these; they exist for the GBIF citation.

## `data/gbif-citation.json`

The sightings' citation, written by `python -m animal_tracker_pipeline.citation --register`, which registers them with GBIF as a derived dataset and gets a DOI. Fields: `doi`, `url`, `citation` (such as "GBIF.org (5 November 2026) Derived dataset https://doi.org/..."), `registered`, `records`, `datasets` and `fingerprint`.

- **Until it exists**, the site credits "GBIF.org" without a DOI.
- **Registering is permanent and public**, so it's never automatic. Run the command without `--register` to preview the counts first.
- **Duplicates:** the fingerprint identifies the dataset counts, so registering unchanged data again does nothing. After a weekly refresh changes the sample, registering again creates a new DOI; doing that occasionally, such as before sharing the site widely, is enough.
- **Source link:** the registration points to `data/sightings` in this repository, so the repository must stay public.

## `data/tracks/<species id>.json.gz`

Gzipped JSON, generated from Movebank by `pipeline/src/animal_tracker_pipeline/tracks.py` and read by `web/src/tracks.ts`.

| Field       | Type           | Meaning                                                                  |
| ----------- | -------------- | ------------------------------------------------------------------------ |
| `speciesId` | string         | Matches `id` in `species.json`                                           |
| `study`     | object or null | `id`, `name`, `citation`, `licenseType`, `url`, `firstYear`, `lastYear`; null when the species has no study |
| `tracks`    | array          | One entry per animal: `animal` (the study's name or code for it), `start` (YYYY-MM-DD) and `points`, each `[longitude, latitude, day]` with coordinates rounded to 0.01° and `day` counted from `start` |

- **Raw data:** Movebank data is streamed and reduced in memory. It is never written to disk or committed, as the Movebank rule in `CLAUDE.md` requires.
- **Reduction:** each animal keeps its first location per day, thinned to at most 400 points, for the 30 most-tracked animals. Consecutive days in the same rounded spot are merged, keeping the first.
- **Dates:** the site uses `start` and `day` for hover labels like "Bald eagle · Freedom · May 2016 – Jan 2021", and to replay journeys.
- **Filtering:** the pipeline drops locations the data owner marked as outliers, locations with no animal assigned (a tag's readings before or after it was fitted), and animals of other species in shared studies.
- **Citations:** every study's citation and licence are shown on the site whenever its tracks are on the map. CC BY and CC BY-NC licences require this.
- **Licences:** a study's licence must be accepted on Movebank before its data can be downloaded. Until then, the pipeline reports it and the species shows "no tracks".

## `data/profiles.json.gz`

Gzipped JSON, keyed by species id, generated by `pipeline/src/animal_tracker_pipeline/profiles.py` and read by `web/src/profiles.ts`.

| Field         | Type           | Meaning                                                                 |
| ------------- | -------------- | ----------------------------------------------------------------------- |
| `title`       | string         | Wikipedia article title, found by scientific name                       |
| `description` | string         | Wikipedia's one-line description                                        |
| `extract`     | string         | The article's opening paragraph                                         |
| `url`         | string         | Link to the article                                                     |
| `photo`       | object or null | `url`, `author`, `licence`, `licenceUrl`, `sourceUrl`                   |

- **Text licence:** the text is from Wikipedia under CC BY-SA 4.0, and the site links to each article.
- **Photos:** only Wikimedia Commons files are used, because Wikipedia also hosts non-free images under fair use. A photo with no recorded licence is left out. The site shows each photo's author, licence and source.
- **Article titles:** where a scientific name leads to the wrong article, `ARTICLE_TITLES` sets the title. For example, *Giraffa camelopardalis* now names only the northern giraffe.

## `data/social-preview.jpg`

The 1200 × 630 image shown when someone shares a link to the site. It's a screenshot of the map with the Safari animals picked, with the site's name on top. It lives here only because `data/` is the site's public folder.

## `data/summary.json`

How much data each species has, for the badges on the site: `{ "<species id>": { "sightings": <distinct places>, "tracks": <tracked animals> } }`. The sightings and tracks pipelines rewrite it after each run, and a test checks it matches the data files.
