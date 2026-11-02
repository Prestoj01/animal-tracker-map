import gzip
import json

import pytest

from animal_tracker_pipeline.gbif import GbifError, RequestBudgetExceeded
from animal_tracker_pipeline.sightings import (
    MAX_PER_COUNTRY,
    MIN_PER_COUNTRY,
    OUTPUT_DIR,
    fetch_sightings,
    records_per_country,
    run,
    write_sightings,
)
from animal_tracker_pipeline.species import Species, load_species

LION = Species("lion", "Lion", "Panthera leo")
WOLF = Species("grey-wolf", "Grey wolf", "Canis lupus")


class FakeClient:
    def __init__(self, facets, results=None, match=None):
        self.facets = facets
        self.results = results or {}
        self.match = match or {"matchType": "EXACT", "usageKey": 42}
        self.calls = []

    def get(self, path, params):
        self.calls.append((path, params))
        if path == "species/match":
            return self.match
        if params["limit"] == 0:
            return {
                "facets": [
                    {
                        "counts": [
                            {"name": name, "count": count}
                            for name, count in self.facets.items()
                        ]
                    }
                ]
            }
        return {"results": self.results.get(params["country"], [])}


def record(longitude, latitude):
    return {"decimalLongitude": longitude, "decimalLatitude": latitude}


def test_rounds_and_deduplicates_points():
    client = FakeClient(
        {"KE": 2},
        {"KE": [record(36.81, -1.29), record(36.84, -1.31), record(1.0, 2.0)]},
    )

    sightings = fetch_sightings(client, LION)

    assert sightings == {
        "speciesId": "lion",
        "totalRecords": 2,
        "points": [(1.0, 2.0), (36.8, -1.3)],
    }


def test_skips_records_without_coordinates():
    client = FakeClient({"KE": 1}, {"KE": [{"decimalLatitude": 1.0}]})

    assert fetch_sightings(client, LION)["points"] == []


def test_excludes_countries_outside_the_range():
    client = FakeClient(
        {"KE": 5, "US": 8},
        {"KE": [record(36.8, -1.3)], "US": [record(-83.1, 40.2)]},
    )

    sightings = fetch_sightings(client, LION)

    assert sightings["points"] == [(36.8, -1.3)]
    assert sightings["totalRecords"] == 5
    assert all(params.get("country") != "US" for _, params in client.calls)


def test_queries_zoo_free_record_types():
    client = FakeClient({"KE": 1})
    fetch_sightings(client, LION)

    _, params = client.calls[-1]
    assert params["taxonKey"] == 42
    assert "PRESERVED_SPECIMEN" not in params["basisOfRecord"]
    assert "LIVING_SPECIMEN" not in params["basisOfRecord"]


def test_wolves_are_queried_without_domestic_dogs():
    client = FakeClient({"CA": 1})
    fetch_sightings(client, WOLF)

    assert all(path != "species/match" for path, _ in client.calls)
    keys = client.calls[-1][1]["acceptedTaxonKey"]
    assert 5219173 in keys
    assert 6164210 not in keys  # Canis lupus familiaris


def test_inexact_match_is_an_error():
    client = FakeClient({}, match={"matchType": "FUZZY", "usageKey": 1})

    with pytest.raises(GbifError, match="No exact GBIF match"):
        fetch_sightings(client, LION)


def test_country_shares_stay_within_limits():
    shares = records_per_country({"US": 1_000_000, "CA": 1000, "MX": 3}, 1_001_003)

    assert shares == {"US": MAX_PER_COUNTRY, "CA": MIN_PER_COUNTRY, "MX": 3}


def test_written_file_is_gzip_json_and_reproducible(tmp_path):
    sightings = {"speciesId": "lion", "totalRecords": 1, "points": [(1.0, 2.0)]}

    path = write_sightings(sightings, tmp_path)
    first = path.read_bytes()
    write_sightings(sightings, tmp_path)

    assert path.name == "lion.json.gz"
    assert path.read_bytes() == first
    assert json.loads(gzip.decompress(first))["points"] == [[1.0, 2.0]]
    assert [item.name for item in tmp_path.iterdir()] == ["lion.json.gz"]


def test_failed_species_keep_their_previous_file(tmp_path):
    write_sightings({"speciesId": "lion", "totalRecords": 1, "points": []}, tmp_path)
    before = (tmp_path / "lion.json.gz").read_bytes()
    client = FakeClient({}, match={"matchType": "NONE"})

    assert run(client, [LION], tmp_path) == ["lion"]
    assert (tmp_path / "lion.json.gz").read_bytes() == before


def test_budget_stop_ends_the_run(tmp_path):
    class Exhausted:
        def get(self, path, params):
            raise RequestBudgetExceeded("limit")

    with pytest.raises(RequestBudgetExceeded):
        run(Exhausted(), [LION, WOLF], tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_every_species_has_a_valid_committed_file():
    for species in load_species():
        data = json.loads(
            gzip.decompress((OUTPUT_DIR / f"{species.id}.json.gz").read_bytes())
        )
        assert data["speciesId"] == species.id
        assert data["points"], species.id
        for longitude, latitude in data["points"]:
            assert -180 <= longitude <= 180
            assert -90 <= latitude <= 90
