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

## Data refresh

Every Monday, the `Refresh data` GitHub Actions workflow refreshes sightings (GBIF), tracks (Movebank) and profiles (Wikipedia), checks the data with the pipeline tests, and commits any changes to `main`, which redeploys the site.

- **Run it by hand:** open the repository's **Actions** tab, choose **Refresh data**, then **Run workflow**.
- **Failures:** if a source fails, what did refresh is still saved, and the run is marked as failed so GitHub emails you. Movebank studies whose licence isn't accepted yet are only a warning.
- **Secrets:** it needs the `MOVEBANK_USERNAME` and `MOVEBANK_PASSWORD` repository secrets.

