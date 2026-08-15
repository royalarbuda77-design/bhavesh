"""Pydantic schemas for the notes API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

MAX_TITLE = 200
MAX_CONTENT = 200_000
MAX_TAGS = 12
MAX_TAG_LEN = 32


def _clean_tags(tags: List[str]) -> List[str]:
    """Normalise, de-duplicate and cap a list of tags."""
    seen: dict[str, None] = {}
    for tag in tags:
        slug = " ".join(str(tag).strip().lower().split())[:MAX_TAG_LEN]
        if slug:
            seen.setdefault(slug, None)
    return list(seen)[:MAX_TAGS]


class NoteBase(BaseModel):
    title: str = Field(default="", max_length=MAX_TITLE)
    content: str = Field(default="", max_length=MAX_CONTENT)
    tags: List[str] = Field(default_factory=list)
    pinned: bool = False

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def normalise_tags(cls, value: List[str]) -> List[str]:
        return _clean_tags(value)


class NoteCreate(NoteBase):
    """Payload for creating a note. Every field is optional."""


class NoteUpdate(BaseModel):
    """Partial update — only the provided fields are written."""

    title: Optional[str] = Field(default=None, max_length=MAX_TITLE)
    content: Optional[str] = Field(default=None, max_length=MAX_CONTENT)
    tags: Optional[List[str]] = None
    pinned: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None

    @field_validator("tags")
    @classmethod
    def normalise_tags(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _clean_tags(value) if value is not None else None


class Note(NoteBase):
    id: int
    created_at: str
    updated_at: str


class NoteList(BaseModel):
    notes: List[Note]
    total: int


class TagCount(BaseModel):
    tag: str
    count: int


class Stats(BaseModel):
    notes: int
    pinned: int
    tags: int
    words: int
