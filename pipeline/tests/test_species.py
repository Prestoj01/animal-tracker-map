import json

import pytest

from animal_tracker_pipeline.species import (
    Species,
    SpeciesDataError,
    load_species,
    parse_species,
)

WOLF = {
    "id": "grey-wolf",
    "commonName": "Grey wolf",
    "scientificName": "Canis lupus",
}


def test_parses_valid_entries_and_empty_list():
    assert parse_species([WOLF]) == [Species("grey-wolf", "Grey wolf", "Canis lupus")]
    assert parse_species([]) == []


def test_rejects_non_array():
    with pytest.raises(SpeciesDataError, match="must be an array"):
        parse_species({"species": []})


@pytest.mark.parametrize(
    ("entry", "message"),
    [
        ({**WOLF, "id": ""}, r"species\[0\]\.id"),
        ({**WOLF, "commonName": 3}, r"species\[0\]\.commonName"),
        ({"id": "x", "commonName": "X"}, r"species\[0\]\.scientificName"),
        (None, r"species\[0\]\.id"),
    ],
)
def test_rejects_invalid_entries(entry, message):
    with pytest.raises(SpeciesDataError, match=message):
        parse_species([entry])


def test_rejects_duplicate_ids():
    with pytest.raises(SpeciesDataError, match="Duplicate species id"):
        parse_species([WOLF, WOLF])


def test_loads_from_path(tmp_path):
    path = tmp_path / "species.json"
    path.write_text(json.dumps([WOLF]), encoding="utf-8")

    assert load_species(path)[0].id == "grey-wolf"


def test_committed_species_file_is_valid():
    assert load_species()
