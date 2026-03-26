"""Deobfuscate TW Redive master DB using a static mapping file.

The downloaded DB has obfuscated table and column names (v1_<hash> format).
TW hashes are stable across versions, so we maintain a one-time mapping
in mapping.json (clean_name -> {table: v1_hash, column: {clean: hash}}).

For each mapped table:
1. Create a new table with clean name and column names
2. Copy all data from the obfuscated table
3. Drop the obfuscated table

Unmapped v1_ tables are kept as-is (new tables added by game updates).
Run with --report to see unmapped tables for manual naming.
"""
import json
import os
import sqlite3
import sys


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAPPING_FILE = os.path.join(SCRIPT_DIR, "mapping.json")


def load_mapping():
    """Load the static mapping file."""
    with open(MAPPING_FILE) as f:
        return json.load(f)


def deobfuscate(db_path):
    """Translate obfuscated tables to clean names using mapping.json."""
    mapping = load_mapping()
    conn = sqlite3.connect(db_path)

    # Drop any pre-existing views (from previous runs)
    views = conn.execute("SELECT name FROM sqlite_master WHERE type='view'").fetchall()
    for (name,) in views:
        conn.execute(f'DROP VIEW IF EXISTS "{name}"')

    # Get existing obfuscated tables
    obf_tables = set(
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'v1_%'"
        ).fetchall()
    )

    translated = 0
    skipped = 0
    errors = 0
    translated_obf = set()

    for clean_name, info in mapping.items():
        obf_table = info["table"]
        col_map = info["column"]  # {clean_col: obf_col}

        if obf_table not in obf_tables:
            skipped += 1
            continue

        try:
            _translate_table(conn, clean_name, obf_table, col_map)
            translated_obf.add(obf_table)
            translated += 1
        except Exception as e:
            print(f"ERROR {clean_name}: {e}")
            errors += 1

    # Keep unmapped v1_ tables as-is for future manual naming
    unmapped = obf_tables - translated_obf
    kept = len(unmapped)

    conn.commit()
    conn.execute("VACUUM")
    conn.close()

    # Summary
    print(f"Translated: {translated}, Skipped: {skipped}, Errors: {errors}, Kept unmapped: {kept}")
    print("Deobfuscation complete!")


def _translate_table(conn, clean_name, obf_table, col_map):
    """Create a clean-named table from an obfuscated one, then drop the original."""
    obf_col_info = conn.execute(f'PRAGMA table_info("{obf_table}")').fetchall()
    obf_col_names = [c[1] for c in obf_col_info]

    # Build reverse lookup: obf_col -> clean_col
    reverse_map = {v: k for k, v in col_map.items()}

    # Map each obf column to a clean name (use obf name if not in mapping)
    clean_col_names = []
    for obf_col in obf_col_names:
        clean_col_names.append(reverse_map.get(obf_col, obf_col))

    # Build column definitions preserving types and constraints
    pk_cols = [clean_col_names[c[0]] for c in obf_col_info if c[5]]

    col_defs = []
    for i, col_info in enumerate(obf_col_info):
        col_type = col_info[2] or ""
        notnull = " NOT NULL" if col_info[3] else ""
        default = f" DEFAULT {col_info[4]}" if col_info[4] is not None else ""
        pk = " PRIMARY KEY" if col_info[5] and len(pk_cols) == 1 else ""
        col_defs.append(f'"{clean_col_names[i]}" {col_type}{notnull}{default}{pk}')

    if len(pk_cols) > 1:
        pk_list = ", ".join(f'"{c}"' for c in pk_cols)
        col_defs.append(f"PRIMARY KEY ({pk_list})")

    # Drop existing clean table/view, create new, copy data, drop old
    conn.execute(f'DROP VIEW IF EXISTS "{clean_name}"')
    conn.execute(f'DROP TABLE IF EXISTS "{clean_name}"')
    conn.execute(f'CREATE TABLE "{clean_name}" ({", ".join(col_defs)})')

    obf_select = ", ".join(f'"{c}"' for c in obf_col_names)
    conn.execute(f'INSERT INTO "{clean_name}" SELECT {obf_select} FROM "{obf_table}"')

    # Recreate indexes with clean names
    indexes = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
        (obf_table,),
    ).fetchall()
    for (idx_sql,) in indexes:
        new_sql = idx_sql.replace(f'"{obf_table}"', f'"{clean_name}"')
        for obf_col, clean_col in reverse_map.items():
            new_sql = new_sql.replace(f'"{obf_col}"', f'"{clean_col}"')
        new_sql = new_sql.replace("v1_", "idx_", 1)
        try:
            conn.execute(new_sql)
        except Exception:
            pass

    conn.execute(f'DROP TABLE "{obf_table}"')


def report(db_path):
    """Report unmapped v1_ tables in the DB for manual naming."""
    mapping = load_mapping()
    conn = sqlite3.connect(db_path)

    mapped_obf = set(v["table"] for v in mapping.values())
    obf_tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'v1_%'"
        ).fetchall()
    ]

    unmapped = [t for t in obf_tables if t not in mapped_obf]
    if not unmapped:
        print("All v1_ tables are mapped!")
        return

    print(f"Unmapped v1_ tables: {len(unmapped)}\n")
    for table in sorted(unmapped):
        cols = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
        rc = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        row = conn.execute(f'SELECT * FROM "{table}" ORDER BY rowid LIMIT 1').fetchone()
        first_val = repr(row[0])[:40] if row else "empty"
        print(f"  {table}")
        print(f"    cols={len(cols)}, rows={rc}, first_val={first_val}")

    conn.close()


if __name__ == "__main__":
    import config

    if "--report" in sys.argv:
        report(config.OUTPUT_DB)
    else:
        deobfuscate(config.OUTPUT_DB)
