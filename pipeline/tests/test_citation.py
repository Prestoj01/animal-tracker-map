import base64
import datetime
import io
import json
import urllib.error
from collections import Counter

import pytest

from animal_tracker_pipeline.citation import (
    OUTPUT_PATH,
    CitationError,
    citation_record,
    collect_datasets,
    fingerprint,
    gbif_credentials,
    register,
    registration_body,
)
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import Species

LION = Species("lion", "Lion", "Panthera leo")
TIGER = Species("tiger", "Tiger", "Panthera tigris")


def write(tmp_path, species_id, datasets):
    write_json_gz(
        {"speciesId": species_id, "datasets": datasets},
        tmp_path / f"{species_id}.json.gz",
    )


def test_adds_up_dataset_counts_across_species(tmp_path):
    write(tmp_path, "lion", {"a": 3, "b": 1})
    write(tmp_path, "tiger", {"a": 2})

    assert collect_datasets([LION, TIGER], tmp_path) == Counter({"a": 5, "b": 1})


def test_needs_every_species_counted(tmp_path):
    with pytest.raises(CitationError, match="No dataset counts for lion"):
        collect_datasets([LION], tmp_path)


def test_body_lists_sorted_datasets_and_a_public_source():
    body = registration_body(Counter({"b": 1, "a": 2}), 24)

    assert list(body["relatedDatasets"].items()) == [("a", 2), ("b", 1)]
    assert body["sourceUrl"].startswith("https://github.com/")
    assert "24 animal species" in body["description"]


def test_fingerprint_ignores_order_but_not_counts():
    assert fingerprint(Counter({"a": 1, "b": 2})) == fingerprint(
        Counter({"b": 2, "a": 1})
    )
    assert fingerprint(Counter({"a": 1})) != fingerprint(Counter({"a": 2}))


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def http_error(code):
    return urllib.error.HTTPError("url", code, "error", {}, None)


def test_registers_with_basic_auth():
    requests = []

    def opener(request, timeout):
        requests.append(request)
        return FakeResponse(b'{"doi": "10.15468/dd.abc"}')

    assert register({"title": "t"}, "me", "secret", opener) == {
        "doi": "10.15468/dd.abc"
    }
    request = requests[0]
    assert request.get_method() == "POST"
    assert request.full_url == "https://api.gbif.org/v1/derivedDataset"
    assert (
        request.get_header("Authorization")
        == "Basic " + base64.b64encode(b"me:secret").decode()
    )
    assert json.loads(request.data) == {"title": "t"}


def test_retries_only_when_gbif_says_come_back_later():
    answers = [http_error(503), FakeResponse(b'{"doi": "x"}')]
    sleeps = []

    def opener(request, timeout):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    assert register({}, "me", "pw", opener, sleeps.append) == {"doi": "x"}
    assert sleeps == [5.0]


def test_does_not_retry_refusals_or_lost_connections():
    def refused(request, timeout):
        raise http_error(401)

    with pytest.raises(CitationError, match="HTTP 401"):
        register({}, "me", "pw", refused, lambda _: None)

    calls = []

    def dropped(request, timeout):
        calls.append(1)
        raise TimeoutError("slow")

    # A retry here could register the same data twice.
    with pytest.raises(CitationError, match="may have worked"):
        register({}, "me", "pw", dropped, lambda _: None)
    assert len(calls) == 1


def test_citation_record_follows_gbif_style():
    record = citation_record(
        {"doi": "10.15468/dd.abc"},
        Counter({"a": 2, "b": 3}),
        datetime.date(2026, 11, 5),
    )

    assert record["citation"] == (
        "GBIF.org (5 November 2026) Derived dataset https://doi.org/10.15468/dd.abc"
    )
    assert record["records"] == 5
    assert record["datasets"] == 2

    with pytest.raises(CitationError, match="no DOI"):
        citation_record({}, Counter(), datetime.date(2026, 11, 5))


def test_reads_credentials_from_env_file(tmp_path, monkeypatch):
    monkeypatch.delenv("GBIF_USERNAME", raising=False)
    monkeypatch.delenv("GBIF_PASSWORD", raising=False)
    env = tmp_path / ".env"
    env.write_text('GBIF_USERNAME=me\nGBIF_PASSWORD="pw"\n')

    assert gbif_credentials(env) == ("me", "pw")
    with pytest.raises(CitationError, match="GBIF_USERNAME"):
        gbif_credentials(tmp_path / "missing")


def test_committed_citation_is_well_formed():
    if not OUTPUT_PATH.exists():
        pytest.skip("Not registered yet")
    record = json.loads(OUTPUT_PATH.read_text())
    assert record["url"] == f"https://doi.org/{record['doi']}"
    assert record["url"] in record["citation"]
