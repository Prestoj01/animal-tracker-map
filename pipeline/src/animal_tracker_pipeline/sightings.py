"""Builds data/sightings/<species id>.json.gz from GBIF.

Each species gets a sample spread across its countries, so the map shows where
it occurs rather than how heavily each country is recorded. Run with:
    python -m animal_tracker_pipeline.sightings
"""

import logging
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from animal_tracker_pipeline.gbif import GbifClient, GbifError, RequestBudgetExceeded
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import DEFAULT_PATH, Species, load_species
from animal_tracker_pipeline.summary import write_summary

logger = logging.getLogger(__name__)

OUTPUT_DIR = DEFAULT_PATH.parent / "sightings"
TARGET_POINTS = 3000
MIN_PER_COUNTRY = 30
MAX_PER_COUNTRY = 300  # GBIF's page size limit
MAX_COUNTRIES = 60
# About 11 km at the equator: enough for a world map, and it avoids publishing
# precise locations of threatened animals.
COORDINATE_DECIMALS = 1

# GBIF returns its newest records first, so the country sample above is mostly
# recent. Each older period gets its own sample so the site's time slider has
# something to show. Matches the periods in web/src/timeline.ts.
HISTORY_PERIODS = ["1700,1989", "1990,1999", "2000,2009", "2010,2019"]
PER_PERIOD = 300  # GBIF's page size limit

BASE_FILTERS = {
    "hasCoordinate": "true",
    "hasGeospatialIssue": "false",
    "occurrenceStatus": "PRESENT",
    # Leaves out zoo animals, museum specimens and fossils.
    "basisOfRecord": ["HUMAN_OBSERVATION", "MACHINE_OBSERVATION"],
}

# Countries outside a species' range, whose records are captive or misidentified.
# Reviewed by hand against GBIF's per-country counts; see docs/data-format.md.
EXCLUDED_COUNTRIES: dict[str, set[str]] = {
    "tiger": {"BR", "DE", "US", "MW"},
    "lion": {"BR", "FR", "US", "DE"},
    "african-bush-elephant": {"DE", "US"},
    "african-forest-elephant": {"ZA", "KE"},
    "giraffe": {"BR", "DE"},
    "giant-panda": {"DE"},
    "cheetah": {"DE", "US"},
    "polar-bear": {"DE", "EE"},
    "grey-wolf": {"CO", "BR", "TT", "GB", "IE"},
    "western-gorilla": {"US", "DE"},
    "brown-bear": {"BR", "GB", "IE"},
    "puma": {"DE", "LK"},
    "white-rhino": {"SN", "US", "BR", "NE"},
    "wildebeest": {"NG", "TG", "TD", "US"},
    # Introduced or herded outside the native range. Scandinavian records still
    # include herded reindeer, which GBIF doesn't separate from wild ones.
    "caribou": {"GB", "IS", "GS", "TF", "FR", "IE", "EE", "CN", "MN"},
    "whale-shark": {"AQ", "CA", "FR", "TR"},
    "great-white-shark": {"GB", "NL", "BE", "RU"},
    "bald-eagle": {
        "BE", "NL", "FR", "SE", "DE", "GB", "DK", "JP", "EE", "ES", "NG", "IE", "SN",
        "ZA",
    },
}

# GBIF files domestic dogs and dingoes under Canis lupus, so wolves are queried
# by their own taxa: the species itself plus its wild subspecies.
TAXON_FILTERS: dict[str, dict[str, list[int]]] = {
    "grey-wolf": {
        "acceptedTaxonKey": [
            5219173, 7193871, 6164182, 6164181, 6164195, 6164216, 6164204, 6164203,
            6164191, 6164202, 6164217, 6164200, 9386601,
        ],
    },
}


def taxon_filter(client: GbifClient, species: Species) -> dict[str, Any]:
    if species.id in TAXON_FILTERS:
        return TAXON_FILTERS[species.id]
    match = client.get(
        "species/match", {"name": species.scientific_name, "strict": "true"}
    )
    if match.get("matchType") != "EXACT" or "usageKey" not in match:
        raise GbifError(f"No exact GBIF match for {species.scientific_name}")
    return {"taxonKey": match["usageKey"]}


def records_per_country(counts: dict[str, int], total: int) -> dict[str, int]:
    """Shares TARGET_POINTS by country, keeping sparsely recorded countries visible."""
    largest = sorted(counts.items(), key=lambda item: -item[1])[:MAX_COUNTRIES]
    return {
        country: min(
            count,
            MAX_PER_COUNTRY,
            max(MIN_PER_COUNTRY, round(TARGET_POINTS * count / total)),
        )
        for country, count in largest
    }


def to_points(
    records: list[dict[str, Any]], excluded: set[str], datasets: Counter[str]
) -> set[tuple[float, float, int | None]]:
    """Rounded places with their year, leaving out records from excluded countries.

    Counts each used record against its GBIF dataset in `datasets`, for the
    derived-dataset citation (see citation.py).
    """
    points = set()
    for record in records:
        longitude = record.get("decimalLongitude")
        latitude = record.get("decimalLatitude")
        if longitude is None or latitude is None:
            continue
        if record.get("countryCode") in excluded:
            continue
        if "datasetKey" in record:
            datasets[record["datasetKey"]] += 1
        year = record.get("year")
        points.add(
            (
                round(longitude, COORDINATE_DECIMALS),
                round(latitude, COORDINATE_DECIMALS),
                year if isinstance(year, int) else None,
            )
        )
    return points


def history_points(
    client: GbifClient,
    filters: dict[str, Any],
    excluded: set[str],
    datasets: Counter[str],
) -> set[tuple[float, float, int | None]]:
    """A sample from each older period, which the country sample barely reaches."""
    points = set()
    for years in HISTORY_PERIODS:
        results = client.get(
            "occurrence/search", {**filters, "year": years, "limit": PER_PERIOD}
        )["results"]
        points.update(to_points(results, excluded, datasets))
    return points


def fetch_sightings(client: GbifClient, species: Species) -> dict[str, Any]:
    filters = {**BASE_FILTERS, **taxon_filter(client, species)}
    facets = client.get(
        "occurrence/search",
        {**filters, "limit": 0, "facet": "country", "facetLimit": 300},
    )["facets"]
    excluded = EXCLUDED_COUNTRIES.get(species.id, set())
    counts = {
        entry["name"]: entry["count"]
        for facet in facets
        for entry in facet["counts"]
        if entry["name"] not in excluded
    }
    total = sum(counts.values())

    # The year is kept so the site can show how sightings change over time. A
    # place seen in several years appears once per year.
    points: set[tuple[float, float, int | None]] = set()
    datasets: Counter[str] = Counter()
    for country, limit in records_per_country(counts, total).items():
        results = client.get(
            "occurrence/search", {**filters, "country": country, "limit": limit}
        )["results"]
        points.update(to_points(results, excluded, datasets))
    points.update(history_points(client, filters, excluded, datasets))
    return {
        "speciesId": species.id,
        "totalRecords": total,
        "points": sorted(points, key=lambda point: (point[0], point[1], point[2] or 0)),
        "datasets": dict(sorted(datasets.items())),
    }


def write_sightings(sightings: dict[str, Any], output_dir: Path) -> Path:
    """Writes the points for the site, and the dataset counts beside them.

    The counts are only for the GBIF citation, so they go in their own file in
    a gbif-datasets folder next to output_dir, keeping the site's downloads small.
    """
    species_id = sightings["speciesId"]
    points = {key: value for key, value in sightings.items() if key != "datasets"}
    path = write_json_gz(points, output_dir / f"{species_id}.json.gz")
    if "datasets" in sightings:
        write_json_gz(
            {"speciesId": species_id, "datasets": sightings["datasets"]},
            output_dir.parent / "gbif-datasets" / f"{species_id}.json.gz",
        )
    return path


def run(client: GbifClient, species: list[Species], output_dir: Path) -> list[str]:
    """Returns ids of species that failed; their previous files are left in place."""
    failed = []
    for entry in species:
        try:
            sightings = fetch_sightings(client, entry)
        except RequestBudgetExceeded:
            raise
        except (GbifError, KeyError, ValueError) as error:
            logger.error("Skipping %s: %s", entry.id, error)
            failed.append(entry.id)
            continue
        path = write_sightings(sightings, output_dir)
        logger.info(
            "%s: %d points from %d records, %d bytes",
            entry.id,
            len(sightings["points"]),
            sightings["totalRecords"],
            path.stat().st_size,
        )
    return failed


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    client = GbifClient()
    try:
        failed = run(client, load_species(), OUTPUT_DIR)
    except RequestBudgetExceeded as error:
        logger.error("%s", error)
        return 1
    logger.info("Made %d requests", client.requests_made)
    write_summary()
    if failed:
        logger.error("Failed species: %s", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
