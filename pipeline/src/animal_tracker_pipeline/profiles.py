"""Builds data/profiles.json.gz: a short Wikipedia profile and photo for each species.

Text comes from Wikipedia (CC BY-SA). Photos are only taken from Wikimedia
Commons, whose files are freely licensed, and keep their author and licence for
the credit line. Run with:
    python -m animal_tracker_pipeline.profiles
"""

import gzip
import html
import json
import logging
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

from animal_tracker_pipeline.gbif import GbifError, JsonClient, RequestBudgetExceeded
from animal_tracker_pipeline.output import write_json_gz
from animal_tracker_pipeline.species import DEFAULT_PATH, Species, load_species

logger = logging.getLogger(__name__)

OUTPUT_PATH = DEFAULT_PATH.parent / "profiles.json.gz"
WIKIPEDIA = "https://en.wikipedia.org/api/rest_v1/"
COMMONS = "https://commons.wikimedia.org/w/api.php"
PHOTO_WIDTH = 640
# Fair-use images live on Wikipedia itself; free ones live on Commons.
COMMONS_FILES = "/wikipedia/commons/"
# Where a scientific name leads to the wrong article. Giraffa camelopardalis now
# names only the northern giraffe, but the site means giraffes in general.
ARTICLE_TITLES = {"giraffe": "Giraffe"}


def plain_text(value: str) -> str:
    """Commons credits are HTML; the site shows them as plain text."""
    text = html.unescape(re.sub(r"<[^>]+>", "", value or ""))
    return re.sub(r"\s+", " ", text).strip()


def photo_credit(commons: JsonClient, image_url: str) -> dict[str, str] | None:
    if COMMONS_FILES not in image_url:
        return None
    parts = urllib.parse.urlparse(image_url).path.split("/")
    # Resized copies end in "<width>px-<file>", after a folder named for the file.
    file_name = urllib.parse.unquote(parts[-2] if "thumb" in parts else parts[-1])
    pages = commons.get(
        "",
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": PHOTO_WIDTH,
            "titles": f"File:{file_name}",
        },
    )["query"]["pages"]
    info = (pages[0].get("imageinfo") or [None])[0] if pages else None
    if not info:
        return None
    metadata = info.get("extmetadata", {})

    def field(name: str) -> str:
        return plain_text(metadata.get(name, {}).get("value", ""))

    licence = field("LicenseShortName")
    if not licence:
        return None  # Without a licence there is nothing to credit it under.
    return {
        "url": info.get("thumburl") or info["url"],
        "author": field("Artist") or "Unknown author",
        "licence": licence,
        "licenceUrl": field("LicenseUrl"),
        "sourceUrl": info["descriptionurl"],
    }


def fetch_profile(
    wikipedia: JsonClient, commons: JsonClient, species: Species
) -> dict[str, Any]:
    # Scientific names redirect to the right article, e.g. Puma concolor to Cougar.
    name = ARTICLE_TITLES.get(species.id, species.scientific_name)
    title = urllib.parse.quote(name.replace(" ", "_"))
    summary = wikipedia.get(f"page/summary/{title}", {})
    if summary.get("type") != "standard":
        raise GbifError(f"No Wikipedia article for {species.scientific_name}")
    image = (summary.get("originalimage") or {}).get("source", "")
    return {
        "title": summary["title"],
        "description": summary.get("description", ""),
        "extract": summary.get("extract", ""),
        "url": summary["content_urls"]["desktop"]["page"],
        "photo": photo_credit(commons, image) if image else None,
    }


def run(
    wikipedia: JsonClient, commons: JsonClient, species: list[Species], path: Path
) -> list[str]:
    """Returns ids of species that failed; they keep their previous profile."""
    previous = _read(path)
    profiles: dict[str, Any] = {}
    failed = []
    for entry in species:
        try:
            profiles[entry.id] = fetch_profile(wikipedia, commons, entry)
        except RequestBudgetExceeded:
            raise
        except (GbifError, KeyError, ValueError) as error:
            logger.error("Skipping %s: %s", entry.id, error)
            failed.append(entry.id)
            if entry.id in previous:
                profiles[entry.id] = previous[entry.id]
    write_json_gz(profiles, path)
    return failed


def _read(path: Path) -> dict[str, Any]:
    return json.loads(gzip.decompress(path.read_bytes())) if path.exists() else {}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        failed = run(
            JsonClient(WIKIPEDIA, max_requests=200),
            JsonClient(COMMONS, max_requests=200),
            load_species(),
            OUTPUT_PATH,
        )
    except RequestBudgetExceeded as error:
        logger.error("%s", error)
        return 1
    if failed:
        logger.error("Failed species: %s", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
