import json

from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import Species, load_species
from animal_tracker_pipeline.summary import OUTPUT_PATH, build_summary, write_summary

LION = Species("lion", "Lion", "Panthera leo")
TIGER = Species("tiger", "Tiger", "Panthera tigris")


def test_counts_points_and_tracked_animals(tmp_path):
    write_json_gz(
        {"speciesId": "lion", "points": [[1, 2, 2001], [1, 2, 2002], [3, 4, None]]},
        tmp_path / "sightings" / "lion.json.gz",
    )
    write_json_gz(
        {"speciesId": "lion", "study": {}, "tracks": [[[1, 2], [3, 4]]]},
        tmp_path / "tracks" / "lion.json.gz",
    )

    assert build_summary([LION, TIGER], tmp_path) == {
        "lion": {"sightings": 2, "tracks": 1},
        "tiger": {"sightings": 0, "tracks": 0},
    }


def test_writes_json(tmp_path):
    path = write_summary([TIGER], tmp_path, tmp_path / "summary.json")

    assert json.loads(path.read_text()) == {"tiger": {"sightings": 0, "tracks": 0}}


def test_committed_summary_matches_the_data():
    committed = json.loads(OUTPUT_PATH.read_text())

    assert committed == build_summary(load_species(), OUTPUT_PATH.parent)
