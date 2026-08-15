# Inkwell

A fast markdown notes app — FastAPI + SQLite on the back, a dependency-free
single-page editor on the front.

![stack](https://img.shields.io/badge/python-3.11+-blue) ![stack](https://img.shields.io/badge/fastapi-0.111+-teal) ![stack](https://img.shields.io/badge/db-sqlite-lightgrey)

## Features

- **Live markdown preview** — split / write-only / read-only view modes
- **Autosave** — edits are persisted about a second after you stop typing
- **Full-text search** across titles, bodies and tags, with match highlighting
- **Tags** with a click-to-filter sidebar and per-tag counts
- **Pinning** so important notes stay on top
- **Duplicate** and **export to `.md`**
- **Light & dark themes**, remembered between visits
- **Keyboard shortcuts** and a responsive layout that works on mobile
- No CDN, no build step — the markdown renderer is ~200 lines of vanilla JS

## Quick start

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./run.sh
```

Then open <http://localhost:8000>. Override the port with `PORT=9000 ./run.sh`.

Interactive API docs are served at `/docs`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl` / `Cmd` + `K` | Focus search |
| `Ctrl` / `Cmd` + `N` | New note |
| `Ctrl` / `Cmd` + `S` | Save immediately |
| `Ctrl` / `Cmd` + `P` | Cycle view mode |
| `Tab` (in editor) | Insert two spaces |

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/notes` | List notes — supports `?q=`, `?tag=`, `?sort=updated\|created\|title` |
| `POST` | `/api/notes` | Create a note |
| `GET` | `/api/notes/{id}` | Fetch one note |
| `PATCH` | `/api/notes/{id}` | Partial update (only supplied fields change) |
| `DELETE` | `/api/notes/{id}` | Delete a note |
| `POST` | `/api/notes/{id}/duplicate` | Copy a note |
| `GET` | `/api/notes/{id}/export` | Download the note as `.md` |
| `GET` | `/api/tags` | Tags with usage counts |
| `GET` | `/api/stats` | Note / pin / tag / word totals |
| `GET` | `/api/health` | Health check |

Example:

```bash
curl -X POST localhost:8000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ideas","content":"# Ideas\n- ship it","tags":["work"]}'
```

## Project layout

```
app/
  main.py      FastAPI routes and static file serving
  crud.py      SQL queries
  models.py    Pydantic schemas and validation
  db.py        SQLite connection, schema and first-run seed data
static/
  index.html   App shell
  styles.css   Theming and layout
  app.js       Editor, autosave, search, tags
  markdown.js  Self-contained markdown renderer
tests/
  test_api.py  API test suite
```

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

## Notes on data

The database lives at `data/notes.db` and is created on first run, along with
two starter notes. Point somewhere else with the `NOTES_DB` environment
variable:

```bash
NOTES_DB=/tmp/scratch.db ./run.sh
```

`data/` is gitignored, so your notes stay local.

## Security

Markdown is escaped before rendering, so raw HTML in a note is displayed as
text rather than injected into the page. Link URLs are restricted to
`http`, `https`, `mailto`, and relative targets.
