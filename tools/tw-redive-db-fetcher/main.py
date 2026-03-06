"""TW Redive Master DB Fetcher"""
import json
import hashlib
import requests
import UnityPy
import config


def load_version() -> dict:
    try:
        with open(config.VERSION_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"truth_version": 0, "hash": ""}


def save_version(version: int, bundle_hash: str):
    with open(config.VERSION_FILE, "w") as f:
        json.dump({"truth_version": version, "hash": bundle_hash}, f, indent=2)


def _check_version(session: requests.Session, version: int) -> bool:
    url = config.MANIFEST_URL.format(
        host=config.CDN_HOST,
        version=str(version).zfill(8),
        platform=config.PLATFORM,
        manifest_name="manifest_assetmanifest",
    )
    try:
        resp = session.head(url, timeout=5)
        return resp.status_code == 200
    except requests.RequestException:
        return False


def guess_truth_version(last_version: dict) -> int | None:
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT

    current = last_version["truth_version"]
    latest = current

    deltas = [1000000, 100000, 10000, 1000, 100, 10, 1]

    for delta in deltas:
        for i in range(1, 10):
            guess = latest + delta * i
            if _check_version(session, guess):
                latest = guess
                continue
            # When major version increments, minor resets to 1 (not 0).
            # e.g. 00180025 -> 00190001 (00190000 doesn't exist)
            if i == 1 and delta >= 10:
                alt = guess + 1
                if _check_version(session, alt):
                    latest = alt
                    continue
            break

    if latest == current:
        return None
    return latest


def main():
    last_version = load_version()
    new_version = guess_truth_version(last_version)
    if new_version is None:
        print("No update found")
        return

    version_str = str(new_version).zfill(8)
    print(f"Found new version: {version_str}")

    db_bytes, bundle_hash = download_and_extract(new_version)
    if db_bytes is None:
        print("CDN download failed, trying GitHub fallback...")
        db_bytes = download_from_github()
        bundle_hash = ""

    if db_bytes:
        save_db(db_bytes, new_version, bundle_hash)
        print("Done!")
    else:
        print("All download methods failed")


if __name__ == "__main__":
    main()
