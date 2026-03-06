"""TW Redive Master DB Fetcher"""
import argparse
import json
import hashlib
import os
import requests
import UnityPy
import UnityPy.config
import config

# Set Unity fallback version for TW asset bundles
UnityPy.config.FALLBACK_UNITY_VERSION = config.UNITY_VERSION
UnityPy.config.FALLBACK_VERSION_WARNED = True


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
    """Guess latest TruthVersion by probing CDN manifest endpoints.

    Uses decreasing deltas (1M, 100K, 10K, 1K, 100, 10, 1) to narrow down.
    For each delta, keeps incrementing until failure, then tries +1..+4
    offsets (version resets don't always land on round numbers).
    """
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT

    current = last_version["truth_version"]
    latest = current

    deltas = [1000000, 100000, 10000, 1000, 100, 10, 1]

    for delta in deltas:
        while True:
            guess = latest + delta
            if _check_version(session, guess):
                latest = guess
                continue
            # Try offsets +1..+4 for version resets
            if delta > 1:
                found_alt = False
                for offset in range(1, 5):
                    if _check_version(session, guess + offset):
                        latest = guess + offset
                        found_alt = True
                        break
                if found_alt:
                    continue
            break

    if latest == current:
        return None
    return latest


def get_master_bundle_info(version: int, session: requests.Session) -> tuple[str, int]:
    version_str = str(version).zfill(8)
    url = config.MANIFEST_URL.format(
        host=config.CDN_HOST,
        version=version_str,
        platform=config.PLATFORM,
        manifest_name=config.MASTERDATA_MANIFEST,
    )
    resp = session.get(url, timeout=10)
    resp.raise_for_status()

    for line in resp.text.strip().split("\n"):
        if config.MASTER_BUNDLE_NAME in line:
            fields = line.strip().rstrip(",").split(",")
            bundle_hash = fields[1] if fields[2] == "tutorial0" else fields[2]
            bundle_size = int(fields[-1])
            return bundle_hash, bundle_size

    raise ValueError("masterdata bundle not found in manifest")


def download_bundle(bundle_hash: str, expected_size: int, session: requests.Session) -> bytes | None:
    url = config.POOL_URL.format(
        host=config.CDN_HOST,
        hash_prefix=bundle_hash[:2],
        hash=bundle_hash,
    )
    try:
        resp = session.get(url, timeout=60)
        if resp.status_code != 200:
            print(f"Pool download failed: HTTP {resp.status_code}")
            return None
        if len(resp.content) != expected_size:
            print(f"Size mismatch: got {len(resp.content)}, expected {expected_size}")
            return None
        return resp.content
    except requests.RequestException as e:
        print(f"Download error: {e}")
        return None


def extract_db_from_bundle(bundle_data: bytes) -> bytes | None:
    env = UnityPy.load(bundle_data)
    for obj in env.objects:
        if obj.type.name == "TextAsset":
            data = obj.read()
            if data.m_Name == "master":
                raw = obj.get_raw_data()
                # Raw format: name_len(4) + name + padding + script_len(4) + script_bytes
                # Find SQLite header to extract the DB reliably
                idx = raw.find(b"SQLite format 3")
                if idx >= 0:
                    return raw[idx:]
                print("SQLite header not found in TextAsset raw data")
                return None
    print("TextAsset 'master' not found in bundle")
    return None


def download_from_github() -> bytes | None:
    try:
        resp = requests.get(config.GITHUB_FALLBACK_URL, timeout=120)
        if resp.status_code == 200:
            print(f"Downloaded from GitHub: {len(resp.content)} bytes")
            return resp.content
        print(f"GitHub download failed: HTTP {resp.status_code}")
        return None
    except requests.RequestException as e:
        print(f"GitHub download error: {e}")
        return None


def save_db(db_bytes: bytes, truth_version: int = 0, bundle_hash: str = ""):
    os.makedirs(os.path.dirname(config.OUTPUT_DB), exist_ok=True)
    with open(config.OUTPUT_DB, "wb") as f:
        f.write(db_bytes)
    print(f"Saved {config.OUTPUT_DB} ({len(db_bytes)} bytes)")

    try:
        import brotli
        compressed = brotli.compress(db_bytes, quality=9)
        with open(config.OUTPUT_DB_BR, "wb") as f:
            f.write(compressed)
        print(f"Saved {config.OUTPUT_DB_BR} ({len(compressed)} bytes)")
    except ImportError:
        pass

    save_version(truth_version, bundle_hash)


def download_and_extract(version: int) -> tuple[bytes | None, str]:
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT

    print(f"Fetching manifest for version {str(version).zfill(8)}...")
    bundle_hash, bundle_size = get_master_bundle_info(version, session)
    print(f"Bundle hash: {bundle_hash}, size: {bundle_size}")

    print("Downloading bundle from CDN pool...")
    bundle_data = download_bundle(bundle_hash, bundle_size, session)
    if bundle_data is None:
        return None, bundle_hash

    print("Extracting database from bundle...")
    db_bytes = extract_db_from_bundle(bundle_data)
    return db_bytes, bundle_hash


def github_update(force: bool = False) -> bool:
    """Download DB from GitHub, skip if unchanged (by comparing MD5)."""
    last = load_version()
    last_hash = last.get("hash", "")

    print("Checking GitHub for updates...")
    db_bytes = download_from_github()
    if db_bytes is None:
        return False

    new_hash = hashlib.md5(db_bytes).hexdigest()
    if new_hash == last_hash and not force:
        print(f"Database unchanged (hash: {new_hash[:12]}...)")
        return False

    print(f"Database updated: {last_hash[:12] or 'none'}... -> {new_hash[:12]}...")
    save_db(db_bytes, truth_version=0, bundle_hash=new_hash)

    print("Deobfuscating database...")
    from deobfuscate import deobfuscate
    deobfuscate(config.OUTPUT_DB)
    return True


def cdn_update() -> bool:
    """Full CDN flow: guess version -> download bundle -> extract -> deobfuscate."""
    last_version = load_version()
    new_version = guess_truth_version(last_version)
    if new_version is None:
        print("No update found")
        return False

    version_str = str(new_version).zfill(8)
    print(f"Found new version: {version_str}")

    db_bytes, bundle_hash = download_and_extract(new_version)
    if db_bytes is None:
        print("CDN download failed, trying GitHub fallback...")
        db_bytes = download_from_github()
        bundle_hash = hashlib.md5(db_bytes).hexdigest() if db_bytes else ""

    if not db_bytes:
        print("All download methods failed")
        return False

    save_db(db_bytes, truth_version=new_version, bundle_hash=bundle_hash)

    print("Deobfuscating database...")
    from deobfuscate import deobfuscate
    deobfuscate(config.OUTPUT_DB)
    return True


def parse_args():
    parser = argparse.ArgumentParser(description="TW Redive Master DB Fetcher")
    parser.add_argument(
        "--github-only", action="store_true",
        help="Only download from GitHub (skip CDN version guessing)",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Force re-download even if hash unchanged",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if args.github_only:
        success = github_update(force=args.force)
    else:
        success = cdn_update()

    if success:
        print("Done!")
    else:
        print("No changes.")


if __name__ == "__main__":
    main()
