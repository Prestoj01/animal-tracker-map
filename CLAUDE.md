# Animal Tracker Map
Static site showing ~25 species: sightings, migration tracks, conservation status.

## Stack
- web/: Vite + TypeScript + MapLibre GL JS, deployed on Cloudflare Pages
- web/worker/: Cloudflare Worker for live GBIF counts
- pipeline/: Python 3.11, GitHub Actions weekly run, writes to data/

## Rules
- Cost must stay $0. No paid APIs. Hard stop in code if a limit is near.
- IUCN: non-commercial only, 0.5 s minimum between calls, no bulk scraping.
- Movebank: accept licence per study, keep citations, do not commit raw data.
- Secrets live in .env and GitHub Actions secrets. Never commit them.
- Every outside call: timeout, retry with backoff, error handling, logging.
- Every screen: loading state, empty state, failed-request state.
- Worker: rate limit per IP, cache repeat requests, paginate large results.
- Compress generated data files. Add tests with every feature.

## Commands
- web: npm run dev | npm test | npm run build
- pipeline: python -m pytest
- Work on a branch per milestone, open a PR, wait for CI.