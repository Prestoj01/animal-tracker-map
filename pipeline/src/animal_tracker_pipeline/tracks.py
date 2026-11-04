"""Builds data/tracks/<species id>.json.gz from Movebank.

Raw Movebank data is streamed and reduced in memory, never written to disk:
each animal keeps at most one location per day. Run with:
    python -m animal_tracker_pipeline.tracks
"""

import datetime
import html
import logging
import re
import sys
from pathlib import Path
from typing import Any

from animal_tracker_pipeline.movebank import (
    LicenceNotAccepted,
    MovebankClient,
    MovebankError,
    MovebankLimitExceeded,
    credentials,
    study_url,
)
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import DEFAULT_PATH, Species, load_species
from animal_tracker_pipeline.summary import write_summary

logger = logging.getLogger(__name__)

OUTPUT_DIR = DEFAULT_PATH.parent / "tracks"
MAX_ANIMALS = 30
MAX_POINTS_PER_ANIMAL = 400
# About 1 km. Precise enough to follow an animal, coarse enough to protect it.
COORDINATE_DECIMALS = 2
EVENT_ATTRIBUTES = (
    "individual_local_identifier,individual_taxon_canonical_name,"
    "timestamp,location_long,location_lat,visible"
)

# One reviewed study per species; see docs/species-selection.md. Species not
# listed have no downloadable study.
TRACK_STUDIES: dict[str, int] = {
    "lion": 3809257699,
    "cheetah": 1260886163,
    "puma": 1674593154,
    "african-bush-elephant": 605129389,
    "african-forest-elephant": 1818825,
    "brown-bear": 14261492,
    "grey-wolf": 492444603,
    "wildebeest": 208413731,
    "caribou": 5808436651,
    "humpback-whale": 3030068329,
    "blue-whale": 650188969,
    "whale-shark": 1153270750,
    "green-sea-turtle": 3267664208,
    "emperor-penguin": 1322558986,
    "bald-eagle": 20873986,
    "snowy-owl": 12112706,
}


def plain_text(value: str) -> str:
    """Movebank citations contain HTML; the site shows them as plain text."""
    text = re.sub(r"<br\s*/?>", " ", value or "", flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return re.sub(r"\s+", " ", text).strip()


def reduce_events(
    rows: Any, scientific_name: str
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """Keeps one location per animal per day and returns tracks plus the date range.

    Each track names its animal and start date, and each point carries the
    number of days since that start, so the site can show dates and replay it.
    """
    daily: dict[tuple[str, str], tuple[str, float, float]] = {}
    for row in rows:
        animal = row.get("individual_local_identifier") or ""
        if not animal:
            continue  # Tag readings from outside a deployment on an animal.
        taxon = row.get("individual_taxon_canonical_name") or ""
        if taxon and taxon.lower() != scientific_name.lower():
            continue  # Studies can track several species.
        if row.get("visible", "true").lower() == "false":
            continue  # Marked as an outlier by the data owner.
        try:
            longitude = float(row["location_long"])
            latitude = float(row["location_lat"])
        except (KeyError, TypeError, ValueError):
            continue
        if (longitude, latitude) == (0.0, 0.0) or not (
            -180 <= longitude <= 180 and -90 <= latitude <= 90
        ):
            continue
        timestamp = row.get("timestamp") or ""
        key = (animal, timestamp[:10])
        if key not in daily or timestamp < daily[key][0]:
            daily[key] = (timestamp, longitude, latitude)

    by_animal: dict[str, list[tuple[str, float, float]]] = {}
    for (animal, _), fix in daily.items():
        by_animal.setdefault(animal, []).append(fix)

    tracks = []
    largest = sorted(by_animal.items(), key=lambda item: len(item[1]), reverse=True)
    for animal, fixes in largest[:MAX_ANIMALS]:
        fixes.sort()
        start = datetime.date.fromisoformat(fixes[0][0][:10])
        step = max(1, -(-len(fixes) // MAX_POINTS_PER_ANIMAL))
        points: list[list[float]] = []
        for timestamp, longitude, latitude in fixes[::step]:
            position = [
                round(longitude, COORDINATE_DECIMALS),
                round(latitude, COORDINATE_DECIMALS),
            ]
            if points and points[-1][:2] == position:
                continue  # The animal stayed put; its first day there is kept.
            day = (datetime.date.fromisoformat(timestamp[:10]) - start).days
            points.append([*position, day])
        if len(points) >= 2:
            tracks.append(
                {"animal": animal, "start": start.isoformat(), "points": points}
            )

    days = sorted(day for _, day in daily)
    return tracks, (days[0] if days else None), (days[-1] if days else None)


def fetch_tracks(client: MovebankClient, species: Species) -> dict[str, Any]:
    study_id = TRACK_STUDIES[species.id]
    study = client.study(study_id)
    rows = client.rows(
        {"entity_type": "event", "study_id": study_id, "attributes": EVENT_ATTRIBUTES}
    )
    tracks, first_day, last_day = reduce_events(rows, species.scientific_name)
    return {
        "speciesId": species.id,
        "study": {
            "id": study_id,
            "name": plain_text(study.get("name", "")),
            "citation": plain_text(study.get("citation", "")),
            "licenseType": study.get("license_type", ""),
            "url": study_url(study_id),
            "firstYear": int(first_day[:4]) if first_day else None,
            "lastYear": int(last_day[:4]) if last_day else None,
        },
        "tracks": tracks,
    }


def no_tracks(species: Species) -> dict[str, Any]:
    return {"speciesId": species.id, "study": None, "tracks": []}


def run(
    client: MovebankClient, species: list[Species], output_dir: Path
) -> dict[str, list[str]]:
    """Returns ids of species whose licence is pending or whose download failed.

    A species that fails keeps its previous file. If it has none yet, it gets an
    empty one, so the site shows "no tracks" instead of an error.
    """
    problems: dict[str, list[str]] = {"licence": [], "failed": []}
    for entry in species:
        path = output_dir / f"{entry.id}.json.gz"
        if entry.id not in TRACK_STUDIES:
            write_json_gz(no_tracks(entry), path)
            continue
        try:
            data = fetch_tracks(client, entry)
        except MovebankLimitExceeded:
            raise
        except LicenceNotAccepted:
            logger.warning(
                "%s: accept the licence at %s",
                entry.id,
                study_url(TRACK_STUDIES[entry.id]),
            )
            problems["licence"].append(entry.id)
        except MovebankError as error:
            logger.error("Skipping %s: %s", entry.id, error)
            problems["failed"].append(entry.id)
        else:
            write_json_gz(data, path)
            logger.info(
                "%s: %d animals, %d points, %d bytes",
                entry.id,
                len(data["tracks"]),
                sum(len(track["points"]) for track in data["tracks"]),
                path.stat().st_size,
            )
            continue
        if not path.exists():
            write_json_gz(no_tracks(entry), path)
    return problems


def exit_code(problems: dict[str, list[str]]) -> int:
    """Only download failures count as errors.

    A licence still waiting to be accepted is expected, so the weekly refresh
    shouldn't fail until every one is accepted.
    """
    return 1 if problems["failed"] else 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        client = MovebankClient(*credentials())
        problems = run(client, load_species(), OUTPUT_DIR)
    except MovebankError as error:
        logger.error("%s", error)
        return 1
    write_summary()
    if problems["licence"]:
        logger.warning("Licences to accept: %s", ", ".join(problems["licence"]))
    if problems["failed"]:
        logger.error("Failed species: %s", ", ".join(problems["failed"]))
    return exit_code(problems)


if __name__ == "__main__":
    sys.exit(main())
