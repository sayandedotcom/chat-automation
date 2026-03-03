"""Download Task Arena action dataset."""

import json
import urllib.request
from pathlib import Path

DATASETS_DIR = Path(__file__).parent / "datasets"
DATASETS_DIR.mkdir(exist_ok=True)

ACTION_URL = "https://raw.githubusercontent.com/dimensionhq/task-arena/master/datasets/action.json"


def download_dataset():
    """Download Task Arena action dataset."""
    dest = DATASETS_DIR / "action.json"
    print("Downloading action dataset...")
    urllib.request.urlretrieve(ACTION_URL, dest)
    print(f"  Saved to {dest}")


def load_dataset() -> list:
    """Load the action dataset."""
    path = DATASETS_DIR / "action.json"
    with open(path) as f:
        return json.load(f)


if __name__ == "__main__":
    download_dataset()
    data = load_dataset()
    print(f"Action dataset: {len(data)} tasks")
