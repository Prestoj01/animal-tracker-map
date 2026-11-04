"""Minimal Movebank client: streams CSV with timeouts, retries, pacing and hard limits.

Movebank allows one request at a time per IP, so calls are strictly sequential.
"""

import base64
import csv
import http.client
import io
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

BASE_URL = "https://www.movebank.org/movebank/service/direct-read"
USER_AGENT = "animal-tracker-map (https://github.com/Prestoj01/animal-tracker-map)"
TIMEOUT_SECONDS = 120
RETRIES = 3
BACKOFF_SECONDS = 5.0
MIN_INTERVAL_SECONDS = 1.0
MAX_REQUESTS = 100
MAX_BYTES_PER_REQUEST = 800_000_000
ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


class MovebankError(RuntimeError):
    pass


class LicenceNotAccepted(MovebankError):
    pass


class MovebankLimitExceeded(MovebankError):
    """Hard stop: a run must not exceed its request or download limits."""


class DownloadInterrupted(MovebankError):
    """The connection stalled or dropped partway through a download."""


def study_url(study_id: int) -> str:
    return (
        "https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study"
        f"{study_id}"
    )


def credentials(env_path: Path = ENV_PATH) -> tuple[str, str]:
    """Reads credentials from the environment, falling back to the repo's .env."""
    values = dict(os.environ)
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and not key.startswith("#"):
                values.setdefault(key.strip(), value.strip().strip("\"'"))
    try:
        return values["MOVEBANK_USERNAME"], values["MOVEBANK_PASSWORD"]
    except KeyError as error:
        raise MovebankError(f"Missing {error.args[0]} in the environment") from error


class _ByteLimit(io.RawIOBase):
    def __init__(self, stream: Any, limit: int) -> None:
        self._stream = stream
        self._limit = limit
        self._read = 0

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        chunk = self._stream.read(len(buffer))
        self._read += len(chunk)
        if self._read > self._limit:
            raise MovebankLimitExceeded(f"Download exceeded {self._limit} bytes")
        buffer[: len(chunk)] = chunk
        return len(chunk)


class MovebankClient:
    def __init__(
        self,
        username: str,
        password: str,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
        max_requests: int = MAX_REQUESTS,
        max_bytes: int = MAX_BYTES_PER_REQUEST,
    ) -> None:
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        self._headers = {"Authorization": f"Basic {token}", "User-Agent": USER_AGENT}
        self._opener = opener
        self._sleep = sleep
        self._max_requests = max_requests
        self._max_bytes = max_bytes
        self.requests_made = 0

    def _open(self, params: dict[str, Any]) -> Any:
        url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(url, headers=self._headers)
        for attempt in range(RETRIES + 1):
            if self.requests_made >= self._max_requests:
                raise MovebankLimitExceeded(
                    f"Stopping at the limit of {self._max_requests} requests"
                )
            self.requests_made += 1
            self._sleep(MIN_INTERVAL_SECONDS)
            try:
                return self._opener(request, timeout=TIMEOUT_SECONDS)
            except urllib.error.HTTPError as error:
                if error.code != 429 and error.code < 500:
                    raise MovebankError(f"HTTP {error.code} for {url}") from error
                failure: Exception = error
            except (urllib.error.URLError, TimeoutError) as error:
                failure = error
            if attempt < RETRIES:
                delay = BACKOFF_SECONDS * 2**attempt
                logger.warning("Retrying %s in %.0f s: %s", url, delay, failure)
                self._sleep(delay)
        raise MovebankError(f"Giving up on {url}: {failure}")

    def rows(self, params: dict[str, Any]) -> Iterator[dict[str, str]]:
        """Streams CSV rows without storing the raw download."""
        response = self._open(params)
        try:
            if response.headers.get("accept-license") == "true":
                raise LicenceNotAccepted(
                    f"Licence not accepted for study {params.get('study_id')}"
                )
            limited = io.BufferedReader(_ByteLimit(response, self._max_bytes))
            text = io.TextIOWrapper(limited, encoding="utf-8", newline="")
            try:
                yield from csv.DictReader(text)
            except (OSError, TimeoutError, http.client.HTTPException) as error:
                raise DownloadInterrupted(f"Download interrupted: {error}") from error
        finally:
            response.close()

    def study(self, study_id: int) -> dict[str, str]:
        for row in self.rows({"entity_type": "study", "study_id": study_id}):
            return row
        raise MovebankError(f"Study {study_id} not found")
