"""API tests for Inkwell. Run with: pytest"""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    tmp = Path(tempfile.mkdtemp()) / "test.db"
    os.environ["NOTES_DB"] = str(tmp)

    # Import after the env var is set so the DB path resolves correctly.
    from app.main import app

    with TestClient(app) as c:
        yield c

    os.environ.pop("NOTES_DB", None)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_seed_creates_welcome_notes(client):
    data = client.get("/api/notes").json()
    assert data["total"] == 2
    assert any("Welcome" in n["title"] for n in data["notes"])


def test_create_read_update_delete(client):
    created = client.post(
        "/api/notes",
        json={"title": "Test", "content": "# Hi", "tags": ["Alpha", "alpha", " beta "]},
    )
    assert created.status_code == 201
    note = created.json()
    assert note["title"] == "Test"
    # Tags are lower-cased and de-duplicated.
    assert note["tags"] == ["alpha", "beta"]

    got = client.get(f"/api/notes/{note['id']}").json()
    assert got["content"] == "# Hi"

    patched = client.patch(f"/api/notes/{note['id']}", json={"content": "changed"}).json()
    assert patched["content"] == "changed"
    assert patched["title"] == "Test"  # untouched fields survive

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


def test_search_and_tag_filter(client):
    client.post("/api/notes", json={"title": "Groceries", "content": "milk", "tags": ["home"]})
    client.post("/api/notes", json={"title": "Standup", "content": "notes", "tags": ["work"]})

    assert len(client.get("/api/notes?q=groceries").json()["notes"]) == 1
    assert len(client.get("/api/notes?q=milk").json()["notes"]) == 1

    work = client.get("/api/notes?tag=work").json()["notes"]
    assert len(work) == 1 and work[0]["title"] == "Standup"


def test_pin_sorts_first(client):
    a = client.post("/api/notes", json={"title": "Plain"}).json()
    b = client.post("/api/notes", json={"title": "Important"}).json()
    client.patch(f"/api/notes/{b['id']}", json={"pinned": True})

    notes = client.get("/api/notes?q=").json()["notes"]
    pinned_ids = [n["id"] for n in notes if n["pinned"]]
    assert notes[0]["id"] in pinned_ids
    assert a["id"] != notes[0]["id"] or notes[0]["pinned"]


def test_duplicate_and_export(client):
    note = client.post("/api/notes", json={"title": "Recipe", "content": "eggs"}).json()

    dup = client.post(f"/api/notes/{note['id']}/duplicate")
    assert dup.status_code == 201
    assert dup.json()["title"] == "Recipe (copy)"

    export = client.get(f"/api/notes/{note['id']}/export")
    assert export.status_code == 200
    assert "recipe.md" in export.headers["content-disposition"]
    assert export.text.startswith("# Recipe")


def test_tags_and_stats(client):
    client.post("/api/notes", json={"title": "A", "content": "one two", "tags": ["x"]})
    client.post("/api/notes", json={"title": "B", "content": "three", "tags": ["x", "y"]})

    tags = {t["tag"]: t["count"] for t in client.get("/api/tags").json()}
    assert tags["x"] == 2 and tags["y"] == 1

    stats = client.get("/api/stats").json()
    assert stats["notes"] >= 2
    assert stats["words"] > 0


def test_missing_note_404s(client):
    assert client.get("/api/notes/99999").status_code == 404
    assert client.patch("/api/notes/99999", json={"title": "x"}).status_code == 404
    assert client.delete("/api/notes/99999").status_code == 404


def test_index_page_serves(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Inkwell" in res.text
