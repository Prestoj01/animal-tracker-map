"""Writes data/summary.json: how much data each species has, for the site's badges.

Runs after the sightings and tracks pipelines, or on its own with:
    python -m animal_tracker_pipeline.summary
"""

import gzip
import json
import sys
from pathlib import Path
from typing import Any

from animal_tracker_pipeline.species import DEFAULT_PATH, Species, load_species

DATA_DIR = DEFAULT_PATH.parent
OUTPUT_PATH = DATA_DIR / "summary.json"


def _read(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(gzip.decompress(path.read_bytes()))


def build_summary(species: list[Species], data_dir: Path) -> dict[str, dict[str, int]]:
    summary = {}
    for entry in species:
        sightings = _read(data_dir / "sightings" / f"{entry.id}.json.gz")
        tracks = _read(data_dir / "tracks" / f"{entry.id}.json.gz")
        summary[entry.id] = {
            # Unique places: a place seen in several years is one point per year.
            "sightings": (
                len({(point[0], point[1]) for point in sightings["points"]})
                if sightings
                else 0
            ),
            "tracks": len(tracks["tracks"]) if tracks else 0,
        }
    return summary


def write_summary(
    species: list[Species] | None = None,
    data_dir: Path = DATA_DIR,
    path: Path = OUTPUT_PATH,
) -> Path:
    summary = build_summary(species or load_species(), data_dir)
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    write_summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
