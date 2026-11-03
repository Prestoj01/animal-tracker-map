import io
import urllib.error

import pytest

from animal_tracker_pipeline.movebank import (
    LicenceNotAccepted,
    MovebankClient,
    MovebankError,
    MovebankLimitExceeded,
    credentials,
)


class FakeResponse(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(body.encode())
        self.headers = headers or {}


def http_error(code):
    return urllib.error.HTTPError("http://x", code, "error", {}, io.BytesIO())


def client_returning(*outcomes, **options):
    remaining = list(outcomes)
    requests = []

    def opener(request, timeout):
        requests.append((request, timeout))
        outcome = remaining.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    client = MovebankClient(
        "user", "pass", opener=opener, sleep=lambda _: None, **options
    )
    return client, requests


def test_streams_csv_rows_with_auth_and_timeout():
    client, requests = client_returning(FakeResponse("a,b\n1,2\n3,4\n"))

    assert list(client.rows({"entity_type": "event"})) == [
        {"a": "1", "b": "2"},
        {"a": "3", "b": "4"},
    ]
    request, timeout = requests[0]
    assert request.get_header("Authorization").startswith("Basic ")
    assert timeout > 0


def test_reports_a_licence_that_needs_accepting():
    client, _ = client_returning(
        FakeResponse("<html>terms</html>", {"accept-license": "true"})
    )

    with pytest.raises(LicenceNotAccepted):
        list(client.rows({"study_id": 1}))


@pytest.mark.parametrize("failure", [http_error(500), urllib.error.URLError("down")])
def test_retries_transient_failures(failure):
    client, requests = client_returning(failure, FakeResponse("a\n1\n"))

    assert list(client.rows({})) == [{"a": "1"}]
    assert len(requests) == 2


def test_does_not_retry_client_errors():
    client, requests = client_returning(http_error(403))

    with pytest.raises(MovebankError, match="HTTP 403"):
        list(client.rows({}))
    assert len(requests) == 1


def test_stops_hard_at_the_request_limit():
    client, _ = client_returning(FakeResponse("a\n1\n"), max_requests=1)

    list(client.rows({}))
    with pytest.raises(MovebankLimitExceeded):
        list(client.rows({}))


def test_stops_hard_at_the_download_limit():
    client, _ = client_returning(FakeResponse("a\n" + "1\n" * 1000), max_bytes=100)

    with pytest.raises(MovebankLimitExceeded):
        list(client.rows({}))


def test_reads_study_metadata():
    client, _ = client_returning(FakeResponse("id,name\n7,Lions\n"))

    assert client.study(7) == {"id": "7", "name": "Lions"}


def test_credentials_come_from_the_environment_or_env_file(tmp_path, monkeypatch):
    monkeypatch.delenv("MOVEBANK_USERNAME", raising=False)
    monkeypatch.delenv("MOVEBANK_PASSWORD", raising=False)
    env = tmp_path / ".env"
    env.write_text('MOVEBANK_USERNAME=me\nMOVEBANK_PASSWORD="secret"\n')

    assert credentials(env) == ("me", "secret")

    monkeypatch.setenv("MOVEBANK_USERNAME", "ci")
    assert credentials(env)[0] == "ci"

    with pytest.raises(MovebankError, match="MOVEBANK_PASSWORD"):
        credentials(tmp_path / "missing")
