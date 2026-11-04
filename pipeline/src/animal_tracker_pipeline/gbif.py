"""Minimal JSON API client with timeouts, retries, pacing and a request budget.

Used for GBIF, and for Wikipedia and Wikimedia Commons in the profiles step.
"""

import http.client
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

BASE_URL = "https://api.gbif.org/v1/"
USER_AGENT = "animal-tracker-map (https://github.com/Prestoj01/animal-tracker-map)"
TIMEOUT_SECONDS = 30
RETRIES = 3
BACKOFF_SECONDS = 2.0
MIN_INTERVAL_SECONDS = 0.2
MAX_REQUESTS = 2000


class GbifError(RuntimeError):
    pass


class RequestBudgetExceeded(GbifError):
    """Hard stop: the run would make more requests than we allow ourselves."""


class JsonClient:
    def __init__(
        self,
        base_url: str,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
        max_requests: int = MAX_REQUESTS,
        min_interval: float = MIN_INTERVAL_SECONDS,
    ) -> None:
        self._base_url = base_url
        self._opener = opener
        self._sleep = sleep
        self._max_requests = max_requests
        self._min_interval = min_interval
        self.requests_made = 0

    def get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{path}?{urllib.parse.urlencode(params, doseq=True)}"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(RETRIES + 1):
            if self.requests_made >= self._max_requests:
                raise RequestBudgetExceeded(
                    f"Stopping at the limit of {self._max_requests} requests"
                )
            self.requests_made += 1
            self._sleep(self._min_interval)
            try:
                with self._opener(request, timeout=TIMEOUT_SECONDS) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code != 429 and error.code < 500:
                    raise GbifError(f"HTTP {error.code} for {url}") from error
                failure: Exception = error
            # Dropped connections and cut-off responses are worth another try.
            except (
                urllib.error.URLError,
                TimeoutError,
                ConnectionError,
                http.client.HTTPException,
            ) as error:
                failure = error
            if attempt < RETRIES:
                delay = BACKOFF_SECONDS * 2**attempt
                logger.warning("Retrying %s in %.0f s: %s", url, delay, failure)
                self._sleep(delay)
        raise GbifError(f"Giving up on {url}: {failure}")


class GbifClient(JsonClient):
    def __init__(self, **options: Any) -> None:
        super().__init__(BASE_URL, **options)
