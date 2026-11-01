# -*- coding: utf-8 -*-
"""SQLite 历史记录存储。"""
import json
import os
import sqlite3
import threading

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_BACKEND_DIR, "data", "divination.db")

_lock = threading.Lock()


def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _lock, _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                method TEXT NOT NULL,
                question TEXT,
                category TEXT,
                hexagram_name TEXT,
                verdict TEXT,
                score INTEGER,
                payload TEXT NOT NULL,
                llm_text TEXT
            )""")


def save_record(plate):
    """保存一卦，返回记录 id"""
    import datetime as _dt
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    interp = plate.get("interpretation", {})
    with _lock, _conn() as conn:
        cur = conn.execute(
            "INSERT INTO records (created_at, method, question, category,"
            " hexagram_name, verdict, score, payload) VALUES (?,?,?,?,?,?,?,?)",
            (now, plate["method"], plate.get("question", ""),
             plate.get("category", ""), plate["ben"]["full_name"],
             interp.get("verdict", ""), interp.get("score", None),
             json.dumps(plate, ensure_ascii=False)))
        return cur.lastrowid


def list_records(limit=50, offset=0):
    with _lock, _conn() as conn:
        rows = conn.execute(
            "SELECT id, created_at, method, question, category, hexagram_name,"
            " verdict, score, (llm_text IS NOT NULL AND llm_text != '') AS has_llm"
            " FROM records ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset)).fetchall()
        return [dict(r) for r in rows]


def get_record(rid):
    with _lock, _conn() as conn:
        row = conn.execute("SELECT * FROM records WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["payload"] = json.loads(d["payload"])
        return d


def delete_record(rid):
    with _lock, _conn() as conn:
        cur = conn.execute("DELETE FROM records WHERE id = ?", (rid,))
        return cur.rowcount > 0


def update_llm_text(rid, text):
    with _lock, _conn() as conn:
        conn.execute("UPDATE records SET llm_text = ? WHERE id = ?", (text, rid))
