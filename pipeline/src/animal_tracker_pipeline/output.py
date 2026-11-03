import gzip
import json
from pathlib import Path
from typing import Any


def write_json_gz(data: Any, path: Path) -> Path:
    """Writes atomically; a fixed gzip timestamp keeps unchanged data unchanged."""
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, separators=(",", ":")).encode()
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(gzip.compress(body, mtime=0))
    temporary.replace(path)
    return path
