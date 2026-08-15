"""Inkwell — a markdown notes app built with FastAPI + SQLite."""

from __future__ import annotations

import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import crud
from .db import init_db, seed_if_empty
from .models import Note, NoteCreate, NoteList, NoteUpdate, Stats, TagCount

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_if_empty()
    yield


app = FastAPI(
    title="Inkwell",
    description="A fast markdown notes app backed by SQLite.",
    version="1.0.0",
    lifespan=lifespan,
)


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/notes", response_model=NoteList)
def api_list_notes(
    q: Optional[str] = Query(default=None, max_length=200),
    tag: Optional[str] = Query(default=None, max_length=32),
    sort: str = Query(default="updated", pattern="^(updated|created|title)$"),
) -> NoteList:
    notes, total = crud.list_notes(q=q, tag=tag, sort=sort)
    return NoteList(notes=notes, total=total)


@app.post("/api/notes", response_model=Note, status_code=201)
def api_create_note(payload: NoteCreate) -> Note:
    return crud.create_note(payload)


@app.get("/api/notes/{note_id}", response_model=Note)
def api_get_note(note_id: int) -> Note:
    note = crud.get_note(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.patch("/api/notes/{note_id}", response_model=Note)
def api_update_note(note_id: int, payload: NoteUpdate) -> Note:
    note = crud.update_note(note_id, payload)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def api_delete_note(note_id: int) -> Response:
    if not crud.delete_note(note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    return Response(status_code=204)


@app.post("/api/notes/{note_id}/duplicate", response_model=Note, status_code=201)
def api_duplicate_note(note_id: int) -> Note:
    note = crud.duplicate_note(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.get("/api/notes/{note_id}/export", response_class=PlainTextResponse)
def api_export_note(note_id: int) -> Response:
    note = crud.get_note(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    slug = re.sub(r"[^a-z0-9]+", "-", (note.title or "untitled").lower()).strip("-")
    filename = f"{slug or 'untitled'}.md"
    body = note.content
    if note.title and not body.lstrip().startswith("#"):
        body = f"# {note.title}\n\n{body}"

    return PlainTextResponse(
        body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/tags", response_model=list[TagCount])
def api_tags() -> list[TagCount]:
    return crud.list_tags()


@app.get("/api/stats", response_model=Stats)
def api_stats() -> Stats:
    return crud.stats()


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<rect width="32" height="32" rx="7" fill="#6366f1"/>'
        '<path d="M9 22V10h5.5a3.5 3.5 0 010 7H9" stroke="#fff" '
        'stroke-width="2.4" fill="none" stroke-linecap="round"/>'
        "</svg>"
    )
    return Response(content=svg, media_type="image/svg+xml")
