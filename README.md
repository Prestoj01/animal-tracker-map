# animal-tracker-map

A static site showing species sightings, migration tracks and conservation status on a map.

## Web app

Requires the Node version in `web/.nvmrc`.

```sh
cd web
npm install
npm run dev
```

### Link previews

Shared links show a preview card with a title, description and `data/social-preview.jpg`, added to each page at build time by `src/siteHead.ts`. Most apps only show the image when its address is absolute, so set `siteUrl` in `web/site.config.json` to the site's address, such as `https://animal-tracker-map.<your-subdomain>.workers.dev`. Until then the image address is relative.

### Visitor stats

The site can count visits with [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/), which is free, uses no cookies, and doesn't track people across sites. To turn it on:

1. In the Cloudflare dashboard, open **Web Analytics** and choose **Add a site**.
2. Enter the site's `workers.dev` hostname, and copy the `token` value from the snippet it shows.
3. Paste it as `analyticsToken` in `web/site.config.json`, then commit and push.

The token is public by design, since it appears in every page. Only built pages include the beacon, so local development isn't counted.

## Pipeline

Requires Python 3.11.

```sh
cd pipeline
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest
```

The format of the shared data files is described in [docs/data-format.md](docs/data-format.md).

### GBIF citation

GBIF asks that data from its search API be cited with a DOI, by registering a "derived dataset" that lists the source datasets. To get one, with `GBIF_USERNAME` and `GBIF_PASSWORD` in `.env`:

```sh
python -m animal_tracker_pipeline.citation             # preview the counts
python -m animal_tracker_pipeline.citation --register  # create the DOI
```

Registering creates a permanent public record under your GBIF account. It writes `data/gbif-citation.json`; commit it and the site shows the citation.

## Data refresh

Every Monday, the `Refresh data` GitHub Actions workflow refreshes sightings (GBIF), tracks (Movebank) and profiles (Wikipedia), checks the data with the pipeline tests, and commits any changes to `main`, which redeploys the site.

- **Run it by hand:** open the repository's **Actions** tab, choose **Refresh data**, then **Run workflow**.
- **Failures:** if a source fails, what did refresh is still saved, and the run is marked as failed so GitHub emails you. Movebank studies whose licence isn't accepted yet are only a warning.
- **Secrets:** it needs the `MOVEBANK_USERNAME` and `MOVEBANK_PASSWORD` repository secrets.

