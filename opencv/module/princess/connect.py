import sqlite3
import os.path


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def get():
    conn = sqlite3.connect(os.path.join(os.path.dirname(
        __file__), "../../assets", "redive_tw.db"))
    conn.row_factory = dict_factory
    cur = conn.cursor()
    return cur
