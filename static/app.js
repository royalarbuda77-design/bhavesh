/* Inkwell — frontend logic */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $("app"),
    statLine: $("statLine"),
    search: $("search"),
    sort: $("sort"),
    listCount: $("listCount"),
    tagBar: $("tagBar"),
    noteList: $("noteList"),
    newNote: $("newNote"),
    emptyNew: $("emptyNew"),
    empty: $("empty"),
    editor: $("editor"),
    title: $("title"),
    content: $("content"),
    preview: $("preview"),
    panes: $("panes"),
    tagChips: $("tagChips"),
    tagInput: $("tagInput"),
    saveState: $("saveState"),
    metaLine: $("metaLine"),
    wordCount: $("wordCount"),
    pinBtn: $("pinBtn"),
    dupBtn: $("dupBtn"),
    exportBtn: $("exportBtn"),
    deleteBtn: $("deleteBtn"),
    themeBtn: $("themeBtn"),
    openSidebar: $("openSidebar"),
    closeSidebar: $("closeSidebar"),
    scrim: $("scrim"),
    toast: $("toast"),
  };

  const state = {
    notes: [],
    current: null,   // full note object being edited
    query: "",
    tag: null,
    sort: "updated",
    dirty: false,
    saving: false,
  };

  let saveTimer = null;
  let searchTimer = null;
  let toastTimer = null;

  /* ------------------------------------------------------------ helpers */

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (body && body.detail) detail = body.detail;
      } catch (_) { /* non-JSON error body */ }
      throw new Error(detail);
    }
    return res.status === 204 ? null : res.json();
  }

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle("err", !!isError);
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const needle = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!needle) return safe;
    return safe.replace(new RegExp(`(${needle})`, "gi"), "<mark>$1</mark>");
  }

  function timeAgo(iso) {
    const then = new Date(/Z$/.test(iso) ? iso : iso + "Z");
    const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
    if (secs < 45) return "just now";
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.round(secs / 86400)}d ago`;
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function fullDate(iso) {
    const d = new Date(/Z$/.test(iso) ? iso : iso + "Z");
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  function excerpt(text) {
    return text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>~|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }

  function countWords(text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return `${words} word${words === 1 ? "" : "s"} · ${text.length} chars`;
  }

  /* -------------------------------------------------------------- render */

  function renderList() {
    if (!state.notes.length) {
      el.noteList.innerHTML =
        `<div class="list-empty">${
          state.query || state.tag ? "No notes match your filters." : "No notes yet — create one!"
        }</div>`;
      el.listCount.textContent = "";
      return;
    }

    el.listCount.textContent = `${state.notes.length} shown`;
    el.noteList.innerHTML = state.notes.map((note) => {
      const active = state.current && state.current.id === note.id ? " active" : "";
      const title = note.title || "Untitled note";
      const body = excerpt(note.content) || "Empty note";
      const tags = note.tags.slice(0, 2)
        .map((t) => `<span class="chip">${esc(t)}</span>`).join("");
      const more = note.tags.length > 2 ? `<span class="chip">+${note.tags.length - 2}</span>` : "";
      return `
        <button class="note-item${active}" data-id="${note.id}">
          <h3>${note.pinned ? '<span class="pin">●</span>' : ""}<span class="t">${highlight(title, state.query)}</span></h3>
          <p>${highlight(body, state.query)}</p>
          <div class="row"><span>${timeAgo(note.updated_at)}</span>${tags}${more}</div>
        </button>`;
    }).join("");
  }

  function renderTags(tags) {
    el.tagBar.innerHTML = tags.slice(0, 18).map((t) => {
      const active = state.tag === t.tag ? " active" : "";
      return `<button class="tag-pill${active}" data-tag="${esc(t.tag)}">${esc(t.tag)}<b>${t.count}</b></button>`;
    }).join("");
  }

  function renderChips() {
    const tags = state.current ? state.current.tags : [];
    el.tagChips.innerHTML = tags.map((t, i) =>
      `<span class="chip-tag">${esc(t)}<button data-i="${i}" title="Remove tag" aria-label="Remove tag ${esc(t)}">×</button></span>`
    ).join("");
  }

  function renderPreview() {
    el.preview.innerHTML = window.Markdown.render(el.content.value) ||
      '<p style="color:var(--faint)">Nothing to preview yet.</p>';
  }

  function renderEditor() {
    const note = state.current;
    const has = !!note;
    el.empty.hidden = has;
    el.editor.hidden = !has;
    [el.pinBtn, el.dupBtn, el.exportBtn, el.deleteBtn].forEach((b) => (b.disabled = !has));
    if (!has) return;

    el.title.value = note.title;
    el.content.value = note.content;
    el.pinBtn.classList.toggle("on", note.pinned);
    el.pinBtn.title = note.pinned ? "Unpin note" : "Pin note";
    el.metaLine.textContent = `Created ${fullDate(note.created_at)} · Updated ${timeAgo(note.updated_at)}`;
    el.wordCount.textContent = countWords(note.content);
    renderChips();
    renderPreview();
  }

  function setSaveState(text, cls) {
    el.saveState.textContent = text;
    el.saveState.className = "save-state" + (cls ? " " + cls : "");
  }

  /* ---------------------------------------------------------------- data */

  async function loadNotes(keepSelection = true) {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.tag) params.set("tag", state.tag);
    params.set("sort", state.sort);

    try {
      const data = await api(`/api/notes?${params}`);
      state.notes = data.notes;

      if (keepSelection && state.current) {
        const fresh = state.notes.find((n) => n.id === state.current.id);
        if (fresh && !state.dirty) state.current = fresh;
      }
      renderList();
    } catch (err) {
      toast("Could not load notes: " + err.message, true);
    }
  }

  async function loadSidebarMeta() {
    try {
      const [tags, stats] = await Promise.all([api("/api/tags"), api("/api/stats")]);
      renderTags(tags);
      el.statLine.textContent =
        `${stats.notes} note${stats.notes === 1 ? "" : "s"} · ${stats.words.toLocaleString()} words`;
    } catch (_) { /* non-critical */ }
  }

  async function selectNote(id) {
    if (state.dirty) await saveNow();
    try {
      state.current = await api(`/api/notes/${id}`);
      state.dirty = false;
      setSaveState("");
      renderEditor();
      renderList();
      closeNav();
      el.content.scrollTop = 0;
    } catch (err) {
      toast("Could not open note: " + err.message, true);
    }
  }

  async function createNote() {
    if (state.dirty) await saveNow();
    try {
      const note = await api("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title: "", content: "", tags: state.tag ? [state.tag] : [] }),
      });
      state.current = note;
      state.dirty = false;
      setSaveState("");
      renderEditor();
      await Promise.all([loadNotes(), loadSidebarMeta()]);
      closeNav();
      el.title.focus();
    } catch (err) {
      toast("Could not create note: " + err.message, true);
    }
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    if (!state.current || !state.dirty || state.saving) return;

    state.saving = true;
    setSaveState("Saving…", "saving");
    const payload = {
      title: el.title.value,
      content: el.content.value,
      tags: state.current.tags,
      pinned: state.current.pinned,
    };

    try {
      const updated = await api(`/api/notes/${state.current.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      state.current = updated;
      state.dirty = false;
      setSaveState("Saved", "saved");
      setTimeout(() => {
        if (!state.dirty) setSaveState("");
      }, 1800);
      el.metaLine.textContent =
        `Created ${fullDate(updated.created_at)} · Updated ${timeAgo(updated.updated_at)}`;
      await Promise.all([loadNotes(), loadSidebarMeta()]);
    } catch (err) {
      setSaveState("Not saved", "");
      toast("Save failed: " + err.message, true);
    } finally {
      state.saving = false;
    }
  }

  function markDirty() {
    if (!state.current) return;
    state.dirty = true;
    setSaveState("Unsaved", "");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 900);
  }

  async function togglePin() {
    if (!state.current) return;
    const pinned = !state.current.pinned;
    try {
      state.current = await api(`/api/notes/${state.current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned }),
      });
      el.pinBtn.classList.toggle("on", pinned);
      el.pinBtn.title = pinned ? "Unpin note" : "Pin note";
      toast(pinned ? "Note pinned" : "Note unpinned");
      await Promise.all([loadNotes(), loadSidebarMeta()]);
    } catch (err) {
      toast("Could not pin: " + err.message, true);
    }
  }

  async function duplicateNote() {
    if (!state.current) return;
    if (state.dirty) await saveNow();
    try {
      state.current = await api(`/api/notes/${state.current.id}/duplicate`, { method: "POST" });
      renderEditor();
      await Promise.all([loadNotes(), loadSidebarMeta()]);
      toast("Note duplicated");
    } catch (err) {
      toast("Could not duplicate: " + err.message, true);
    }
  }

  async function deleteNote() {
    if (!state.current) return;
    const label = state.current.title || "this untitled note";
    if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;

    // Remember a neighbour so we can open it once this one is gone.
    const index = state.notes.findIndex((n) => n.id === state.current.id);
    const neighbour = state.notes[index + 1] || state.notes[index - 1] || null;

    try {
      await api(`/api/notes/${state.current.id}`, { method: "DELETE" });
      state.current = null;
      state.dirty = false;
      clearTimeout(saveTimer);
      setSaveState("");
      renderEditor();
      await Promise.all([loadNotes(false), loadSidebarMeta()]);
      toast("Note deleted");
      if (neighbour) await selectNote(neighbour.id);
    } catch (err) {
      toast("Could not delete: " + err.message, true);
    }
  }

  async function exportNote() {
    if (!state.current) return;
    if (state.dirty) await saveNow();
    window.location.href = `/api/notes/${state.current.id}/export`;
  }

  function addTag() {
    const raw = el.tagInput.value.trim().toLowerCase();
    el.tagInput.value = "";
    if (!raw || !state.current) return;
    if (state.current.tags.includes(raw)) return;
    if (state.current.tags.length >= 12) {
      toast("A note can have at most 12 tags", true);
      return;
    }
    state.current.tags = state.current.tags.concat(raw);
    renderChips();
    markDirty();
  }

  function removeTag(index) {
    if (!state.current) return;
    state.current.tags = state.current.tags.filter((_, i) => i !== index);
    renderChips();
    markDirty();
  }

  /* ------------------------------------------------------------ view/nav */

  function setMode(mode) {
    el.panes.className = "panes " + (mode === "split" ? "" : mode);
    document.querySelectorAll(".mode").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode));
    localStorage.setItem("inkwell.mode", mode);
  }

  function openNav() { el.app.classList.add("nav-open"); }
  function closeNav() { el.app.classList.remove("nav-open"); }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("inkwell.theme", theme);
  }

  /* ------------------------------------------------------------- wiring */

  el.newNote.addEventListener("click", createNote);
  el.emptyNew.addEventListener("click", createNote);
  el.pinBtn.addEventListener("click", togglePin);
  el.dupBtn.addEventListener("click", duplicateNote);
  el.exportBtn.addEventListener("click", exportNote);
  el.deleteBtn.addEventListener("click", deleteNote);

  el.themeBtn.addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  el.openSidebar.addEventListener("click", openNav);
  el.closeSidebar.addEventListener("click", closeNav);
  el.scrim.addEventListener("click", closeNav);

  el.noteList.addEventListener("click", (e) => {
    const item = e.target.closest(".note-item");
    if (item) selectNote(Number(item.dataset.id));
  });

  el.tagBar.addEventListener("click", (e) => {
    const pill = e.target.closest(".tag-pill");
    if (!pill) return;
    state.tag = state.tag === pill.dataset.tag ? null : pill.dataset.tag;
    loadSidebarMeta();
    document.querySelectorAll(".tag-pill").forEach((p) =>
      p.classList.toggle("active", p.dataset.tag === state.tag));
    loadNotes();
  });

  el.tagChips.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (btn) removeTag(Number(btn.dataset.i));
  });

  el.tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !el.tagInput.value && state.current && state.current.tags.length) {
      removeTag(state.current.tags.length - 1);
    }
  });
  el.tagInput.addEventListener("blur", addTag);

  el.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = el.search.value.trim();
      loadNotes();
    }, 180);
  });

  el.sort.addEventListener("change", () => {
    state.sort = el.sort.value;
    localStorage.setItem("inkwell.sort", state.sort);
    loadNotes();
  });

  el.title.addEventListener("input", markDirty);

  el.content.addEventListener("input", () => {
    renderPreview();
    el.wordCount.textContent = countWords(el.content.value);
    markDirty();
  });

  // Tab inserts two spaces instead of moving focus.
  el.content.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const ta = el.content;
    const { selectionStart: s, selectionEnd: en } = ta;
    ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
    ta.selectionStart = ta.selectionEnd = s + 2;
    renderPreview();
    markDirty();
  });

  document.querySelectorAll(".mode").forEach((btn) =>
    btn.addEventListener("click", () => setMode(btn.dataset.mode)));

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "k") {
      e.preventDefault();
      openNav();
      el.search.focus();
      el.search.select();
    } else if (key === "n") {
      e.preventDefault();
      createNote();
    } else if (key === "s") {
      e.preventDefault();
      saveNow();
    } else if (key === "p") {
      e.preventDefault();
      const modes = ["split", "write", "read"];
      const currentMode = localStorage.getItem("inkwell.mode") || "split";
      setMode(modes[(modes.indexOf(currentMode) + 1) % modes.length]);
    }
  });

  // Warn if the user leaves with edits still in flight.
  window.addEventListener("beforeunload", (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Save when the tab is hidden (covers mobile app-switching).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.dirty) saveNow();
  });

  /* ---------------------------------------------------------------- init */

  async function init() {
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(localStorage.getItem("inkwell.theme") || (prefersDark ? "dark" : "light"));
    setMode(localStorage.getItem("inkwell.mode") || "split");

    const savedSort = localStorage.getItem("inkwell.sort");
    if (savedSort) {
      state.sort = savedSort;
      el.sort.value = savedSort;
    }

    renderEditor();
    await Promise.all([loadNotes(false), loadSidebarMeta()]);

    if (state.notes.length) selectNote(state.notes[0].id);
  }

  init();
})();
