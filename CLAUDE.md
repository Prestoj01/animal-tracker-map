# Animal Tracker Map
Static site showing ~25 species: sightings, migration tracks, conservation status.

## Stack
- web/: Vite + TypeScript + MapLibre GL JS, deployed as Cloudflare Workers static assets (web/wrangler.jsonc, no script)
- web/worker/: Cloudflare Worker for live GBIF counts
- pipeline/: Python 3.11, GitHub Actions weekly run, writes to data/

## Rules
- Cost must stay $0. No paid APIs. Hard stop in code if a limit is near.
- Stay on the Cloudflare Workers Free plan. Keep the site in static assets: adding a script to web/wrangler.jsonc makes requests count against the 100,000/day limit.
- Keep this repo public: GitHub Actions is only free without a usage cap on public repos.
- IUCN: non-commercial only, 0.5 s minimum between calls, no bulk scraping.
- Movebank: accept licence per study, keep citations, do not commit raw data.
- Secrets live in .env and GitHub Actions secrets. Never commit them.
- Every outside call: timeout, retry with backoff, error handling, logging.
- Every screen: loading state, empty state, failed-request state.
- Worker: rate limit per IP, cache repeat requests, paginate large results.
- Compress generated data files. Add tests with every feature.

## Commands
- web: npm run dev | npm run lint | npm test | npm run build
- pipeline: ruff check . | python -m pytest
- refresh sightings (about 20 min): python -m animal_tracker_pipeline.sightings
- refresh tracks: python -m animal_tracker_pipeline.tracks (reads Movebank login from .env)
- refresh profiles (Wikipedia text and photos): python -m animal_tracker_pipeline.profiles
- GBIF citation DOI: python -m animal_tracker_pipeline.citation (preview), then --register (permanent; only when the user asks)
- weekly refresh: .github/workflows/refresh-data.yml runs all three on Mondays and commits changed data; run it by hand from GitHub's Actions tab (Refresh data → Run workflow)
- Commit and push directly to main. No branches or PRs. Run lint and tests before pushing.