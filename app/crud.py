"""Database queries backing the notes API."""

from __future__ import annotations

import sqlite3
from typing import List, Optional, Tuple

from .db import get_conn
from .models import Note, NoteCreate, NoteUpdate, Stats, TagCount

NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

SORTS = {
    "updated": "pinned DESC, updated_at DESC",
    "created": "pinned DESC, created_at DESC",
    "title": "pinned DESC, (title = '') ASC, LOWER(title) ASC",
}


def _row_to_note(row: sqlite3.Row) -> Note:
    raw_tags = row["tags"] or ""
    return Note(
        id=row["id"],
        title=row["title"],
        content=row["content"],
        tags=[t for t in raw_tags.split(",") if t],
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_notes(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    sort: str = "updated",
) -> Tuple[List[Note], int]:
    where: List[str] = []
    params: List[object] = []

    if q:
        needle = f"%{q.strip().lower()}%"
        where.append("(LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?)")
        params += [needle, needle, needle]

    if tag:
        # Match a whole tag inside the comma-separated list.
        where.append("(',' || tags || ',') LIKE ?")
        params.append(f"%,{tag.strip().lower()},%")

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    order = SORTS.get(sort, SORTS["updated"])

    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM notes {clause} ORDER BY {order}", params
        ).fetchall()
        (total,) = conn.execute("SELECT COUNT(*) FROM notes").fetchone()

    return [_row_to_note(r) for r in rows], total


def get_note(note_id: int) -> Optional[Note]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return _row_to_note(row) if row else None


def create_note(payload: NoteCreate) -> Note:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO notes (title, content, tags, pinned) VALUES (?, ?, ?, ?)",
            (
                payload.title,
                payload.content,
                ",".join(payload.tags),
                int(payload.pinned),
            ),
        )
        row = conn.execute(
            "SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return _row_to_note(row)


def update_note(note_id: int, payload: NoteUpdate) -> Optional[Note]:
    fields: List[str] = []
    params: List[object] = []

    if payload.title is not None:
        fields.append("title = ?")
        params.append(payload.title)
    if payload.content is not None:
        fields.append("content = ?")
        params.append(payload.content)
    if payload.tags is not None:
        fields.append("tags = ?")
        params.append(",".join(payload.tags))
    if payload.pinned is not None:
        fields.append("pinned = ?")
        params.append(int(payload.pinned))

    with get_conn() as conn:
        exists = conn.execute(
            "SELECT 1 FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
        if not exists:
            return None

        if fields:
            fields.append(f"updated_at = {NOW}")
            params.append(note_id)
            conn.execute(
                f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", params
            )

        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()

    return _row_to_note(row)


def delete_note(note_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    return cur.rowcount > 0


def duplicate_note(note_id: int) -> Optional[Note]:
    original = get_note(note_id)
    if original is None:
        return None
    copy = NoteCreate(
        title=f"{original.title} (copy)".strip(),
        content=original.content,
        tags=original.tags,
        pinned=False,
    )
    return create_note(copy)


def list_tags() -> List[TagCount]:
    counts: dict[str, int] = {}
    with get_conn() as conn:
        for (raw,) in conn.execute("SELECT tags FROM notes WHERE tags != ''"):
            for tag in (raw or "").split(","):
                if tag:
                    counts[tag] = counts.get(tag, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [TagCount(tag=t, count=c) for t, c in ordered]


def stats() -> Stats:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(pinned), 0) AS p FROM notes"
        ).fetchone()
        words = 0
        for (content,) in conn.execute("SELECT content FROM notes"):
            words += len((content or "").split())
    return Stats(notes=row["n"], pinned=row["p"], tags=len(list_tags()), words=words)
