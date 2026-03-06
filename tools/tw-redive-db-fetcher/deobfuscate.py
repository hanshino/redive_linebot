"""Deobfuscate TW Redive master DB by creating views with original table/column names.

The DB has obfuscated table and column names (v1_<hash> format).
This script identifies tables by data patterns and creates SQL VIEWs
so existing code can query using original names like unit_profile, unit_data, etc.
"""
import sqlite3


# Known first unit: 日和 (unit_id=100101)
KNOWN_UNIT_ID = 100101
KNOWN_UNIT_NAME = "日和"


def find_tables_with_value(conn, value):
    """Find all tables that contain a specific value in any column."""
    results = []
    tables = conn.execute(
        'SELECT name FROM sqlite_master WHERE type="table"'
    ).fetchall()
    for (table_name,) in tables:
        cols = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
        for col in cols:
            col_name = col[1]
            try:
                row = conn.execute(
                    f'SELECT * FROM "{table_name}" WHERE "{col_name}" = ? LIMIT 1',
                    (value,),
                ).fetchone()
                if row:
                    results.append((table_name, col_name, cols))
                    break
            except Exception:
                continue
    return results


def identify_unit_profile(conn, candidates):
    """unit_profile: has unit_id (100101) and unit_name ('日和') as short text, ~16 cols."""
    for table_name, uid_col, cols in candidates:
        if len(cols) < 10 or len(cols) > 20:
            continue
        row = conn.execute(
            f'SELECT * FROM "{table_name}" WHERE "{uid_col}" = ? LIMIT 1',
            (KNOWN_UNIT_ID,),
        ).fetchone()
        if not row:
            continue
        col_names = [c[1] for c in cols]
        uid_idx = col_names.index(uid_col)
        # Find column with unit_name
        name_idx = None
        for i, val in enumerate(row):
            if val == KNOWN_UNIT_NAME and i != uid_idx:
                name_idx = i
                break
        if name_idx is None:
            continue
        # unit_profile should have text columns (voice, guild, race, etc.)
        text_count = sum(1 for v in row if isinstance(v, str))
        if text_count >= 8:
            return table_name, {
                "unit_id": col_names[uid_idx],
                "unit_name": col_names[name_idx],
            }
    return None, None


def identify_unit_data(conn, candidates):
    """unit_data: has unit_id, unit_name, and description text, ~25 cols."""
    for table_name, uid_col, cols in candidates:
        if len(cols) < 20 or len(cols) > 30:
            continue
        row = conn.execute(
            f'SELECT * FROM "{table_name}" WHERE "{uid_col}" = ? LIMIT 1',
            (KNOWN_UNIT_ID,),
        ).fetchone()
        if not row:
            continue
        col_names = [c[1] for c in cols]
        uid_idx = col_names.index(uid_col)
        # Find unit_name column
        name_idx = None
        for i, val in enumerate(row):
            if val == KNOWN_UNIT_NAME and i != uid_idx:
                name_idx = i
                break
        if name_idx is None:
            continue
        # unit_data should have a description column (long text with 【物理】or 【魔法】)
        has_desc = any(
            isinstance(v, str) and ("【物理】" in v or "【魔法】" in v)
            for v in row
        )
        if has_desc:
            return table_name, {
                "unit_id": col_names[uid_idx],
                "unit_name": col_names[name_idx],
            }
    return None, None


def identify_unit_rarity(conn, candidates):
    """unit_rarity: has unit_id, rarity (1-6), many float growth columns, ~39 cols."""
    for table_name, uid_col, cols in candidates:
        if len(cols) < 30:
            continue
        rows = conn.execute(
            f'SELECT * FROM "{table_name}" WHERE "{uid_col}" = ? ORDER BY rowid LIMIT 6',
            (KNOWN_UNIT_ID,),
        ).fetchall()
        if len(rows) < 3:
            continue
        col_names = [c[1] for c in cols]
        uid_idx = col_names.index(uid_col)
        # Find rarity column: sequential integers 1,2,3... across rows for same unit_id
        rarity_idx = None
        for i in range(len(col_names)):
            if i == uid_idx:
                continue
            vals = [r[i] for r in rows[:3]]
            if vals == [1, 2, 3]:
                rarity_idx = i
                break
        if rarity_idx is None:
            continue
        # Verify: many float columns (growth stats)
        float_count = sum(1 for v in rows[0] if isinstance(v, float))
        if float_count >= 15:
            return table_name, {
                "unit_id": col_names[uid_idx],
                "rarity": col_names[rarity_idx],
            }
    return None, None


def create_views(conn, mappings):
    """Create SQL VIEWs for each identified table."""
    for view_name, (table_name, col_map) in mappings.items():
        if table_name is None:
            print(f"WARNING: Could not identify {view_name}")
            continue
        # Drop existing view
        conn.execute(f'DROP VIEW IF EXISTS "{view_name}"')
        # Build column aliases
        aliases = ", ".join(
            f'"{obf_col}" AS "{orig_col}"'
            for orig_col, obf_col in col_map.items()
        )
        # Also include all other columns with their original (obfuscated) names
        all_cols = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
        mapped_obf = set(col_map.values())
        for col in all_cols:
            if col[1] not in mapped_obf:
                aliases += f', "{col[1]}"'
        sql = f'CREATE VIEW "{view_name}" AS SELECT {aliases} FROM "{table_name}"'
        conn.execute(sql)
        print(f"Created view: {view_name} -> {table_name[:50]}... ({len(col_map)} named columns)")


def deobfuscate(db_path):
    """Main deobfuscation entry point."""
    conn = sqlite3.connect(db_path)

    print("Searching for tables containing known unit data...")
    candidates = find_tables_with_value(conn, KNOWN_UNIT_ID)
    print(f"Found {len(candidates)} tables with unit_id {KNOWN_UNIT_ID}")

    print("Identifying tables...")
    profile_table, profile_cols = identify_unit_profile(conn, candidates)
    data_table, data_cols = identify_unit_data(conn, candidates)
    rarity_table, rarity_cols = identify_unit_rarity(conn, candidates)

    mappings = {
        "unit_profile": (profile_table, profile_cols or {}),
        "unit_data": (data_table, data_cols or {}),
        "unit_rarity": (rarity_table, rarity_cols or {}),
    }

    print("Creating views...")
    create_views(conn, mappings)
    conn.commit()
    conn.close()
    print("Deobfuscation complete!")


if __name__ == "__main__":
    import config
    deobfuscate(config.OUTPUT_DB)
