import React, { useState } from "react";
import { BookOpen, Folder, FolderPlus, Pencil, Trash2, Sun, Moon, ChevronLeft, NotebookPen } from "lucide-react";

export default function Sidebar({
  sections,
  counts,
  total,
  active,
  onSelect,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onNew,
  theme,
  onToggleTheme,
  onExit,
  syncLabel,
}) {
  const [renaming, setRenaming] = useState(null); // { from, value }
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const commitRename = () => {
    if (!renaming) return;
    const r = renaming;
    setRenaming(null);
    onRenameSection(r.from, r.value);
  };

  const submitAdd = () => {
    const next = name.trim();
    if (next) onAddSection(next);
    setName("");
    setAdding(false);
  };

  const row = (value, label, count, editable) => (
    <div className="np-nav-row" key={value}>
      {renaming && renaming.from === value ? (
        <input
          className="np-nav-input"
          autoFocus
          maxLength={24}
          value={renaming.value}
          onChange={(e) => setRenaming({ from: value, value: e.target.value })}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      ) : (
        <>
          <button type="button" className="np-nav-item" aria-current={active === value} onClick={() => onSelect(value)}>
            {value === "All" ? <BookOpen size={16} /> : <Folder size={16} />}
            <span className="nm">{label}</span>
            <span className="ct">{count}</span>
          </button>

          {editable && (
            <div className="np-nav-actions">
              <button
                type="button"
                className="np-icon-btn sm"
                aria-label={"Rename " + label}
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming({ from: value, value: label });
                }}
              >
                <Pencil size={14} />
              </button>

              {value !== "General" && (
                <button
                  type="button"
                  className="np-icon-btn sm"
                  aria-label={"Delete " + label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSection(value);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <aside className="np-pane np-pane--sections">
      <div className="np-pane-head">
        <div className="np-head-row">
          <div className="np-head-title">Notepad</div>
          <button type="button" className="np-icon-btn" aria-label="New note" onClick={onNew}>
            <NotebookPen size={18} />
          </button>
        </div>
        <div className="np-head-sub">Your notes</div>
      </div>

      <nav className="np-nav np-scroll">
        {row("All", "All notes", total, false)}
        {sections.map((s) => row(s, s, counts[s] || 0, true))}

        {adding ? (
          <input
            className="np-nav-input"
            autoFocus
            maxLength={24}
            placeholder="Section name, then Enter"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitAdd}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
          />
        ) : (
          <button type="button" className="np-nav-item" onClick={() => setAdding(true)}>
            <FolderPlus size={16} />
            <span className="nm">New section</span>
          </button>
        )}
      </nav>

      <div className="np-side-foot">
        <span className="np-sync">{syncLabel}</span>
        <div className="np-head-row">
          <button type="button" className="np-btn" onClick={onExit}>
            <ChevronLeft size={16} /> Session
          </button>
          <button type="button" className="np-icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
