import gzip
import json

import pytest

from animal_tracker_pipeline import tracks
from animal_tracker_pipeline.movebank import (
    LicenceNotAccepted,
    MovebankError,
    MovebankLimitExceeded,
)
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import Species, load_species
from animal_tracker_pipeline.tracks import (
    OUTPUT_DIR,
    TRACK_STUDIES,
    fetch_tracks,
    plain_text,
    reduce_events,
    run,
)

LION = Species("lion", "Lion", "Panthera leo")
TIGER = Species("tiger", "Tiger", "Panthera tigris")


def event(animal, timestamp, longitude, latitude, **extra):
    return {
        "individual_local_identifier": animal,
        "timestamp": timestamp,
        "location_long": str(longitude),
        "location_lat": str(latitude),
        **extra,
    }


def test_keeps_the_first_fix_per_animal_per_day():
    tracks_, first, last = reduce_events(
        [
            event("a", "2020-01-01 12:00:00", 2, 2),
            event("a", "2020-01-01 06:00:00", 1, 1),
            event("a", "2020-01-02 06:00:00", 3, 3),
            event("b", "2020-01-05 06:00:00", 9, 9),
        ],
        "Panthera leo",
    )

    assert tracks_ == [[[1.0, 1.0], [3.0, 3.0]]]  # b has one point, so no line
    assert (first, last) == ("2020-01-01", "2020-01-05")


def test_drops_outliers_bad_coordinates_and_other_species():
    tracks_, _, _ = reduce_events(
        [
            event("a", "2020-01-01", 1, 1),
            event("a", "2020-01-02", 5, 5, visible="false"),
            event("a", "2020-01-03", 0, 0),
            event("a", "2020-01-04", "", 1),
            event("a", "2020-01-05", 200, 1),
            event("", "2020-01-05", 3, 3),
            event(
                "a", "2020-01-06", 6, 6, individual_taxon_canonical_name="Equus zebra"
            ),
            event(
                "a", "2020-01-07", 2, 2, individual_taxon_canonical_name="panthera LEO"
            ),
        ],
        "Panthera leo",
    )

    assert tracks_ == [[[1.0, 1.0], [2.0, 2.0]]]


def test_rounds_and_thins_long_tracks(monkeypatch):
    monkeypatch.setattr(tracks, "MAX_POINTS_PER_ANIMAL", 3)
    rows = [event("a", f"2020-01-{day:02d}", day + 0.123, 1) for day in range(1, 10)]

    tracks_, _, _ = reduce_events(rows, "Panthera leo")

    assert tracks_ == [[[1.12, 1.0], [4.12, 1.0], [7.12, 1.0]]]


def test_keeps_the_most_tracked_animals(monkeypatch):
    monkeypatch.setattr(tracks, "MAX_ANIMALS", 1)
    rows = [event("short", f"2020-01-0{day}", day, 1) for day in (1, 2)]
    rows += [event("long", f"2020-01-0{day}", -day, 1) for day in (1, 2, 3)]

    tracks_, _, _ = reduce_events(rows, "Panthera leo")

    assert tracks_ == [[[-1.0, 1.0], [-2.0, 1.0], [-3.0, 1.0]]]


def test_plain_text_strips_html():
    assert (
        plain_text(
            'Kays R.<br><br>Data. <a href="https://doi.org/x">doi</a> &amp; more'
        )
        == "Kays R. Data. doi & more"
    )


class FakeClient:
    def __init__(self, events=(), error=None):
        self.events = list(events)
        self.error = error

    def study(self, study_id):
        if self.error:
            raise self.error
        return {
            "name": "Lions",
            "citation": "Someone<br>2020",
            "license_type": "CC_BY",
        }

    def rows(self, params):
        assert params["study_id"] == TRACK_STUDIES["lion"]
        return iter(self.events)


def test_fetch_tracks_includes_the_citation():
    client = FakeClient(
        [event("a", "2010-05-01", 1, 1), event("a", "2012-05-02", 2, 2)]
    )

    data = fetch_tracks(client, LION)

    assert data["study"]["citation"] == "Someone 2020"
    assert data["study"]["licenseType"] == "CC_BY"
    assert (data["study"]["firstYear"], data["study"]["lastYear"]) == (2010, 2012)
    assert data["study"]["url"].endswith(str(TRACK_STUDIES["lion"]))
    assert data["tracks"] == [[[1.0, 1.0], [2.0, 2.0]]]


def read(path):
    return json.loads(gzip.decompress(path.read_bytes()))


def test_species_without_a_study_get_an_empty_file(tmp_path):
    assert run(FakeClient(), [TIGER], tmp_path) == {"licence": [], "failed": []}
    assert read(tmp_path / "tiger.json.gz") == {
        "speciesId": "tiger",
        "study": None,
        "tracks": [],
    }


@pytest.mark.parametrize(
    ("error", "kind"),
    [(LicenceNotAccepted("x"), "licence"), (MovebankError("x"), "failed")],
)
def test_failures_keep_existing_data_or_write_an_empty_file(tmp_path, error, kind):
    problems = run(FakeClient(error=error), [LION], tmp_path)
    assert problems[kind] == ["lion"]
    assert read(tmp_path / "lion.json.gz")["study"] is None

    write_json_gz(
        {"speciesId": "lion", "study": {"id": 1}, "tracks": []},
        tmp_path / "lion.json.gz",
    )
    run(FakeClient(error=error), [LION], tmp_path)
    assert read(tmp_path / "lion.json.gz")["study"] == {"id": 1}


def test_limit_errors_stop_the_run(tmp_path):
    with pytest.raises(MovebankLimitExceeded):
        run(FakeClient(error=MovebankLimitExceeded("x")), [LION, TIGER], tmp_path)


def test_every_species_has_a_valid_committed_file():
    for species in load_species():
        data = read(OUTPUT_DIR / f"{species.id}.json.gz")
        assert data["speciesId"] == species.id
        if data["study"] is None:
            assert data["tracks"] == []
        else:
            assert data["study"]["citation"], species.id
        for track in data["tracks"]:
            assert len(track) >= 2
            for longitude, latitude in track:
                assert -180 <= longitude <= 180
                assert -90 <= latitude <= 90
