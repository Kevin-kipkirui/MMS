import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";

/**
 * <Notepad />
 * A OneNote-style notebook for strategies, rules, ideas and things to remember.
 * Sections -> notes -> block editor (text, headings, bullets, numbered, checklist, quote, callout, divider).
 * Same blue-glass / obsidian-gold theme system as <Session />.
 *
 * Storage: localStorage for now (key "td_notes", "td_note_sections").
 * Supabase later: pass `onSaveNote(note)` and `onDeleteNote(id)` props, or swap
 * the persist() / remove() helpers below for sync calls.
 */

// ---------- utilities ----------
function readLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function writeLS(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* ignore quota / privacy-mode errors */
  }
}
function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));
  useEffect(() => {
    writeLS(key, state);
  }, [key, state]);
  return [state, setState];
}
const uid = (p = "n") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_SECTIONS = ["Strategies", "Rules", "Psychology", "Ideas", "General"];

const COLORS = [
  { k: "none", v: "transparent", l: "None" },
  { k: "gold", v: "#e8c97a", l: "Gold" },
  { k: "teal", v: "#34e0a1", l: "Green" },
  { k: "rose", v: "#ff6b7d", l: "Red" },
  { k: "blue", v: "#6fa3ff", l: "Blue" },
  { k: "violet", v: "#b394ff", l: "Violet" },
];
const colorOf = (k) => (COLORS.find((c) => c.k === k) || COLORS[0]).v;

const newBlock = (type = "text", text = "") => ({ id: uid("b"), type, text, checked: false });

const BLOCK_TOOLS = [
  { type: "h", label: "Heading", icon: "H" },
  { type: "text", label: "Text", icon: "¶" },
  { type: "bullet", label: "Bullets", icon: "•" },
  { type: "number", label: "Numbered", icon: "1." },
  { type: "check", label: "Checklist", icon: "☑" },
  { type: "quote", label: "Quote", icon: "❝" },
  { type: "callout", label: "Callout", icon: "💡" },
  { type: "divider", label: "Divider", icon: "—" },
];

const PLACEHOLDER = {
  text: "Write something…",
  h: "Heading",
  bullet: "List item",
  number: "List item",
  check: "To-do",
  quote: "Quote",
  callout: "Key point to remember",
};

function blockPlain(b) {
  if (b.type === "divider") return "";
  return (b.text || "").trim();
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

// ---------- block row ----------
function BlockRow({ block, index, numberLabel, registerRef, onChange, onKeyDown, onFocus, onToggle, onRemoveDivider, active }) {
  const taRef = useRef(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [block.text, block.type]);

  useEffect(() => {
    registerRef(block.id, taRef.current);
    return () => registerRef(block.id, null);
  }, [block.id, block.type, registerRef]);

  if (block.type === "divider") {
    return (
      <div className={`np-block np-divider${active ? " active" : ""}`} onClick={() => onFocus(block.id)}>
        <hr />
        <button type="button" className="np-divider-x" aria-label="Remove divider" onClick={() => onRemoveDivider(block.id)}>
          &times;
        </button>
      </div>
    );
  }

  return (
    <div className={`np-block np-${block.type}${block.checked ? " checked" : ""}${active ? " active" : ""}`}>
      {block.type === "bullet" && <span className="np-mark">•</span>}
      {block.type === "number" && <span className="np-mark np-num">{numberLabel}.</span>}
      {block.type === "check" && (
        <button
          type="button"
          className={`np-box${block.checked ? " on" : ""}`}
          role="checkbox"
          aria-checked={block.checked}
          onClick={() => onToggle(block.id)}
        >
          {block.checked ? "✓" : ""}
        </button>
      )}
      {block.type === "callout" && <span className="np-callout-ico">💡</span>}
      <textarea
        ref={taRef}
        rows={1}
        value={block.text}
        placeholder={PLACEHOLDER[block.type]}
        onChange={(e) => onChange(block.id, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, block.id, index)}
        onFocus={() => onFocus(block.id)}
        spellCheck
      />
    </div>
  );
}

// ---------- editor ----------
function NoteEditor({ draft, setDraft, sections, isNew, onSave, onCancel, onDelete, dirty }) {
  const refs = useRef({});
  const [activeId, setActiveId] = useState(draft.blocks[0] ? draft.blocks[0].id : null);
  const [focusReq, setFocusReq] = useState(null); // { id, end }
  const [tagInput, setTagInput] = useState("");

  const registerRef = useCallback((id, el) => {
    if (el) refs.current[id] = el;
    else delete refs.current[id];
  }, []);

  // focus requested block after render
  useEffect(() => {
    if (!focusReq) return;
    const el = refs.current[focusReq.id];
    if (el) {
      el.focus();
      const pos = focusReq.end ? el.value.length : 0;
      try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }
    setFocusReq(null);
  }, [focusReq, draft.blocks]);

  // first open: focus the title for new notes
  const titleRef = useRef(null);
  useEffect(() => {
    if (isNew && titleRef.current) titleRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBlocks = (fn) => setDraft((d) => ({ ...d, blocks: fn(d.blocks) }));

  const changeText = (id, text) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, text } : b)));

  const toggleCheck = (id) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b)));

  const removeBlock = (id) =>
    setBlocks((bs) => {
      const next = bs.filter((b) => b.id !== id);
      return next.length ? next : [newBlock("text")];
    });

  const handleKeyDown = (e, id, index) => {
    const blocks = draft.blocks;
    const b = blocks[index];
    if (!b) return;
    const el = e.currentTarget;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const listy = b.type === "bullet" || b.type === "number" || b.type === "check";
      if (listy && !b.text.trim()) {
        // empty list item -> exit the list
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, type: "text", checked: false } : x)));
        setFocusReq({ id, end: true });
        return;
      }
      // split text at the caret
      const caret = el.selectionStart;
      const before = b.text.slice(0, caret);
      const after = b.text.slice(caret);
      const nextType = listy ? b.type : "text";
      const nb = newBlock(nextType, after);
      setBlocks((bs) => {
        const out = [];
        bs.forEach((x) => {
          if (x.id === id) {
            out.push({ ...x, text: before });
            out.push(nb);
          } else out.push(x);
        });
        return out;
      });
      setFocusReq({ id: nb.id, end: false });
      return;
    }

    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== "text") {
        e.preventDefault();
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, type: "text", checked: false } : x)));
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const prev = blocks[index - 1];
        if (prev.type === "divider") {
          removeBlock(prev.id);
          return;
        }
        const joined = prev.text + b.text;
        const prevLen = prev.text.length;
        setBlocks((bs) =>
          bs
            .filter((x) => x.id !== id)
            .map((x) => (x.id === prev.id ? { ...x, text: joined } : x))
        );
        setFocusReq({ id: prev.id, end: true });
        // place caret at the join point
        setTimeout(() => {
          const pel = refs.current[prev.id];
          if (pel) try { pel.setSelectionRange(prevLen, prevLen); } catch (er) { /* ignore */ }
        }, 0);
      }
      return;
    }

    if (e.key === "ArrowUp" && el.selectionStart === 0 && index > 0) {
      const prev = blocks[index - 1];
      if (prev.type !== "divider") {
        e.preventDefault();
        setFocusReq({ id: prev.id, end: true });
      }
    }
    if (e.key === "ArrowDown" && el.selectionEnd === el.value.length && index < blocks.length - 1) {
      const nxt = blocks[index + 1];
      if (nxt.type !== "divider") {
        e.preventDefault();
        setFocusReq({ id: nxt.id, end: false });
      }
    }
  };

  const applyTool = (type) => {
    const blocks = draft.blocks;
    const idx = Math.max(0, blocks.findIndex((b) => b.id === activeId));
    const cur = blocks[idx];
    if (type === "divider") {
      const div = newBlock("divider");
      const after = newBlock("text");
      setBlocks((bs) => {
        const out = bs.slice();
        // if current block is an empty text block, replace it with the divider
        if (cur && cur.type === "text" && !cur.text.trim()) out.splice(idx, 1, div, after);
        else out.splice(idx + 1, 0, div, after);
        return out;
      });
      setActiveId(after.id);
      setFocusReq({ id: after.id, end: false });
      return;
    }
    if (!cur || cur.type === "divider") {
      const nb = newBlock(type);
      setBlocks((bs) => {
        const out = bs.slice();
        out.splice(idx + 1, 0, nb);
        return out;
      });
      setActiveId(nb.id);
      setFocusReq({ id: nb.id, end: false });
      return;
    }
    // toggle back to text if the same type is tapped again
    const target = cur.type === type ? "text" : type;
    setBlocks((bs) => bs.map((b) => (b.id === cur.id ? { ...b, type: target, checked: target === "check" ? b.checked : false } : b)));
    setFocusReq({ id: cur.id, end: true });
  };

  const addBlockAtEnd = () => {
    const last = draft.blocks[draft.blocks.length - 1];
    if (last && last.type === "text" && !last.text.trim()) {
      setFocusReq({ id: last.id, end: true });
      return;
    }
    const nb = newBlock("text");
    setBlocks((bs) => [...bs, nb]);
    setFocusReq({ id: nb.id, end: false });
  };

  // numbering for consecutive numbered blocks
  const numbers = useMemo(() => {
    const out = {};
    let n = 0;
    draft.blocks.forEach((b) => {
      if (b.type === "number") {
        n += 1;
        out[b.id] = n;
      } else n = 0;
    });
    return out;
  }, [draft.blocks]);

  const activeType = (draft.blocks.find((b) => b.id === activeId) || {}).type;

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").slice(0, 20);
    if (!t) return;
    setDraft((d) => (d.tags.includes(t) ? d : { ...d, tags: [...d.tags, t] }));
    setTagInput("");
  };
  const removeTag = (t) => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }));

  const words = useMemo(() => {
    const text = draft.blocks.map(blockPlain).join(" ") + " " + draft.title;
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [draft.blocks, draft.title]);

  return (
    <div className="np-backdrop" onClick={onCancel}>
      <div className="np-sheet" role="dialog" aria-modal="true" aria-label="Note editor" onClick={(e) => e.stopPropagation()}>
        {/* top bar */}
        <div className="np-sheet-top">
          <button type="button" className="np-ghost" onClick={onCancel}>
            ‹ Back
          </button>
          <div className="np-sheet-meta">{words} {words === 1 ? "word" : "words"}{dirty ? " · unsaved" : ""}</div>
          <button type="button" className="np-primary np-save" onClick={onSave}>
            Save
          </button>
        </div>

        {/* title + section */}
        <div className="np-sheet-head" style={{ borderLeftColor: colorOf(draft.color) }}>
          <input
            ref={titleRef}
            className="np-title-input"
            placeholder="Note title"
            value={draft.title}
            maxLength={120}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = draft.blocks[0];
                if (first) setFocusReq({ id: first.id, end: true });
              }
            }}
          />
          <div className="np-meta-row">
            <label className="np-select-wrap">
              <span>Section</span>
              <select value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}>
                {sections.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="np-colors" role="radiogroup" aria-label="Label colour">
              {COLORS.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.k}
                  aria-label={c.l}
                  title={c.l}
                  className={`np-swatch${draft.color === c.k ? " sel" : ""}${c.k === "none" ? " none" : ""}`}
                  style={{ background: c.k === "none" ? "transparent" : c.v }}
                  onClick={() => setDraft((d) => ({ ...d, color: c.k }))}
                />
              ))}
            </div>
            <button
              type="button"
              className={`np-pin${draft.pinned ? " on" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, pinned: !d.pinned }))}
              aria-pressed={draft.pinned}
            >
              {draft.pinned ? "★ Pinned" : "☆ Pin"}
            </button>
          </div>
          <div className="np-tags">
            {draft.tags.map((t) => (
              <span className="np-tag" key={t}>
                #{t}
                <button type="button" aria-label={"Remove tag " + t} onClick={() => removeTag(t)}>&times;</button>
              </span>
            ))}
            <input
              className="np-tag-input"
              placeholder="+ tag"
              value={tagInput}
              maxLength={20}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </div>

        {/* formatting toolbar */}
        <div className="np-toolbar" role="toolbar" aria-label="Formatting">
          {BLOCK_TOOLS.map((t) => (
            <button
              key={t.type}
              type="button"
              className={`np-tool${activeType === t.type ? " on" : ""}`}
              title={t.label}
              aria-label={t.label}
              aria-pressed={activeType === t.type}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTool(t.type)}
            >
              <span className="np-tool-ico">{t.icon}</span>
              <span className="np-tool-lbl">{t.label}</span>
            </button>
          ))}
        </div>

        {/* blocks */}
        <div className="np-canvas" onClick={(e) => { if (e.target === e.currentTarget) addBlockAtEnd(); }}>
          {draft.blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              index={i}
              numberLabel={numbers[b.id]}
              registerRef={registerRef}
              onChange={changeText}
              onKeyDown={handleKeyDown}
              onFocus={setActiveId}
              onToggle={toggleCheck}
              onRemoveDivider={removeBlock}
              active={b.id === activeId}
            />
          ))}
          <button type="button" className="np-addline" onClick={addBlockAtEnd}>
            + Add a line
          </button>
        </div>

        {!isNew && (
          <div className="np-sheet-foot">
            <button type="button" className="np-danger" onClick={onDelete}>
              Delete note
            </button>
            <span className="np-foot-date">Edited {fmtDate(draft.updatedAt || Date.now())}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- note card ----------
function NoteCard({ note, onOpen, onPin, onToggleCheck }) {
  const preview = useMemo(() => {
    const out = [];
    let n = 0;
    for (const b of note.blocks) {
      if (b.type === "divider") continue;
      if (!blockPlain(b)) {
        if (b.type === "number") n = 0;
        continue;
      }
      if (b.type === "number") n += 1;
      else n = 0;
      out.push({ ...b, n });
      if (out.length >= 5) break;
    }
    return out;
  }, [note.blocks]);

  const checks = note.blocks.filter((b) => b.type === "check");
  const done = checks.filter((b) => b.checked).length;

  return (
    <article className="np-card np-glass" style={{ "--card-c": colorOf(note.color) }}>
      <div className="np-card-bar" />
      <button type="button" className="np-card-body" onClick={() => onOpen(note.id)}>
        <div className="np-card-top">
          <span className="np-card-section">{note.section}</span>
          <span className="np-card-date">{fmtDate(note.updatedAt)}</span>
        </div>
        <h3 className="np-card-title">{note.title || "Untitled"}</h3>
        <div className="np-card-prev">
          {preview.length === 0 && <div className="np-prev-empty">Empty note</div>}
          {preview.map((b) => {
            if (b.type === "check")
              return (
                <div key={b.id} className={`np-prev-line chk${b.checked ? " done" : ""}`}>
                  <span
                    className={`np-prev-box${b.checked ? " on" : ""}`}
                    role="checkbox"
                    aria-checked={b.checked}
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onToggleCheck(note.id, b.id); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleCheck(note.id, b.id);
                      }
                    }}
                  >
                    {b.checked ? "✓" : ""}
                  </span>
                  <span>{b.text}</span>
                </div>
              );
            if (b.type === "bullet")
              return <div key={b.id} className="np-prev-line"><span className="np-prev-dot">•</span><span>{b.text}</span></div>;
            if (b.type === "number")
              return <div key={b.id} className="np-prev-line"><span className="np-prev-dot">{b.n}.</span><span>{b.text}</span></div>;
            return (
              <div key={b.id} className={`np-prev-line np-prev-${b.type}`}>
                <span>{b.text}</span>
              </div>
            );
          })}
        </div>
        <div className="np-card-foot">
          {checks.length > 0 && (
            <span className="np-card-chip">☑ {done}/{checks.length}</span>
          )}
          {note.tags.slice(0, 3).map((t) => (
            <span className="np-card-chip" key={t}>#{t}</span>
          ))}
        </div>
      </button>
      <button
        type="button"
        className={`np-card-pin${note.pinned ? " on" : ""}`}
        aria-label={note.pinned ? "Unpin note" : "Pin note"}
        aria-pressed={note.pinned}
        onClick={() => onPin(note.id)}
      >
        {note.pinned ? "★" : "☆"}
      </button>
    </article>
  );
}

// ---------- main component ----------
export default function Notepad({ onBack, onSaveNote, onDeleteNote } = {}) {
  const [theme, setTheme] = useLocalStorageState("td_theme", "dark");
  const [notes, setNotes] = useLocalStorageState("td_notes", []);
  const [sections, setSections] = useLocalStorageState("td_note_sections", DEFAULT_SECTIONS);
  const [activeSection, setActiveSection] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useLocalStorageState("td_notes_sort", "updated"); // updated | created | title
  const [draft, setDraft] = useState(null); // note being edited
  const [draftBase, setDraftBase] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionInput, setSectionInput] = useState("");
  const [toast, setToast] = useState("");
  const fontLinkAdded = useRef(false);
  const toastTimer = useRef(null);

  // keep theme in sync with the Session page
  useEffect(() => {
    const sync = () => {
      const t = readLS("td_theme", "dark");
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // font
  useEffect(() => {
    if (fontLinkAdded.current || typeof document === "undefined") return;
    fontLinkAdded.current = true;
    if (!document.getElementById("ts-font-link")) {
      const link = document.createElement("link");
      link.id = "ts-font-link";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ---------- persistence hooks (Supabase goes here later) ----------
  const persist = (note) => {
    if (typeof onSaveNote === "function") {
      try { onSaveNote(note); } catch (e) { /* ignore */ }
    }
  };
  const remove = (id) => {
    if (typeof onDeleteNote === "function") {
      try { onDeleteNote(id); } catch (e) { /* ignore */ }
    }
  };

  // ---------- editor open / close ----------
  const snapshot = (d) => JSON.stringify({ t: d.title, s: d.section, c: d.color, p: d.pinned, g: d.tags, b: d.blocks.map((b) => [b.type, b.text, b.checked]) });
  const dirty = !!draft && snapshot(draft) !== draftBase;

  const openNew = () => {
    const d = {
      id: uid("note"),
      title: "",
      section: activeSection !== "All" ? activeSection : sections[0] || "General",
      color: "none",
      pinned: false,
      tags: [],
      blocks: [newBlock("text")],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setDraft(d);
    setDraftBase(snapshot(d));
    setIsNew(true);
  };

  const openNote = (id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    const d = { ...n, tags: n.tags.slice(), blocks: n.blocks.map((b) => ({ ...b })) };
    setDraft(d);
    setDraftBase(snapshot(d));
    setIsNew(false);
  };

  const closeEditor = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const hasContent = draft.title.trim() || draft.blocks.some((b) => blockPlain(b) || b.type === "divider");
    if (!hasContent) {
      showToast("Add a title or some content first.");
      return;
    }
    // trim trailing empty text blocks
    let blocks = draft.blocks.slice();
    while (blocks.length > 1 && blocks[blocks.length - 1].type === "text" && !blocks[blocks.length - 1].text.trim()) blocks.pop();
    const note = { ...draft, title: draft.title.trim(), blocks, updatedAt: Date.now() };
    setNotes((ns) => {
      const idx = ns.findIndex((x) => x.id === note.id);
      if (idx > -1) {
        const next = ns.slice();
        next[idx] = note;
        return next;
      }
      return [note, ...ns];
    });
    persist(note);
    if (!sections.includes(note.section)) setSections((s) => [...s, note.section]);
    setDraft(null);
    showToast(isNew ? "Note saved." : "Changes saved.");
  };

  const deleteDraft = () => {
    if (!draft) return;
    if (!window.confirm("Delete this note? This can't be undone.")) return;
    setNotes((ns) => ns.filter((x) => x.id !== draft.id));
    remove(draft.id);
    setDraft(null);
    showToast("Note deleted.");
  };

  // Esc closes editor
  useEffect(() => {
    if (!draft) return;
    const onKey = (e) => { if (e.key === "Escape") closeEditor(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  // lock page scroll while the editor is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = draft ? "hidden" : prev;
    return () => { document.body.style.overflow = prev; };
  }, [draft]);

  // ---------- quick actions from cards ----------
  const togglePin = (id) => {
    setNotes((ns) => {
      const next = ns.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
      const changed = next.find((n) => n.id === id);
      if (changed) persist(changed);
      return next;
    });
  };
  const toggleCardCheck = (noteId, blockId) => {
    setNotes((ns) => {
      const next = ns.map((n) =>
        n.id === noteId
          ? { ...n, updatedAt: Date.now(), blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b)) }
          : n
      );
      const changed = next.find((n) => n.id === noteId);
      if (changed) persist(changed);
      return next;
    });
  };

  // ---------- sections ----------
  const addSection = () => {
    const name = sectionInput.trim().slice(0, 24);
    if (name && !sections.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setSections((s) => [...s, name]);
      setActiveSection(name);
    }
    setSectionInput("");
    setAddingSection(false);
  };

  const sectionCounts = useMemo(() => {
    const m = {};
    notes.forEach((n) => { m[n.section] = (m[n.section] || 0) + 1; });
    return m;
  }, [notes]);

  const allSections = useMemo(() => {
    const extra = Object.keys(sectionCounts).filter((s) => !sections.includes(s));
    return [...sections, ...extra];
  }, [sections, sectionCounts]);

  // ---------- filtering ----------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => activeSection === "All" || n.section === activeSection);
    if (q) {
      list = list.filter((n) => {
        const hay = (n.title + " " + n.tags.join(" ") + " " + n.blocks.map(blockPlain).join(" ")).toLowerCase();
        return hay.includes(q);
      });
    }
    const cmp =
      sort === "title" ? (a, b) => (a.title || "").localeCompare(b.title || "")
      : sort === "created" ? (a, b) => b.createdAt - a.createdAt
      : (a, b) => b.updatedAt - a.updatedAt;
    return list.slice().sort(cmp);
  }, [notes, activeSection, query, sort]);

  const pinned = visible.filter((n) => n.pinned);
  const others = visible.filter((n) => !n.pinned);

  const renderCard = (n) => (
    <NoteCard key={n.id} note={n} onOpen={openNote} onPin={togglePin} onToggleCheck={toggleCardCheck} />
  );

  const goBack = () => {
    if (typeof onBack === "function") onBack();
    else if (typeof window !== "undefined") window.location.hash = "";
  };

  return (
    <div className="np-root" data-theme={theme}>
      <style>{CSS}</style>

      <div className="np-wrap">
        {/* header */}
        <header className="np-top">
          <div className="np-brand">
            <h1>Notepad</h1>
            <div className="np-brand-sub">Your strategies, rules and thinking. Everything worth remembering.</div>
            <div className="np-brand-btns">
              <button type="button" className="np-pill" onClick={goBack}>‹ Session</button>
              <button type="button" className="np-pill" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "Switch to dark" : "Switch to light"}
              </button>
            </div>
          </div>
        </header>

        <div className="np-layout">
          {/* sections rail */}
          <aside className="np-rail" aria-label="Sections">
            <div className="np-rail-title">Notebook</div>
            <div className="np-sections">
              <button
                type="button"
                className={`np-sec${activeSection === "All" ? " active" : ""}`}
                onClick={() => setActiveSection("All")}
              >
                <span className="np-sec-name">All notes</span>
                <span className="np-sec-count">{notes.length}</span>
              </button>
              {allSections.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`np-sec${activeSection === s ? " active" : ""}`}
                  onClick={() => setActiveSection(s)}
                >
                  <span className="np-sec-name">{s}</span>
                  <span className="np-sec-count">{sectionCounts[s] || 0}</span>
                </button>
              ))}
              {addingSection ? (
                <input
                  className="np-sec-input"
                  autoFocus
                  placeholder="Section name"
                  value={sectionInput}
                  maxLength={24}
                  onChange={(e) => setSectionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSection();
                    if (e.key === "Escape") { setSectionInput(""); setAddingSection(false); }
                  }}
                  onBlur={addSection}
                />
              ) : (
                <button type="button" className="np-sec np-sec-add" onClick={() => setAddingSection(true)}>
                  + Section
                </button>
              )}
            </div>
          </aside>

          {/* notes list */}
          <main className="np-main">
            <div className="np-toolrow">
              <div className="np-search np-glass">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  placeholder="Search notes, tags, content…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search notes"
                />
                {query && (
                  <button type="button" className="np-clear" aria-label="Clear search" onClick={() => setQuery("")}>&times;</button>
                )}
              </div>
              <select className="np-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort notes">
                <option value="updated">Recently edited</option>
                <option value="created">Newest first</option>
                <option value="title">A – Z</option>
              </select>
            </div>

            <h2 className="np-h2">
              Saved notes
              <span className="np-sub">
                {activeSection === "All" ? "all sections" : activeSection} · {visible.length} {visible.length === 1 ? "note" : "notes"}
              </span>
            </h2>

            {notes.length === 0 ? (
              <div className="np-empty np-glass">
                <div className="np-empty-ico">📓</div>
                <div className="np-empty-t">Your notebook is empty</div>
                <div className="np-empty-s">
                  Tap the + button to write your first note. Capture a strategy, a rule you keep breaking, or an idea before it slips away.
                </div>
                <button type="button" className="np-primary" onClick={openNew}>Create a note</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="np-empty np-glass">
                <div className="np-empty-ico">🔍</div>
                <div className="np-empty-t">Nothing found</div>
                <div className="np-empty-s">
                  {query ? "No notes match your search here." : "This section has no notes yet."}
                </div>
              </div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="np-group">★ Pinned</div>
                    <div className="np-grid">{pinned.map(renderCard)}</div>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    {pinned.length > 0 && <div className="np-group">Notes</div>}
                    <div className="np-grid">{others.map(renderCard)}</div>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* floating add button */}
      {!draft && (
        <button type="button" className="np-fab" onClick={openNew} aria-label="New note">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {draft && (
        <NoteEditor
          draft={draft}
          setDraft={setDraft}
          sections={allSections.includes(draft.section) ? allSections : [...allSections, draft.section]}
          isNew={isNew}
          dirty={dirty}
          onSave={saveDraft}
          onCancel={closeEditor}
          onDelete={deleteDraft}
        />
      )}

      <div className={`np-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

// ---------- scoped styles ----------
const CSS = `
.np-root{
/* ===== DARK: obsidian navy / champagne gold ===== */
--bg-grad:linear-gradient(180deg,#0c1124 0%,#080b17 42%,#04060d 100%);
--surface:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 42%),linear-gradient(160deg,rgba(26,34,58,.86),rgba(11,15,29,.94));
--surface-2:rgba(255,255,255,.055);
--border:rgba(190,205,255,.10);
--text:#f5f7fc; --muted:#8b94ad;
--amber:#e8c97a; --amber-dim:rgba(232,201,122,.16);
--accent-text:#f1d98f;
--teal:#34e0a1; --teal-dim:rgba(52,224,161,.14);
--rose:#ff6b7d; --rose-dim:rgba(255,107,125,.15);
--warn:#f2b45c; --warn-dim:rgba(242,180,92,.17);
--on-accent:#1b1407;
--focus-ring:#e8c97a;
--orb-1:rgba(232,201,122,.13); --orb-2:rgba(64,104,255,.20); --orb-3:rgba(150,170,255,.07);
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--shadow-card-hover:0 1px 0 rgba(255,255,255,.11) inset,0 26px 50px -18px rgba(0,0,0,1);
--glow-amber:rgba(232,201,122,.30); --glow-rose:rgba(255,107,125,.38);
--sheet-bg:linear-gradient(180deg,#10172e 0%,#0a0f20 100%);
--r-card:26px; --r-input:14px; --r-pill:999px;

padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
box-sizing:border-box; min-height:100vh; position:relative;
background:var(--bg-grad); background-attachment:fixed;
color:var(--text); font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.np-root[data-theme="light"]{
/* ===== LIGHT: blue glass ===== */
--bg-grad:linear-gradient(180deg,#d6e2f7 0%,#bfd0ee 50%,#a9bee4 100%);
--surface:linear-gradient(160deg,rgba(255,255,255,.80),rgba(224,235,252,.58));
--surface-2:rgba(255,255,255,.62);
--border:rgba(30,60,120,.13);
--text:#10214a; --muted:#5d7099;
--amber:#e9a92a; --amber-dim:rgba(233,169,42,.28);
--accent-text:#1f4a94;
--teal:#0b8f50; --teal-dim:rgba(15,157,88,.14);
--rose:#d63c33; --rose-dim:rgba(214,60,51,.12);
--warn:#c67a12; --warn-dim:rgba(198,122,18,.16);
--on-accent:#2b1d00;
--focus-ring:#2f6fc4;
--orb-1:rgba(255,255,255,.9); --orb-2:rgba(90,140,230,.42); --orb-3:rgba(255,255,255,.55);
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--modal-bg:#eef4ff;
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--shadow-card-hover:0 1px 0 rgba(255,255,255,1) inset,0 22px 42px -18px rgba(38,72,150,.48);
--glow-amber:rgba(233,169,42,.42); --glow-rose:rgba(214,60,51,.28);
--sheet-bg:linear-gradient(180deg,#f4f8ff 0%,#e3ecfb 100%);
}
.np-root::before{
  content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
    radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
    radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);
}
.np-root:not([data-theme="light"])::after{
  content:""; position:fixed; left:0; right:0; top:0; height:360px; pointer-events:none; z-index:0;
  background-image:
    radial-gradient(520px 200px at 50% -40px,rgba(232,201,122,.14),transparent 70%),
    linear-gradient(rgba(190,205,255,.028) 1px,transparent 1px),
    linear-gradient(90deg,rgba(190,205,255,.028) 1px,transparent 1px);
  background-size:100% 100%,34px 34px,34px 34px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
}
.np-root *{box-sizing:border-box;}
.np-root ::selection{background:var(--amber);color:var(--on-accent);}
.np-root button{font-family:inherit;}
.np-root input,.np-root textarea,.np-root select{font-family:inherit;}
.np-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.np-root{overflow-x:clip;max-width:100vw;}

.np-glass{
  background:var(--surface);
  -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur);
  border:1px solid var(--border);
  box-shadow:var(--shadow-card);
}

.np-wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:26px 18px 130px;}
@media (min-width:900px){.np-wrap{max-width:1040px;padding:34px 28px 130px;}}

/* ---------- header ---------- */
.np-top{margin-bottom:18px;}
.np-brand h1{font-weight:800;font-size:clamp(28px,6vw,36px);margin:0 0 6px;letter-spacing:-.03em;line-height:1.05;}
.np-root:not([data-theme="light"]) .np-brand h1{
  font-weight:700;letter-spacing:-.035em;
  background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
}
.np-brand-sub{font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.45;max-width:520px;}
.np-brand-btns{display:flex;flex-wrap:wrap;gap:8px;}
.np-pill{background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:6px 13px;font-size:11.5px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.np-pill:hover{border-color:var(--amber);color:var(--text);}

/* ---------- layout ---------- */
.np-layout{display:block;}
@media (min-width:900px){
  .np-layout{display:grid;grid-template-columns:220px 1fr;gap:26px;align-items:start;}
  .np-rail{position:sticky;top:24px;}
}

/* ---------- section rail ---------- */
.np-rail-title{display:none;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 6px 10px;}
.np-sections{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -18px 6px;padding-left:18px;padding-right:18px;scrollbar-width:none;}
.np-sections::-webkit-scrollbar{display:none;}
.np-sec{flex-shrink:0;display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:12.5px;font-weight:700;cursor:pointer;transition:all .18s ease;white-space:nowrap;}
.np-sec:hover{color:var(--text);}
.np-sec.active{background:var(--btn);border-color:transparent;color:var(--on-accent);box-shadow:0 8px 18px -10px var(--glow-amber);}
.np-sec-count{font-size:11px;font-weight:800;opacity:.7;font-variant-numeric:tabular-nums;}
.np-sec-add{border-style:dashed;}
.np-sec-input{flex-shrink:0;width:140px;background:var(--surface-2);border:1px solid var(--amber);border-radius:var(--r-pill);color:var(--text);padding:8px 13px;font-size:12.5px;}
@media (min-width:900px){
  .np-rail{border-radius:var(--r-card);padding:16px 12px;background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card);}
  .np-rail-title{display:block;}
  .np-sections{flex-direction:column;overflow:visible;margin:0;padding:0;gap:4px;}
  .np-sec{width:100%;justify-content:space-between;border-radius:14px;border-color:transparent;background:transparent;padding:10px 12px;font-size:13.5px;}
  .np-sec:hover{background:var(--surface-2);}
  .np-sec.active{background:var(--btn);}
  .np-sec-input{width:100%;border-radius:14px;}
  .np-sec-add{justify-content:center;margin-top:6px;border:1px dashed var(--border);}
}

/* ---------- toolbar row ---------- */
.np-toolrow{display:flex;gap:10px;margin-bottom:6px;}
.np-search{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border-radius:18px;padding:0 14px;color:var(--muted);}
.np-search input{flex:1;min-width:0;background:none;border:none;color:var(--text);font-size:14px;padding:13px 0;outline:none;}
.np-search input::placeholder{color:var(--muted);}
.np-search:focus-within{border-color:var(--amber);}
.np-clear{background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;line-height:1;padding:0 2px;}
.np-clear:hover{color:var(--text);}
.np-sort{flex-shrink:0;background:var(--surface-2);border:1px solid var(--border);border-radius:18px;color:var(--text);padding:0 12px;font-size:12.5px;font-weight:600;cursor:pointer;max-width:140px;}

.np-h2{font-weight:700;font-size:19px;letter-spacing:-.02em;margin:26px 0 14px;padding:0 4px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.np-sub{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0;text-align:right;}
.np-group{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:18px 6px 10px;}

/* ---------- note cards ---------- */
.np-grid{display:grid;grid-template-columns:1fr;gap:12px;}
@media (min-width:640px){.np-grid{grid-template-columns:1fr 1fr;}}
@media (min-width:1100px){.np-grid{grid-template-columns:repeat(3,1fr);}}
@media (min-width:900px) and (max-width:1099px){.np-grid{grid-template-columns:1fr 1fr;}}
.np-card{position:relative;border-radius:22px;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}
.np-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-card-hover);border-color:var(--amber);}
.np-card-bar{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--card-c);}
.np-card-body{display:block;width:100%;text-align:left;background:none;border:none;color:inherit;cursor:pointer;padding:16px 46px 14px 20px;min-height:132px;}
.np-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;}
.np-card-section{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text);}
.np-card-date{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
.np-card-title{font-size:16.5px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px;line-height:1.25;overflow-wrap:anywhere;}
.np-card-prev{display:flex;flex-direction:column;gap:4px;}
.np-prev-line{display:flex;gap:8px;font-size:12.8px;line-height:1.4;color:var(--muted);overflow-wrap:anywhere;}
.np-prev-line>span:last-child{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.np-prev-dot{flex-shrink:0;min-width:12px;color:var(--accent-text);font-weight:700;}
.np-prev-box{flex-shrink:0;width:15px;height:15px;margin-top:1px;border-radius:5px;border:1.5px solid var(--border);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:transparent;cursor:pointer;background:var(--surface-2);}
.np-prev-box.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.np-prev-line.done>span:last-child{text-decoration:line-through;opacity:.6;}
.np-prev-h{color:var(--text);font-weight:700;}
.np-prev-quote{font-style:italic;}
.np-prev-callout{color:var(--text);}
.np-prev-empty{font-size:12.5px;color:var(--muted);font-style:italic;}
.np-card-foot{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.np-card-foot:empty{display:none;}
.np-card-chip{font-size:11px;font-weight:700;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-pill);padding:3px 9px;}
.np-card-pin{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;border:none;background:none;color:var(--muted);font-size:17px;cursor:pointer;line-height:1;transition:all .15s ease;}
.np-card-pin:hover{color:var(--amber);background:var(--surface-2);}
.np-card-pin.on{color:var(--amber);}

/* ---------- empty ---------- */
.np-empty{border-radius:var(--r-card);padding:34px 24px;text-align:center;}
.np-empty-ico{font-size:40px;margin-bottom:10px;}
.np-empty-t{font-size:17px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;}
.np-empty-s{font-size:13px;color:var(--muted);line-height:1.5;max-width:340px;margin:0 auto 18px;}
.np-empty .np-primary{margin:0 auto;}

/* ---------- buttons ---------- */
.np-primary{border:none;background:var(--btn);color:var(--on-accent);font-weight:800;border-radius:14px;padding:11px 20px;font-size:13.5px;cursor:pointer;box-shadow:0 10px 20px -10px var(--glow-amber);transition:transform .15s ease;}
.np-primary:active{transform:scale(.97);}
.np-ghost{border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700;border-radius:14px;padding:10px 16px;font-size:13px;cursor:pointer;}
.np-ghost:hover{border-color:var(--amber);}
.np-danger{border:1px solid var(--rose);background:var(--rose-dim);color:var(--rose);font-weight:700;border-radius:14px;padding:9px 16px;font-size:12.5px;cursor:pointer;}
.np-danger:hover{filter:brightness(1.1);}

/* ---------- floating add button ---------- */
.np-fab{position:fixed;right:max(20px,calc(50% - 540px));bottom:calc(26px + env(safe-area-inset-bottom,0px));z-index:50;width:62px;height:62px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:var(--btn);color:var(--on-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 18px 34px -10px var(--glow-amber),0 8px 20px -6px rgba(0,0,0,.5);transition:transform .18s ease,box-shadow .18s ease;animation:np-fab-in .35s cubic-bezier(.2,1.2,.4,1);}
@media (max-width:1100px){.np-fab{right:20px;}}
.np-fab:hover{transform:scale(1.07) rotate(90deg);}
.np-fab:active{transform:scale(.94);}
@keyframes np-fab-in{from{transform:scale(.4);opacity:0;}to{transform:scale(1);opacity:1;}}

/* ---------- editor sheet ---------- */
.np-backdrop{position:fixed;inset:0;z-index:100;background:rgba(3,10,30,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:np-fade .2s ease;}
@media (min-width:760px){.np-backdrop{align-items:center;padding:28px;}}
@keyframes np-fade{from{opacity:0;}to{opacity:1;}}
.np-sheet{width:100%;max-width:760px;height:96vh;height:96dvh;display:flex;flex-direction:column;background:var(--sheet-bg);color:var(--text);border:1px solid var(--border);border-radius:28px 28px 0 0;box-shadow:0 -10px 50px rgba(0,0,0,.45);animation:np-up .26s ease;overflow:hidden;}
@media (min-width:760px){.np-sheet{height:88vh;max-height:860px;border-radius:28px;}}
@keyframes np-up{from{transform:translateY(26px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.np-sheet-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 10px;}
.np-sheet-meta{font-size:11.5px;color:var(--muted);font-weight:600;font-variant-numeric:tabular-nums;}
.np-save{padding:10px 24px;}
.np-sheet-head{padding:8px 20px 12px;margin:0 16px;border-left:4px solid transparent;border-radius:4px;}
.np-title-input{width:100%;background:none;border:none;outline:none;color:var(--text);font-size:clamp(24px,5vw,30px);font-weight:800;letter-spacing:-.03em;padding:4px 0 10px;}
.np-title-input::placeholder{color:var(--muted);opacity:.7;}
.np-meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;}
.np-select-wrap{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;color:var(--muted);}
.np-select-wrap select{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:7px 10px;font-size:12.5px;font-weight:600;cursor:pointer;max-width:150px;}
.np-colors{display:inline-flex;gap:7px;align-items:center;}
.np-swatch{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--border);cursor:pointer;padding:0;transition:transform .15s ease;}
.np-swatch.none{background-image:linear-gradient(135deg,transparent 45%,var(--muted) 46%,var(--muted) 54%,transparent 55%);}
.np-swatch:hover{transform:scale(1.15);}
.np-swatch.sel{box-shadow:0 0 0 2px var(--sheet-bg),0 0 0 4px var(--text);}
.np-pin{margin-left:auto;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;}
.np-pin.on{border-color:var(--amber);color:var(--amber);background:var(--amber-dim);}
.np-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px;}
.np-tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--accent-text);background:var(--amber-dim);border-radius:var(--r-pill);padding:4px 6px 4px 10px;}
.np-tag button{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}
.np-tag button:hover{opacity:1;}
.np-tag-input{width:84px;background:none;border:1px dashed var(--border);border-radius:var(--r-pill);color:var(--text);padding:4px 10px;font-size:11.5px;outline:none;}
.np-tag-input:focus{border-color:var(--amber);}

/* formatting toolbar */
.np-toolbar{display:flex;gap:6px;overflow-x:auto;padding:10px 16px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface-2);scrollbar-width:none;}
.np-toolbar::-webkit-scrollbar{display:none;}
.np-tool{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:none;color:var(--muted);border-radius:12px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s ease;white-space:nowrap;}
.np-tool:hover{color:var(--text);background:var(--surface-2);}
.np-tool.on{background:var(--btn);color:var(--on-accent);box-shadow:0 6px 14px -8px var(--glow-amber);}
.np-tool-ico{font-size:14px;font-weight:800;min-width:16px;text-align:center;}
@media (max-width:640px){.np-tool-lbl{display:none;}.np-tool{padding:8px 12px;}}

/* canvas / blocks */
.np-canvas{flex:1;overflow-y:auto;padding:18px 22px 40px;-webkit-overflow-scrolling:touch;}
.np-block{display:flex;align-items:flex-start;gap:10px;margin-bottom:2px;border-radius:10px;padding:2px 6px;margin-left:-6px;margin-right:-6px;}
.np-block textarea{flex:1;min-width:0;width:100%;resize:none;overflow:hidden;background:none;border:none;outline:none;color:var(--text);font-size:15px;line-height:1.6;padding:3px 0;display:block;}
.np-block textarea::placeholder{color:var(--muted);opacity:.55;}
.np-block.active{background:var(--surface-2);}
.np-mark{flex-shrink:0;min-width:18px;text-align:center;padding-top:3px;font-size:15px;line-height:1.6;color:var(--accent-text);font-weight:800;}
.np-num{min-width:22px;text-align:right;font-variant-numeric:tabular-nums;}
.np-box{flex-shrink:0;width:20px;height:20px;margin-top:6px;border-radius:7px;border:1.5px solid var(--muted);background:var(--surface-2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:transparent;font-size:12px;font-weight:800;padding:0;transition:all .15s ease;}
.np-box:hover{border-color:var(--amber);}
.np-box.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.np-check.checked textarea{text-decoration:line-through;color:var(--muted);}
.np-h textarea{font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.3;padding-top:8px;}
.np-quote{border-left:3px solid var(--amber);border-radius:4px 10px 10px 4px;padding-left:12px;margin-left:0;}
.np-quote textarea{font-style:italic;color:var(--muted);}
.np-callout{background:var(--amber-dim);border:1px solid var(--border);border-radius:14px;padding:10px 14px;margin:6px 0;}
.np-callout.active{background:var(--amber-dim);}
.np-callout-ico{flex-shrink:0;font-size:17px;line-height:1.6;}
.np-callout textarea{font-weight:600;}
.np-divider{position:relative;padding:10px 6px;align-items:center;}
.np-divider hr{flex:1;border:none;border-top:1.5px solid var(--border);margin:0;}
.np-divider-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;opacity:0;transition:opacity .15s ease;}
.np-divider:hover .np-divider-x,.np-divider.active .np-divider-x{opacity:1;}
.np-addline{margin-top:12px;background:none;border:1px dashed var(--border);color:var(--muted);border-radius:12px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;}
.np-addline:hover{border-color:var(--amber);color:var(--text);}

.np-sheet-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border);}
.np-foot-date{font-size:11.5px;color:var(--muted);}

/* ---------- toast ---------- */
.np-toast{position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom,0px));transform:translate(-50%,14px);z-index:140;background:var(--sheet-bg);border:1px solid var(--border);color:var(--text);padding:11px 20px;border-radius:var(--r-pill);font-size:13px;font-weight:700;box-shadow:0 14px 30px -10px rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}
.np-toast.show{opacity:1;transform:translate(-50%,0);}

@media (prefers-reduced-motion:reduce){
  .np-fab,.np-backdrop,.np-sheet{animation:none;}
  .np-card,.np-fab{transition:none;}
}
`;