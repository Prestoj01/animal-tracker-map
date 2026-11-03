import gzip
import json

import pytest

from animal_tracker_pipeline.gbif import GbifError, RequestBudgetExceeded
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.profiles import (
    OUTPUT_PATH,
    fetch_profile,
    plain_text,
    run,
)
from animal_tracker_pipeline.species import Species, load_species

PUMA = Species("puma", "Puma", "Puma concolor")
COMMONS_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/d/d6/Mountain_Lion.jpg"


def summary(image=COMMONS_IMAGE, kind="standard"):
    return {
        "type": kind,
        "title": "Cougar",
        "description": "Wild cat",
        "extract": "The cougar is a large cat.",
        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Cougar"}},
        "originalimage": {"source": image} if image else None,
    }


IMAGE_INFO = {
    "query": {
        "pages": [
            {
                "imageinfo": [
                    {
                        "url": "https://upload.wikimedia.org/full.jpg",
                        "thumburl": "https://upload.wikimedia.org/640px.jpg",
                        "descriptionurl": "https://commons.wikimedia.org/wiki/File:X.jpg",
                        "extmetadata": {
                            "Artist": {"value": '<a href="/u">Jane <b>Doe</b></a>'},
                            "LicenseShortName": {"value": "CC BY-SA 4.0"},
                            "LicenseUrl": {"value": "https://creativecommons.org/x"},
                        },
                    }
                ]
            }
        ]
    }
}


class Fake:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def get(self, path, params):
        self.calls.append((path, params))
        if self.error:
            raise self.error
        return self.response


def test_builds_a_profile_with_a_credited_commons_photo():
    wikipedia = Fake(summary())
    commons = Fake(IMAGE_INFO)

    profile = fetch_profile(wikipedia, commons, PUMA)

    assert wikipedia.calls[0][0] == "page/summary/Puma_concolor"
    assert commons.calls[0][1]["titles"] == "File:Mountain_Lion.jpg"
    assert profile == {
        "title": "Cougar",
        "description": "Wild cat",
        "extract": "The cougar is a large cat.",
        "url": "https://en.wikipedia.org/wiki/Cougar",
        "photo": {
            "url": "https://upload.wikimedia.org/640px.jpg",
            "author": "Jane Doe",
            "licence": "CC BY-SA 4.0",
            "licenceUrl": "https://creativecommons.org/x",
            "sourceUrl": "https://commons.wikimedia.org/wiki/File:X.jpg",
        },
    }


def test_reads_the_file_name_from_a_resized_copy():
    resized = (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Lion_%281%29.jpg/"
        "3840px-Lion_%281%29.jpg?utm_source=x"
    )
    commons = Fake(IMAGE_INFO)

    fetch_profile(Fake(summary(resized)), commons, PUMA)

    assert commons.calls[0][1]["titles"] == "File:Lion_(1).jpg"


def test_uses_the_general_article_where_the_name_is_too_narrow():
    wikipedia = Fake(summary())
    giraffe = Species("giraffe", "Giraffe", "Giraffa camelopardalis")

    fetch_profile(wikipedia, Fake(IMAGE_INFO), giraffe)

    assert wikipedia.calls[0][0] == "page/summary/Giraffe"


def test_skips_photos_that_are_not_on_commons():
    fair_use = "https://upload.wikimedia.org/wikipedia/en/a/a1/Poster.jpg"
    commons = Fake(IMAGE_INFO)

    profile = fetch_profile(Fake(summary(fair_use)), commons, PUMA)

    assert profile["photo"] is None
    assert commons.calls == []


def test_skips_photos_without_a_licence():
    info = {"url": "u", "descriptionurl": "d"}
    unlicensed = {"query": {"pages": [{"imageinfo": [info]}]}}

    profile = fetch_profile(Fake(summary()), Fake(unlicensed), PUMA)

    assert profile["photo"] is None


def test_works_without_any_photo():
    assert fetch_profile(Fake(summary(image=None)), Fake(), PUMA)["photo"] is None


def test_rejects_disambiguation_pages():
    with pytest.raises(GbifError, match="No Wikipedia article"):
        fetch_profile(Fake(summary(kind="disambiguation")), Fake(), PUMA)


def test_plain_text_strips_html():
    assert plain_text("<span>A &amp; <i>B</i></span>") == "A & B"


def read(path):
    return json.loads(gzip.decompress(path.read_bytes()))


def test_failures_keep_the_previous_profile(tmp_path):
    path = tmp_path / "profiles.json.gz"
    write_json_gz({"puma": {"title": "Old"}}, path)

    assert run(Fake(error=GbifError("down")), Fake(), [PUMA], path) == ["puma"]
    assert read(path) == {"puma": {"title": "Old"}}


def test_budget_stop_ends_the_run(tmp_path):
    with pytest.raises(RequestBudgetExceeded):
        run(Fake(error=RequestBudgetExceeded("x")), Fake(), [PUMA], tmp_path / "p.gz")


def test_every_species_has_a_committed_profile():
    profiles = read(OUTPUT_PATH)
    for species in load_species():
        profile = profiles[species.id]
        assert profile["title"] and profile["url"], species.id
        if profile["photo"]:
            assert profile["photo"]["licence"], species.id
