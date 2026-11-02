import io
import json
import urllib.error

import pytest

from animal_tracker_pipeline.gbif import GbifClient, GbifError, RequestBudgetExceeded


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
        return io.BytesIO(json.dumps(outcome).encode())

    return GbifClient(opener=opener, sleep=lambda _: None, **options), requests


def test_returns_json_and_sends_timeout_and_user_agent():
    client, requests = client_returning({"ok": True})

    assert client.get("path", {"a": ["1", "2"]}) == {"ok": True}
    request, timeout = requests[0]
    assert request.full_url.endswith("/path?a=1&a=2")
    assert request.get_header("User-agent").startswith("animal-tracker-map")
    assert timeout > 0


@pytest.mark.parametrize(
    "failure",
    [http_error(503), http_error(429), urllib.error.URLError("down"), TimeoutError()],
)
def test_retries_transient_failures(failure):
    client, requests = client_returning(failure, {"ok": True})

    assert client.get("path", {}) == {"ok": True}
    assert len(requests) == 2


def test_does_not_retry_client_errors():
    client, requests = client_returning(http_error(404))

    with pytest.raises(GbifError, match="HTTP 404"):
        client.get("path", {})
    assert len(requests) == 1


def test_gives_up_after_the_retry_limit():
    client, requests = client_returning(*[http_error(500)] * 4)

    with pytest.raises(GbifError, match="Giving up"):
        client.get("path", {})
    assert len(requests) == 4


def test_stops_hard_at_the_request_budget():
    client, requests = client_returning({"ok": True}, {"ok": True}, max_requests=1)

    client.get("path", {})
    with pytest.raises(RequestBudgetExceeded):
        client.get("path", {})
    assert len(requests) == 1
