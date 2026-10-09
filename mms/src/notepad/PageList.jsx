import React from "react";
import { ChevronLeft, Pin, Search, X } from "lucide-react";
import NoteImage from "./NoteImage.jsx";
import { blockPlain, colorOf, fmtDate } from "./utils.js";

export default function PageList({
  title,
  notes,
  hasAny,
  activeId,
  query,
  setQuery,
  searchRef,
  sort,
  setSort,
  onOpen,
  onNew,
  onUp,
}) {
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  const row = (n) => {
    const first = n.blocks.find((b) => blockPlain(b));
    const cover = (n.images || [])[0];

    return (
      <button
        key={n.id}
        type="button"
        className="np-row"
        aria-current={n.id === activeId}
        style={{ "--row-c": colorOf(n.color) }}
        onClick={() => onOpen(n.id)}
      >
        {cover && <NoteImage img={cover} className="np-row-thumb" alt={n.title || "Note cover"} />}

        <div className="np-row-main">
          <div className="np-row-meta">
            <span>{n.section}</span>
            <span>·</span>
            <span>{fmtDate(n.updatedAt)}</span>
            {n.pinned && <Pin size={12} />}
          </div>

          <div className="np-row-title">{n.title || "Untitled"}</div>
          <div className="np-row-snip">{first ? first.text : "No content"}</div>
        </div>
      </button>
    );
  };

  return (
    <section className="np-pane np-pane--list">
      <div className="np-pane-head">
        <div className="np-head-row">
          <button type="button" className="np-icon-btn" aria-label="Go back" onClick={onUp}>
            <ChevronLeft size={18} />
          </button>
          <div className="np-head-title">{title}</div>
          <button type="button" className="np-btn np-btn--primary" onClick={onNew}>New</button>
        </div>

        <div className="np-head-row">
          <div className="np-search" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search  ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search notes"
            />
            {query && (
              <button type="button" className="np-icon-btn sm np-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </div>

          <select className="np-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort notes">
            <option value="updated">Recently edited</option>
            <option value="created">Newest first</option>
            <option value="title">A to Z</option>
          </select>
        </div>

        <div className="np-head-sub" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
        </div>
      </div>

      <div className="np-scroll">
        {!hasAny ? (
          <div className="np-empty">
            <h3>Your notebook is empty</h3>
            <p>Capture a strategy, a rule you keep breaking, or an idea before it slips away.</p>
            <button type="button" className="np-btn np-btn--primary" onClick={onNew}>Create a note</button>
          </div>
        ) : notes.length === 0 ? (
          <div className="np-empty">
            <h3>Nothing found</h3>
            <p>{query ? "No notes match your search." : "This section has no notes yet."}</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && <div className="np-group">Pinned</div>}
            {pinned.map(row)}

            {pinned.length > 0 && others.length > 0 && <div className="np-group">Notes</div>}
            {others.map(row)}
          </>
        )}
      </div>
    </section>
  );
}
