"""Loads and validates data/species.json (format: docs/data-format.md)."""

import json
from dataclasses import dataclass
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "species.json"


class SpeciesDataError(ValueError):
    pass


@dataclass(frozen=True)
class Species:
    id: str
    common_name: str
    scientific_name: str


def parse_species(data: object) -> list[Species]:
    if not isinstance(data, list):
        raise SpeciesDataError("species.json must be an array")

    species: list[Species] = []
    seen: set[str] = set()
    for index, entry in enumerate(data):
        record = entry if isinstance(entry, dict) else {}
        for field in ("id", "commonName", "scientificName"):
            value = record.get(field)
            if not isinstance(value, str) or not value.strip():
                raise SpeciesDataError(
                    f"species[{index}].{field} must be a non-empty string"
                )
        if record["id"] in seen:
            raise SpeciesDataError(f"Duplicate species id: {record['id']}")
        seen.add(record["id"])
        species.append(
            Species(record["id"], record["commonName"], record["scientificName"])
        )
    return species


def load_species(path: Path = DEFAULT_PATH) -> list[Species]:
    return parse_species(json.loads(path.read_text(encoding="utf-8")))
