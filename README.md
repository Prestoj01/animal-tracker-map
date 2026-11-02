# animal-tracker-map

A static site showing species sightings, migration tracks and conservation status on a map.

## Web app

Requires the Node version in `web/.nvmrc`.

```sh
cd web
npm install
npm run dev
```

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

