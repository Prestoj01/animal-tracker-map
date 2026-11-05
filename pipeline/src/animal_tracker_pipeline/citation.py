"""Registers the site's sightings with GBIF as a derived dataset, for a citable DOI.

GBIF asks that data from its search API be cited through a derived dataset: a
record listing every source dataset and how many records each contributed. The
sightings pipeline counts those per species in data/gbif-datasets/; this adds
them up and registers them.

Registering creates a permanent public DOI under your GBIF account, so it only
happens when asked. Preview with:
    python -m animal_tracker_pipeline.citation
then register with:
    python -m animal_tracker_pipeline.citation --register
It reads GBIF_USERNAME and GBIF_PASSWORD from the environment or the repo's .env.
"""

import argparse
import base64
import datetime
import gzip
import hashlib
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any

from animal_tracker_pipeline.species import DEFAULT_PATH, Species, load_species

logger = logging.getLogger(__name__)

DATA_DIR = DEFAULT_PATH.parent
OUTPUT_PATH = DATA_DIR / "gbif-citation.json"
ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
REGISTER_URL = "https://api.gbif.org/v1/derivedDataset"
USER_AGENT = "animal-tracker-map (https://github.com/Prestoj01/animal-tracker-map)"
SOURCE_URL = "https://github.com/Prestoj01/animal-tracker-map/tree/main/data/sightings"
TIMEOUT_SECONDS = 60
RETRIES = 3
BACKOFF_SECONDS = 5.0
# Only answers that mean "nothing was created, come back later" are retried. A
# timeout might hide a registration that worked, and retrying it would mint a
# second DOI.
RETRY_STATUSES = {429, 502, 503, 504}


class CitationError(RuntimeError):
    pass


def collect_datasets(species: list[Species], datasets_dir: Path) -> Counter[str]:
    """Records used from each GBIF dataset, across every species' sightings."""
    totals: Counter[str] = Counter()
    for entry in species:
        path = datasets_dir / f"{entry.id}.json.gz"
        if not path.exists():
            raise CitationError(
                f"No dataset counts for {entry.id}; refresh sightings first"
            )
        totals.update(json.loads(gzip.decompress(path.read_bytes()))["datasets"])
    return totals


def fingerprint(datasets: Counter[str]) -> str:
    """Identifies a set of dataset counts, so the same data isn't registered twice."""
    body = json.dumps(dict(sorted(datasets.items())), separators=(",", ":"))
    return hashlib.sha256(body.encode()).hexdigest()[:16]


def registration_body(datasets: Counter[str], species_count: int) -> dict[str, Any]:
    return {
        "title": "Animal Tracker Map: sampled sightings of popular animals",
        "description": (
            f"Locations of {species_count} animal species shown on Animal Tracker Map, "
            "sampled from GBIF occurrence search. Only human and machine observations "
            "with coordinates and no geospatial issues are used, spread across each "
            "species' countries, rounded to 0.1 degrees, with records outside the "
            "native range removed. Method: "
            "https://github.com/Prestoj01/animal-tracker-map/blob/main/docs/data-format.md"
        ),
        "sourceUrl": SOURCE_URL,
        "relatedDatasets": dict(sorted(datasets.items())),
    }


def gbif_credentials(env_path: Path = ENV_PATH) -> tuple[str, str]:
    """Reads the GBIF login from the environment, falling back to the repo's .env."""
    values = dict(os.environ)
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and not key.startswith("#"):
                values.setdefault(key.strip(), value.strip().strip("\"'"))
    try:
        return values["GBIF_USERNAME"], values["GBIF_PASSWORD"]
    except KeyError as error:
        raise CitationError(f"Missing {error.args[0]} in the environment") from error


def register(
    body: dict[str, Any],
    username: str,
    password: str,
    opener: Callable[..., Any] = urllib.request.urlopen,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    request = urllib.request.Request(
        REGISTER_URL,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    for attempt in range(RETRIES + 1):
        try:
            with opener(request, timeout=TIMEOUT_SECONDS) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in RETRY_STATUSES or attempt == RETRIES:
                raise CitationError(
                    f"GBIF refused the registration: HTTP {error.code}"
                ) from error
            delay = BACKOFF_SECONDS * 2**attempt
            logger.warning(
                "GBIF answered HTTP %d; retrying in %.0f s", error.code, delay
            )
            sleep(delay)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise CitationError(
                f"Lost contact with GBIF during registration ({error}). It may have "
                "worked: check your derived datasets on gbif.org before trying again."
            ) from error
    raise CitationError("Unreachable")


def citation_record(
    response: dict[str, Any], datasets: Counter[str], today: datetime.date
) -> dict[str, Any]:
    doi = response.get("doi")
    if not doi:
        raise CitationError("GBIF's answer had no DOI")
    url = f"https://doi.org/{doi}"
    return {
        "doi": doi,
        "url": url,
        "citation": f"GBIF.org ({today.day} {today:%B %Y}) Derived dataset {url}",
        "registered": today.isoformat(),
        "records": sum(datasets.values()),
        "datasets": len(datasets),
        "fingerprint": fingerprint(datasets),
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--register", action="store_true", help="register with GBIF")
    args = parser.parse_args(argv)

    species = load_species()
    try:
        datasets = collect_datasets(species, DATA_DIR / "gbif-datasets")
    except CitationError as error:
        logger.error("%s", error)
        return 1
    logger.info(
        "%d records from %d GBIF datasets", sum(datasets.values()), len(datasets)
    )
    if not args.register:
        logger.info("Preview only. Run with --register to create the DOI.")
        return 0

    if OUTPUT_PATH.exists():
        current = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        if current.get("fingerprint") == fingerprint(datasets):
            logger.info("This data is already registered as %s", current["url"])
            return 0
    try:
        username, password = gbif_credentials()
        response = register(
            registration_body(datasets, len(species)), username, password
        )
        record = citation_record(response, datasets, datetime.date.today())
    except CitationError as error:
        logger.error("%s", error)
        return 1
    OUTPUT_PATH.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    logger.info("Registered %s", record["url"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
