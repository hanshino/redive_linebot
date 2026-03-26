"""Rebuild mapping.json by comparing old (clean) and new (obfuscated) master_tw.db.

Downloads:
- Old unobfuscated DB from a known git commit (version 00180024)
- New obfuscated DB from GitHub master

The TW obfuscation:
- Renames tables to v1_<sha256>
- Renames columns to <sha256>
- **Shuffles column order**

Strategy:
1. Pre-filter candidates by sorted type signature (same types, any order)
2. Match tables by comparing row value sets (values are preserved, order shuffled)
3. Match columns by comparing per-column distinct value sets

Usage:
    python rebuild_mapping.py [--dry-run] [--old-db PATH] [--new-db PATH]
"""
import argparse
import collections
import json
import os
import sqlite3
import tempfile

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAPPING_FILE = os.path.join(SCRIPT_DIR, "mapping.json")

OLD_DB_URL = (
    "https://github.com/Expugn/priconne-database/raw/"
    "c55a2de6a973f98fd1486808779272a279f89458/master_tw.db"
)
NEW_DB_URL = (
    "https://raw.githubusercontent.com/Expugn/priconne-database/master/master_tw.db"
)


def download_db(url, label):
    print(f"Downloading {label}...")
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    print(f"  {len(resp.content)} bytes")
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name


def get_table_names(conn, prefix=None):
    """Return list of table names, optionally filtered by prefix."""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    names = [r[0] for r in rows]
    if prefix:
        names = [n for n in names if n.startswith(prefix)]
    return names


def get_col_names(conn, table):
    cols = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    return [c[1] for c in cols]


def get_col_types(conn, table):
    cols = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    return [c[2] for c in cols]


def type_signature(conn, table):
    """Sorted tuple of column types — order-independent structural fingerprint."""
    return tuple(sorted(get_col_types(conn, table)))


def get_row_count(conn, table):
    return conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]


def get_rows(conn, table, limit=100):
    return conn.execute(f'SELECT * FROM "{table}" ORDER BY rowid LIMIT {limit}').fetchall()


def get_col_values(conn, table, col_name, limit=200):
    """Get distinct values for a specific column."""
    rows = conn.execute(
        f'SELECT DISTINCT "{col_name}" FROM "{table}" ORDER BY rowid LIMIT {limit}'
    ).fetchall()
    return set(r[0] for r in rows)


# --- Table matching ---

def row_value_sets(rows):
    """Convert rows to sets of values (order-independent) for comparison."""
    return [frozenset(row) for row in rows]


def match_table_by_data(old_conn, new_conn, clean_name, candidates):
    """Find the best matching candidate by comparing row data.

    Since column order is shuffled, we compare each row as a SET of values.
    """
    old_rows = get_rows(old_conn, clean_name)
    if not old_rows:
        return None

    old_value_sets = row_value_sets(old_rows)
    old_count = get_row_count(old_conn, clean_name)

    best = None
    best_score = 0
    second_best = 0

    for cand_name in candidates:
        new_rows = get_rows(new_conn, cand_name)
        if not new_rows:
            continue

        new_ncols = len(new_rows[0]) if new_rows else 0
        old_ncols = len(old_rows[0]) if old_rows else 0

        # Compare row value sets
        # If new has more columns, truncation won't work (order shuffled).
        # Instead, check if old row's value set is a SUBSET of new row's value set.
        if new_ncols >= old_ncols:
            new_value_sets = row_value_sets(new_rows)
            overlap = 0
            for old_vs in old_value_sets:
                for new_vs in new_value_sets:
                    if old_vs.issubset(new_vs):
                        overlap += 1
                        break
        else:
            continue  # new table has fewer columns — skip

        # Row count similarity
        new_count = get_row_count(new_conn, cand_name)
        count_ratio = min(old_count, new_count) / max(old_count, new_count, 1)

        score = overlap * 10 + count_ratio * 5

        if score > best_score:
            second_best = best_score
            best_score = score
            best = cand_name
        elif score > second_best:
            second_best = score

    if not best or best_score < 10:
        return None
    # Require clear winner
    if second_best > 0 and best_score < second_best * 1.5:
        return None
    return best


# --- Column matching ---

def match_columns(old_conn, new_conn, clean_name, obf_name):
    """Match columns by comparing distinct value sets.

    For each old column, find the new column whose values overlap the most.
    """
    old_cols = get_col_names(old_conn, clean_name)
    new_cols = get_col_names(new_conn, obf_name)

    # Collect distinct values per column
    old_col_vals = {}
    for col in old_cols:
        old_col_vals[col] = get_col_values(old_conn, clean_name, col)

    new_col_vals = {}
    for col in new_cols:
        new_col_vals[col] = get_col_values(new_conn, obf_name, col)

    # Greedy matching: for each old column, find best new column
    col_map = {}
    used_new = set()

    # Sort old columns by uniqueness (more distinct values = easier to match)
    old_cols_sorted = sorted(old_cols, key=lambda c: len(old_col_vals[c]), reverse=True)

    for old_col in old_cols_sorted:
        old_vals = old_col_vals[old_col]
        if not old_vals:
            continue

        best_new = None
        best_overlap = 0

        for new_col in new_cols:
            if new_col in used_new:
                continue
            new_vals = new_col_vals[new_col]
            overlap = len(old_vals & new_vals)
            if overlap > best_overlap:
                best_overlap = overlap
                best_new = new_col

        if best_new and best_overlap > 0:
            col_map[old_col] = best_new
            used_new.add(best_new)

    return col_map


# --- Main rebuild ---

def rebuild_mapping(old_path, new_path):
    old_conn = sqlite3.connect(old_path)
    new_conn = sqlite3.connect(new_path)

    old_tables = get_table_names(old_conn)
    new_v1_tables = get_table_names(new_conn, prefix="v1_")

    print(f"Old tables: {len(old_tables)}, New v1_ tables: {len(new_v1_tables)}")

    # Build type signature index for new tables
    new_by_sig = collections.defaultdict(list)
    for t in new_v1_tables:
        sig = type_signature(new_conn, t)
        new_by_sig[sig].append(t)

    # Also index by column count for broader matching
    new_by_count = collections.defaultdict(list)
    for t in new_v1_tables:
        ncols = len(get_col_names(new_conn, t))
        new_by_count[ncols].append(t)

    mapping = {}
    claimed = set()
    counts = {"sig_unique": 0, "sig_data": 0, "broad_data": 0, "ambiguous": 0, "unmatched": 0}
    ambiguous_details = []

    # Pass 1: unique type signature match (same sorted types = 1 candidate)
    for clean_name in sorted(old_tables):
        sig = type_signature(old_conn, clean_name)
        candidates = [t for t in new_by_sig.get(sig, []) if t not in claimed]
        if len(candidates) == 1:
            obf_name = candidates[0]
            col_map = match_columns(old_conn, new_conn, clean_name, obf_name)
            mapping[clean_name] = {"table": obf_name, "column": col_map}
            claimed.add(obf_name)
            counts["sig_unique"] += 1

    print(f"  Pass 1 (unique signature): {counts['sig_unique']}")

    # Pass 2: data-based matching among same-signature candidates
    for clean_name in sorted(old_tables):
        if clean_name in mapping:
            continue
        sig = type_signature(old_conn, clean_name)
        candidates = [t for t in new_by_sig.get(sig, []) if t not in claimed]

        if len(candidates) == 1:
            obf_name = candidates[0]
            col_map = match_columns(old_conn, new_conn, clean_name, obf_name)
            mapping[clean_name] = {"table": obf_name, "column": col_map}
            claimed.add(obf_name)
            counts["sig_data"] += 1
        elif len(candidates) > 1:
            result = match_table_by_data(old_conn, new_conn, clean_name, candidates)
            if result:
                col_map = match_columns(old_conn, new_conn, clean_name, result)
                mapping[clean_name] = {"table": result, "column": col_map}
                claimed.add(result)
                counts["sig_data"] += 1

    print(f"  Pass 2 (signature + data): {counts['sig_data']}")

    # Pass 3: broader search — same col count ± tolerance, data matching
    for clean_name in sorted(old_tables):
        if clean_name in mapping:
            continue
        old_ncols = len(get_col_names(old_conn, clean_name))

        # Search tables with same or more columns (up to +10)
        candidates = []
        for nc in range(old_ncols, old_ncols + 11):
            candidates.extend(t for t in new_by_count.get(nc, []) if t not in claimed)

        if not candidates:
            counts["unmatched"] += 1
            continue

        result = match_table_by_data(old_conn, new_conn, clean_name, candidates)
        if result:
            col_map = match_columns(old_conn, new_conn, clean_name, result)
            mapping[clean_name] = {"table": result, "column": col_map}
            claimed.add(result)
            counts["broad_data"] += 1
        else:
            counts["ambiguous"] += 1
            ambiguous_details.append((clean_name, old_ncols, len(candidates)))

    print(f"  Pass 3 (broad data match): {counts['broad_data']}")

    old_conn.close()
    new_conn.close()

    total = counts["sig_unique"] + counts["sig_data"] + counts["broad_data"]
    print(f"\nResults:")
    print(f"  Total matched:  {total}")
    print(f"  Ambiguous:      {counts['ambiguous']}")
    print(f"  Unmatched:      {counts['unmatched']}")

    if ambiguous_details:
        print(f"\nAmbiguous tables (first 20):")
        for name, ncols, ncandidates in ambiguous_details[:20]:
            print(f"  {name} ({ncols} cols) -> {ncandidates} candidates")

    return mapping


def main():
    parser = argparse.ArgumentParser(description="Rebuild mapping.json")
    parser.add_argument("--dry-run", action="store_true", help="Don't write mapping.json")
    parser.add_argument("--old-db", help="Path to old (clean) DB (skip download)")
    parser.add_argument("--new-db", help="Path to new (obfuscated) DB (skip download)")
    args = parser.parse_args()

    old_path = args.old_db or download_db(OLD_DB_URL, "old unobfuscated DB (00180024)")
    new_path = args.new_db or download_db(NEW_DB_URL, "new obfuscated DB (current)")

    try:
        mapping = rebuild_mapping(old_path, new_path)

        if not args.dry_run:
            with open(MAPPING_FILE, "w") as f:
                json.dump(mapping, f, indent=2, ensure_ascii=False)
            print(f"\nWrote {len(mapping)} entries to {MAPPING_FILE}")
        else:
            print(f"\n[dry-run] Would write {len(mapping)} entries to {MAPPING_FILE}")
    finally:
        if not args.old_db and os.path.exists(old_path):
            os.unlink(old_path)
        if not args.new_db and os.path.exists(new_path):
            os.unlink(new_path)


if __name__ == "__main__":
    main()
