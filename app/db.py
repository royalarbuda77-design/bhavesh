"""SQLite persistence layer for the notes app.

Uses the stdlib ``sqlite3`` module so the app has no ORM dependency.
Connections are opened per-request and closed afterwards, which keeps
things simple and safe under uvicorn's threadpool.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "notes.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL DEFAULT '',
    content    TEXT    NOT NULL DEFAULT '',
    tags       TEXT    NOT NULL DEFAULT '',
    pinned     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_pinned     ON notes (pinned DESC);
"""


def db_path() -> Path:
    """Resolve the database location (overridable with NOTES_DB env var)."""
    raw = os.environ.get("NOTES_DB")
    return Path(raw).expanduser().resolve() if raw else DEFAULT_DB_PATH


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Context manager that commits on success and always closes."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def seed_if_empty() -> None:
    """Insert a friendly welcome note the very first time the app runs."""
    with get_conn() as conn:
        (count,) = conn.execute("SELECT COUNT(*) FROM notes").fetchone()
        if count:
            return
        conn.execute(
            "INSERT INTO notes (title, content, tags, pinned) VALUES (?, ?, ?, ?)",
            (
                "Welcome to Inkwell",
                WELCOME_NOTE,
                "getting-started,markdown",
                1,
            ),
        )
        conn.execute(
            "INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)",
            (
                "Markdown cheat sheet",
                CHEATSHEET_NOTE,
                "markdown,reference",
            ),
        )


WELCOME_NOTE = """# Welcome to Inkwell

A fast little notebook for **markdown** notes. Everything you type is saved
automatically to a local SQLite database.

## What you can do

- Write in markdown and see a *live preview* as you type
- Organise notes with `tags`
- Pin the notes you keep coming back to
- Search across every title, tag and body
- Export any note as a `.md` file

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl` + `K` | Focus search |
| `Ctrl` + `N` | New note |
| `Ctrl` + `S` | Save right now |
| `Ctrl` + `P` | Toggle preview mode |

> Tip: the editor autosaves about a second after you stop typing, so you can
> keep writing without thinking about it.

Happy writing!
"""

CHEATSHEET_NOTE = """# Markdown cheat sheet

## Headings

    # H1
    ## H2
    ### H3

## Emphasis

`**bold**` renders as **bold**, `*italic*` as *italic*, and
`~~strikethrough~~` as ~~strikethrough~~.

## Lists

1. Ordered item
2. Another item

- Unordered item
- [x] A finished task
- [ ] Something still to do

## Code

Inline `code` uses backticks. Fenced blocks use three backticks:

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

## Links, quotes and rules

[Arena](https://arena.ai) is a link.

> Block quotes start with a greater-than sign.

---

## Tables

| Language | Typed | Year |
| --- | --- | --- |
| Python | dynamic | 1991 |
| Rust | static | 2010 |
"""
