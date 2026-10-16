import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/**
 * <Settings />  ->  Pages/Settings.jsx
 *
 * Lets the trader own their day. Every block of the routine (times, titles,
 * icons, descriptions, type) is editable, new blocks can be inserted anywhere,
 * and one tap loads a ready-made layout (early morning, evening, ...).
 *
 * The schedule is stored in localStorage under SCHEDULE_KEY. The named exports
 * below (loadScheduleDoc, groupSchedule, ...) are what <Session /> will read
 * so nothing in the day is hard-coded any more.
 *
 * Visual layer matches The Session: obsidian navy / champagne gold (dark) and
 * frosted sky-blue glass (light). Theme is shared through "td_theme".
 */

// =====================================================================
// shared helpers (these exports are what Session.jsx will import)
// =====================================================================
const pad = (n) => String(n).padStart(2, "0");
const M = (h, m) => h * 60 + m;
const clampMin = (n) => Math.max(0, Math.min(1439, Math.round(n)));
export const fmtT = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const toTimeValue = (m) => fmtT(clampMin(m));
const fromTimeValue = (s) => {
  const p = (s || "").split(":");
  if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
  return Number(p[0]) * 60 + Number(p[1]);
};
const fmtDur = (mins) => {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
};
const newId = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

export const SCHEDULE_KEY = "td_schedule";
export const SCHEDULE_EVENT = "td-schedule-change";
export const DEFAULT_GOAL_CHECK = M(16, 30);
export const DEFAULT_TITLES = { prep: "Preparation", session: "The window", close: "Wrap-up" };

export const TYPE_META = {
  prep: { label: "Prep", emoji: "📓", color: "#9cc4ff", len: 15, title: "Review" },
  trade: { label: "Trading", emoji: "🎯", color: "#f6e0a2", len: 60, title: "Trading Block" },
  rest: { label: "Break", emoji: "☕", color: "#8dffc0", len: 15, title: "Break" },
};

// The routine the app shipped with. Ids are kept so old checklists stay valid.
const BASE = [
  { id: "review", type: "prep", s: M(10, 30), e: M(10, 45), emoji: "📓", title: "Previous Day Review", desc: "Yesterday's trades, screenshots, mistakes, wins, P&L." },
  { id: "premarket", type: "prep", s: M(10, 45), e: M(11, 0), emoji: "🧭", title: "Pre-Market Preparation", desc: "HTF bias, key levels, liquidity, important zones, market conditions. Set today's loss limit and trade cap now, while calm." },
  { id: "t1", type: "trade", s: M(11, 0), e: M(12, 15), emoji: "🎯", title: "Trading Block 1", desc: "Execute your plan. Take only your best setups." },
  { id: "b1", type: "rest", s: M(12, 15), e: M(12, 30), emoji: "☕", title: "Break", desc: "Step away from the screen. Water, stretch, reset." },
  { id: "t2", type: "trade", s: M(12, 30), e: M(13, 30), emoji: "🎯", title: "Trading Block 2", desc: "Stay patient and stick to the plan." },
  { id: "lunch", type: "rest", s: M(13, 30), e: M(14, 0), emoji: "🍽️", title: "Lunch + Break", desc: "Eat away from the desk. No charts." },
  { id: "t3", type: "trade", s: M(14, 0), e: M(15, 0), emoji: "🎯", title: "Trading Block 3", desc: "Fresh eyes after lunch. Same rules, same discipline." },
  { id: "b2", type: "rest", s: M(15, 0), e: M(15, 15), emoji: "🚶", title: "Break", desc: "Walk, breathe, eyes off the screen." },
  { id: "t4", type: "trade", s: M(15, 15), e: M(16, 15), emoji: "🎯", title: "Trading Block 4", desc: "Stay selective. Quality over quantity." },
  { id: "b3", type: "rest", s: M(16, 15), e: M(16, 30), emoji: "☕", title: "Break", desc: "Short reset before the final block." },
  { id: "tfinal", type: "trade", s: M(16, 30), e: M(16, 50), emoji: "🎯", title: "Final Trading Block", desc: "Last window. A+ setups only, or just manage what's open." },
  { id: "eod", type: "prep", s: M(16, 50), e: M(17, 0), emoji: "📊", title: "End-of-Day Review", desc: "P&L, executions, screenshots, lessons, journal." },
];

function finalizeBlock(b) {
  const type = TYPE_META[b.type] ? b.type : "prep";
  const emoji = (b.emoji || "").trim() || TYPE_META[type].emoji;
  const title = (b.title || "").trim();
  const start = clampMin(b.start);
  const end = clampMin(b.end);
  return {
    id: b.id,
    type,
    start,
    end,
    emoji,
    title,
    label: emoji + " " + title,
    desc: (b.desc || "").trim(),
    t: fmtT(start) + "–" + fmtT(end),
  };
}

export function finalizeDoc(doc) {
  const blocks = (doc.blocks || [])
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.start - y.b.start || x.i - y.i)
    .map(({ b }) => finalizeBlock(b));
  const titles = {};
  Object.keys(DEFAULT_TITLES).forEach((k) => {
    const v = doc.titles && doc.titles[k];
    titles[k] = typeof v === "string" && v.trim() ? v.trim() : DEFAULT_TITLES[k];
  });
  const gc = Number(doc.goalCheck);
  return { version: 1, goalCheck: Number.isFinite(gc) ? clampMin(gc) : DEFAULT_GOAL_CHECK, titles, blocks };
}

function buildBlocks(shift = 0, meal) {
  return BASE.map((r) =>
    finalizeBlock({
      id: r.id,
      type: r.type,
      start: clampMin(r.s + shift),
      end: clampMin(r.e + shift),
      emoji: r.emoji,
      title: r.id === "lunch" && meal ? meal : r.title,
      desc: r.id === "t3" && meal && meal !== "Lunch + Break" ? r.desc.replace("after lunch", "after the break") : r.desc,
    })
  );
}

export function makeDefaultDoc(shift = 0, meal) {
  return finalizeDoc({ blocks: buildBlocks(shift, meal), titles: DEFAULT_TITLES, goalCheck: DEFAULT_GOAL_CHECK + shift });
}

function sanitizeDoc(raw) {
  if (!raw || !Array.isArray(raw.blocks) || raw.blocks.length === 0) return makeDefaultDoc();
  const blocks = raw.blocks
    .filter((b) => b && Number.isFinite(Number(b.start)) && Number.isFinite(Number(b.end)))
    .map((b) => ({
      id: typeof b.id === "string" && b.id ? b.id : newId(),
      type: TYPE_META[b.type] ? b.type : "prep",
      start: Number(b.start),
      end: Number(b.end),
      emoji: typeof b.emoji === "string" ? b.emoji : "",
      title: typeof b.title === "string" ? b.title : String(b.label || "").replace(/^\S+\s/, ""),
      desc: typeof b.desc === "string" ? b.desc : "",
    }));
  if (!blocks.length) return makeDefaultDoc();
  return { ...raw, blocks };
}

/** Read the saved schedule (falls back to the original routine). */
export function loadScheduleDoc() {
  return finalizeDoc(sanitizeDoc(readLS(SCHEDULE_KEY, null)));
}

/** Persist a schedule and tell any mounted <Session /> about it. */
export function saveScheduleDoc(doc) {
  const clean = finalizeDoc(doc);
  writeLS(SCHEDULE_KEY, clean);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(SCHEDULE_EVENT, { detail: clean }));
    } catch (e) {
      /* old browsers: Session still re-reads on mount and on focus */
    }
  }
  return clean;
}

/**
 * Splits a schedule into the three groups Session renders:
 *   prep    = everything before the first trading block
 *   session = first trading block through the last one
 *   close   = everything after the last trading block
 */
export function groupSchedule(doc) {
  const blocks = finalizeDoc(doc).blocks;
  const first = blocks.findIndex((b) => b.type === "trade");
  let last = -1;
  blocks.forEach((b, i) => {
    if (b.type === "trade") last = i;
  });
  const out = { prep: [], session: [], close: [] };
  blocks.forEach((b, i) => {
    const g = first < 0 ? "session" : i < first ? "prep" : i > last ? "close" : "session";
    out[g].push(b);
  });
  return out;
}

export function groupRange(list) {
  if (!list || !list.length) return "";
  return fmtT(Math.min(...list.map((b) => b.start))) + " – " + fmtT(Math.max(...list.map((b) => b.end)));
}

// =====================================================================
// presets
// =====================================================================
const PRESETS = [
  { key: "early", name: "Early morning", shift: -240, meal: "Breakfast + Break", note: "Done before lunch" },
  { key: "morning", name: "Morning", shift: -120, meal: "Lunch + Break", note: "Start the day sharp" },
  { key: "standard", name: "Standard", shift: 0, meal: "Lunch + Break", note: "Your original routine" },
  { key: "afternoon", name: "Afternoon", shift: 180, meal: "Meal + Break", note: "Late-start sessions" },
  { key: "evening", name: "Evening", shift: 360, meal: "Dinner + Break", note: "After the day job" },
];

const EMOJIS = ["📓", "🧭", "🎯", "☕", "🍽️", "🚶", "📊", "📈", "📉", "📰", "🧠", "🧘", "💪", "🌅", "🌙", "⏱️", "🔔", "✅", "🛑", "🍳"];

// =====================================================================
// editing helpers
// =====================================================================
function validate(blocks) {
  const byId = {};
  let errors = 0;
  let warns = 0;
  const add = (id, level, msg) => {
    (byId[id] = byId[id] || []).push({ level, msg });
    if (level === "error") errors += 1;
    else warns += 1;
  };

  blocks.forEach((b, i) => {
    if (!b || typeof b !== "object") return;
    if (b.start >= b.end) add(b.id, "error", "Block ends before it starts.");
    if (b.title && b.title.trim().length === 0) add(b.id, "warn", "Title is empty.");
    if (i > 0 && b.start < blocks[i - 1].start) add(b.id, "warn", "This block starts before the previous one.");
  });

  for (let i = 0; i < blocks.length; i += 1) {
    const a = blocks[i];
    for (let j = i + 1; j < blocks.length; j += 1) {
      const b = blocks[j];
      if (a.end <= b.start || b.end <= a.start) continue;
      add(a.id, "warn", "This block overlaps another block.");
      add(b.id, "warn", "This block overlaps another block.");
      break;
    }
  }

  return { errors, warns, byId, noTrade: !blocks.some((b) => b.type === "trade") };
}

function Icon({ name, size = 16 }) {
  const common = { width: size, height: size, display: "inline-block" };
  const paths = {
    back: "M15 18L9 12l6-6",
    moon: "M20 12.5A7.5 7.5 0 0 1 11.5 4a7.5 7.5 0 1 0 8.5 16.5 7.5 7.5 0 0 1 20 12.5Z",
    sun: "M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77M12 6.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 0 1 0-11Z",
    alert: "M12 4.5l8 14H4l8-14Zm0 5.5v3.5M12 17.5h.01",
    check: "M5 12.5 9.2 16.7 19 6.9",
    reset: "M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66",
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={common} aria-hidden="true">
      <path d={paths[name] || paths.alert} />
    </svg>
  );
}

function Timeline({ blocks }) {
  if (!blocks || !blocks.length) {
    return <div className="st-tl-empty">No blocks yet</div>;
  }
  const lo = Math.min(...blocks.map((b) => b.start));
  const hi = Math.max(...blocks.map((b) => b.end));
  const span = Math.max(1, hi - lo);

  return (
    <div className="st-tl" aria-label="Daily schedule timeline">
      <div className="st-tl-bar">
        {blocks.map((b) => (
          <span
            key={b.id}
            className="st-tl-seg"
            style={{
              left: `${((b.start - lo) / span) * 100}%`,
              width: `${((b.end - b.start) / span) * 100}%`,
              background: b.type === "prep" ? "var(--c-prep)" : b.type === "rest" ? "var(--c-rest)" : "var(--c-trade)",
            }}
          />
        ))}
      </div>
      <div className="st-tl-ticks">
        {blocks.map((b) => (
          <span key={b.id + "-tick"} style={{ left: `${((b.start - lo) / span) * 100}%` }}>{fmtT(b.start)}</span>
        ))}
      </div>
    </div>
  );
}

function InsertSlot({ open, onOpen, onClose, onPick, bottom = false }) {
  if (!open) {
    return (
      <div className="st-slot">
        <button type="button" className="st-slot-btn" onClick={onOpen} aria-label="Insert block">+</button>
      </div>
    );
  }

  return (
    <div className="st-slot open">
      <div className="st-slot-menu" role="menu" aria-label="Choose block type">
        {Object.keys(TYPE_META).map((key) => (
          <button key={key} type="button" className="st-chip" onClick={() => { onPick(key); onClose(); }}>
            {TYPE_META[key].emoji} {TYPE_META[key].label}
          </button>
        ))}
        <button type="button" className="st-chip ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function BlockCard({ b, issues, showNotes, showPicker, onUpdate, onNudge, onToggleNotes, onTogglePicker, onDuplicate, onDelete }) {
  return (
    <div className={`st-block ${b.type} ${issues.some((i) => i.level === "error") ? "err" : ""}`}>
      <div className="st-block-top">
        <button
          type="button"
          className="st-emoji"
          aria-label="Select block emoji"
          aria-expanded={showPicker}
          onClick={onTogglePicker}
        >
          {b.emoji || TYPE_META[b.type].emoji}
        </button>
        <input
          type="text"
          className="st-title"
          value={b.title}
          placeholder="Block title"
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
        <button type="button" className="st-iconbtn" onClick={onDuplicate} aria-label="Duplicate block">⧉</button>
        <button type="button" className="st-iconbtn danger" onClick={onDelete} aria-label="Delete block">✕</button>
      </div>

      {showPicker && (
        <div className="st-emoji-grid" role="grid" aria-label="Emoji picker">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={b.emoji === emoji ? "on" : ""}
              onClick={() => { onUpdate({ emoji }); onTogglePicker(); }}
              aria-label={`Use emoji ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="st-times">
        <label className="st-field">
          <span>Start</span>
          <input type="time" value={toTimeValue(b.start)} onChange={(e) => onUpdate({ start: fromTimeValue(e.target.value) ?? b.start })} />
        </label>
        <div className="st-arrow">→</div>
        <label className="st-field">
          <span>End</span>
          <input type="time" value={toTimeValue(b.end)} onChange={(e) => onUpdate({ end: fromTimeValue(e.target.value) ?? b.end })} />
        </label>
      </div>

      <div className="st-len">
        <span className="st-len-lbl">Length</span>
        <div className="st-stepper" aria-label={`Duration for ${b.title}`}>
          <button type="button" onClick={() => onNudge(-15)} aria-label="Shorten by 15 minutes">−15</button>
          <output className={b.end - b.start <= 0 ? "bad" : ""}>{fmtDur(b.end - b.start)}</output>
          <button type="button" onClick={() => onNudge(15)} aria-label="Lengthen by 15 minutes">+15</button>
        </div>
      </div>

      <div className="st-seg" role="segmentedcontrol" aria-label="Block type">
        {Object.keys(TYPE_META).map((key) => (
          <button
            key={key}
            type="button"
            className={b.type === key ? "on" : ""}
            onClick={() => onUpdate({ type: key })}
          >
            <i style={{ background: TYPE_META[key].color }} /> {TYPE_META[key].label}
          </button>
        ))}
      </div>

      <button type="button" className="st-notes-toggle" onClick={onToggleNotes}>
        {showNotes ? "Hide note" : "Add a note…"}
      </button>

      {showNotes && (
        <textarea
          className="st-desc"
          value={b.desc}
          placeholder="A short reminder shown while this block is live."
          aria-label="Block description"
          onChange={(e) => onUpdate({ desc: e.target.value })}
        />
      )}

      {issues.map((i, k) => (
        <div key={k} className={`st-issue ${i.level}`}>
          <Icon name="alert" size={14} /> {i.msg}
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ modal, onClose }) {
  if (!modal) return null;
  return (
    <div className="st-backdrop" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="st-modal-title">{modal.title}</div>
        <div className="st-modal-sub">{modal.body}</div>
        <div className="st-modal-actions">
          <button type="button" className="st-btn ghost" onClick={onClose}>{modal.cancelLabel || "Cancel"}</button>
          <button
            type="button"
            className={`st-btn ${modal.danger ? "danger" : "primary"}`}
            onClick={() => {
              modal.onConfirm?.();
              onClose();
            }}
          >
            {modal.confirmLabel || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// page
// =====================================================================
export default function Settings({ onBack } = {}) {
  const [theme, setTheme] = useState(() => readLS("td_theme", "dark"));
  const [saved, setSaved] = useState(() => loadScheduleDoc());
  const [draft, setDraft] = useState(() => loadScheduleDoc());
  const [ripple, setRipple] = useLocalStorageState("td_settings_ripple", true);
  const [notesOpen, setNotesOpen] = useState({});
  const [pickerFor, setPickerFor] = useState(null);
  const [insertAt, setInsertAt] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const fontLinkAdded = useRef(false);

  useEffect(() => {
    const sync = () => {
      const t = readLS("td_theme", "dark");
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const chooseTheme = (t) => {
    setTheme(t);
    writeLS("td_theme", t);
  };

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

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const previewDoc = useMemo(() => finalizeDoc(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(previewDoc) !== JSON.stringify(saved), [previewDoc, saved]);
  const check = useMemo(() => validate(draft.blocks), [draft.blocks]);
  const groups = useMemo(() => groupSchedule(previewDoc), [previewDoc]);
  const outOfOrder = draft.blocks.some((b, i) => i > 0 && b.start < draft.blocks[i - 1].start);

  const stats = useMemo(() => {
    const ok = draft.blocks.filter((b) => b.end > b.start);
    if (!ok.length) return null;
    const lo = Math.min(...ok.map((b) => b.start));
    const hi = Math.max(...ok.map((b) => b.end));
    const sum = (t) => ok.filter((b) => b.type === t).reduce((a, b) => a + (b.end - b.start), 0);
    return { lo, hi, span: hi - lo, trade: sum("trade"), rest: sum("rest"), count: draft.blocks.length };
  }, [draft.blocks]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateBlock = (id, patch) => {
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return d;
      const old = d.blocks[idx];
      const next = { ...old, ...patch };
      if (patch.type && patch.type !== old.type && (old.emoji === TYPE_META[old.type].emoji || !old.emoji)) {
        next.emoji = TYPE_META[patch.type].emoji;
      }
      let blocks = d.blocks.map((b) => (b.id === id ? next : b));
      if (ripple && patch.end !== undefined && patch.end !== old.end) {
        const delta = patch.end - old.end;
        blocks = blocks.map((b, i) => (i > idx ? { ...b, start: clampMin(b.start + delta), end: clampMin(b.end + delta) } : b));
      }
      return { ...d, blocks };
    });
  };

  const nudgeLength = (id, delta) => {
    const b = draft.blocks.find((x) => x.id === id);
    if (!b) return;
    updateBlock(id, { end: clampMin(Math.max(b.start + 5, b.end + delta)) });
  };

  const insertBlock = (index, type) => {
    const meta = TYPE_META[type];
    setDraft((d) => {
      const prev = index >= 0 ? d.blocks[index] : null;
      const nextB = d.blocks[index + 1];
      let start;
      if (prev) start = prev.end;
      else if (nextB) start = Math.max(0, nextB.start - meta.len);
      else start = M(9, 0);
      start = clampMin(start);
      const end = clampMin(Math.min(1439, start + meta.len));
      const fresh = { id: newId(), type, start, end, emoji: meta.emoji, title: meta.title, desc: "" };
      let blocks = d.blocks.slice();
      if (ripple && prev) {
        const len = end - start;
        blocks = blocks.map((b, i) => (i > index ? { ...b, start: clampMin(b.start + len), end: clampMin(b.end + len) } : b));
      }
      blocks.splice(index + 1, 0, fresh);
      return { ...d, blocks };
    });
    setInsertAt(null);
  };

  const duplicateBlock = (id) => {
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return d;
      const src = d.blocks[idx];
      const len = Math.max(5, src.end - src.start);
      const copy = { ...src, id: newId(), start: clampMin(src.end), end: clampMin(src.end + len) };
      let blocks = d.blocks.slice();
      if (ripple) {
        blocks = blocks.map((b, i) => (i > idx ? { ...b, start: clampMin(b.start + len), end: clampMin(b.end + len) } : b));
      }
      blocks.splice(idx + 1, 0, copy);
      return { ...d, blocks };
    });
  };

  const deleteBlock = (id) => {
    const idx = draft.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const removed = draft.blocks[idx];
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    showToast(`Deleted "${removed.title || "Untitled"}"`, () =>
      setDraft((d) => {
        const blocks = d.blocks.slice();
        blocks.splice(Math.min(idx, blocks.length), 0, removed);
        return { ...d, blocks };
      })
    );
  };

  const shiftAll = (delta) => {
    setDraft((d) => {
      if (!d.blocks.length) return d;
      const lo = Math.min(...d.blocks.map((b) => b.start));
      const hi = Math.max(...d.blocks.map((b) => b.end));
      const step = Math.max(-lo, Math.min(1439 - hi, delta));
      if (!step) return d;
      return {
        ...d,
        goalCheck: clampMin((Number.isFinite(d.goalCheck) ? d.goalCheck : DEFAULT_GOAL_CHECK) + step),
        blocks: d.blocks.map((b) => ({ ...b, start: b.start + step, end: b.end + step })),
      };
    });
  };

  const sortByTime = () => {
    setDraft((d) => ({ ...d, blocks: finalizeDoc(d).blocks }));
    showToast("Blocks sorted by start time");
  };

  const applyPreset = (p) => {
    const run = () => {
      const doc = makeDefaultDoc(p.shift, p.meal);
      setDraft((d) => ({ ...doc, titles: d.titles }));
      setNotesOpen({});
      setPickerFor(null);
      setInsertAt(null);
      showToast(`${p.name} layout loaded. Save to use it.`);
    };
    if (dirty) {
      setModal({
        title: `Load the ${p.name.toLowerCase()} layout?`,
        body: "This replaces the blocks you are editing. Nothing is saved until you press Save, and Discard brings your saved schedule back.",
        confirmLabel: "Load layout",
        onConfirm: run,
      });
    } else run();
  };

  const resetDefault = () =>
    setModal({
      title: "Restore the original routine?",
      body: "Your blocks, headings and check-in time go back to the app's original 10:30 to 17:00 day. Press Save afterwards to apply it.",
      confirmLabel: "Restore original",
      danger: true,
      onConfirm: () => {
        setDraft(makeDefaultDoc());
        setNotesOpen({});
        showToast("Original routine loaded. Save to use it.");
      },
    });

  const save = () => {
    if (check.errors > 0 || !draft.blocks.length) return;
    const clean = saveScheduleDoc(draft);
    setSaved(clean);
    setDraft(clean);
    showToast("Schedule saved");
  };

  const discard = () => {
    setDraft(saved);
    setNotesOpen({});
    showToast("Changes discarded");
  };

  const leave = () => {
    const go = () => (typeof onBack === "function" ? onBack() : window.history.back());
    if (dirty) {
      setModal({
        title: "Leave without saving?",
        body: "You have schedule changes that haven't been saved.",
        confirmLabel: "Leave",
        cancelLabel: "Keep editing",
        danger: true,
        onConfirm: go,
      });
    } else go();
  };

  const setTitle = (k, v) => setDraft((d) => ({ ...d, titles: { ...d.titles, [k]: v } }));

  const blocksEmpty = draft.blocks.length === 0;
  const saveDisabled = !dirty || check.errors > 0 || blocksEmpty;

  const statusText = blocksEmpty
    ? "Add at least one block"
    : check.errors > 0
    ? `${check.errors} ${check.errors === 1 ? "thing" : "things"} to fix`
    : dirty
    ? "Unsaved changes"
    : "All changes saved";

  return (
    <div className="st-root" data-theme={theme}>
      <style>{CSS}</style>

      <div className="st-wrap">
        <header className="st-head">
          <button type="button" className="st-back" onClick={leave} aria-label="Back to The Session">
            <Icon name="back" size={20} />
          </button>
          <div>
            <h1>Settings</h1>
            <p>Build the trading day around you</p>
          </div>
        </header>

        <section className="st-hero" aria-label="Your day at a glance">
          <div className="st-hero-kicker">Your trading day</div>
          {stats ? (
            <>
              <div className="st-hero-big">
                {fmtT(stats.lo)} <span>to</span> {fmtT(stats.hi)}
              </div>
              <div className="st-hero-sub">
                {fmtDur(stats.span)} window across {stats.count} {stats.count === 1 ? "block" : "blocks"}
              </div>
              <div className="st-chips">
                <span className="st-hchip">🎯 {fmtDur(stats.trade)} trading</span>
                <span className="st-hchip">☕ {fmtDur(stats.rest)} breaks</span>
              </div>
            </>
          ) : (
            <div className="st-hero-big small">No blocks yet</div>
          )}
          <Timeline blocks={draft.blocks} />
          <div className="st-legend" aria-hidden="true">
            {Object.keys(TYPE_META).map((t) => (
              <span key={t}>
                <i style={{ background: TYPE_META[t].color }} />
                {t === "prep" ? "Prep / review" : TYPE_META[t].label}
              </span>
            ))}
          </div>
        </section>

        <h2 className="st-h2">Start from a layout<span>One tap, then fine-tune below</span></h2>
        <div className="st-presets" role="list">
          {PRESETS.map((p) => {
            const b = buildBlocks(p.shift, p.meal);
            const range = fmtT(Math.min(...b.map((x) => x.start))) + " – " + fmtT(Math.max(...b.map((x) => x.end)));
            return (
              <button type="button" role="listitem" key={p.key} className="st-preset" onClick={() => applyPreset(p)}>
                <strong>{p.name}</strong>
                <span className="st-preset-range">{range}</span>
                <span className="st-preset-note">{p.note}</span>
              </button>
            );
          })}
        </div>

        <h2 className="st-h2">Your routine<span>Times, titles and block types</span></h2>

        <div className="st-glass st-tools">
          <div className="st-tool-row">
            <div className="st-tool-txt">
              <strong>Move everything after a change</strong>
              <span>When on, changing a block's end time pushes every block after it by the same amount.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ripple}
              aria-label="Move later blocks when a block's end time changes"
              className={`st-switch${ripple ? " on" : ""}`}
              onClick={() => setRipple((r) => !r)}
            />
          </div>
          <div className="st-tool-row stack">
            <div className="st-tool-txt">
              <strong>Shift the whole day</strong>
              <span>Slide every block earlier or later, keeping the gaps.</span>
            </div>
            <div className="st-shift">
              {[-60, -15, 15, 60].map((d) => (
                <button type="button" key={d} onClick={() => shiftAll(d)} disabled={blocksEmpty}>
                  {d > 0 ? "+" : "−"}
                  {Math.abs(d) === 60 ? "1h" : Math.abs(d) + "m"}
                </button>
              ))}
            </div>
          </div>
          {outOfOrder && (
            <div className="st-tool-row">
              <div className="st-tool-txt">
                <strong>Blocks are out of order</strong>
                <span>They sort themselves when you save, or you can sort them now.</span>
              </div>
              <button type="button" className="st-btn small" onClick={sortByTime}>Sort by time</button>
            </div>
          )}
        </div>

        {check.errors > 0 && (
          <div className="st-banner error" role="alert">
            <Icon name="alert" size={16} /> Fix {check.errors} {check.errors === 1 ? "issue" : "issues"} below before you can save.
          </div>
        )}
        {check.errors === 0 && check.warns > 0 && (
          <div className="st-banner warn">
            <Icon name="alert" size={16} /> Some blocks overlap. You can still save, but the app shows the earlier block as "now" while they overlap.
          </div>
        )}
        {check.noTrade && (
          <div className="st-banner warn">
            <Icon name="alert" size={16} /> No trading block yet. Set a block's type to Trading so P&L logging appears during it.
          </div>
        )}

        <div className="st-list">
          <InsertSlot open={insertAt === -1} onOpen={() => setInsertAt(-1)} onClose={() => setInsertAt(null)} onPick={(t) => insertBlock(-1, t)} />
          {draft.blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              <BlockCard
                b={b}
                issues={check.byId[b.id] || []}
                showNotes={!!notesOpen[b.id]}
                showPicker={pickerFor === b.id}
                onUpdate={(patch) => updateBlock(b.id, patch)}
                onNudge={(d) => nudgeLength(b.id, d)}
                onToggleNotes={() => setNotesOpen((n) => ({ ...n, [b.id]: !n[b.id] }))}
                onTogglePicker={() => setPickerFor((p) => (p === b.id ? null : b.id))}
                onDuplicate={() => duplicateBlock(b.id)}
                onDelete={() => deleteBlock(b.id)}
              />
              <InsertSlot bottom={i === draft.blocks.length - 1} open={insertAt === i} onOpen={() => setInsertAt(i)} onClose={() => setInsertAt(null)} onPick={(t) => insertBlock(i, t)} />
            </React.Fragment>
          ))}
          {blocksEmpty && (
            <div className="st-empty">
              <p>Your routine is empty. Add a block or load a layout above to get started.</p>
              <InsertSlot bottom open={insertAt === 0} onOpen={() => setInsertAt(0)} onClose={() => setInsertAt(null)} onPick={(t) => insertBlock(-1, t)} />
            </div>
          )}
        </div>

        <h2 className="st-h2">Headings and check-in<span>How the day is labelled</span></h2>
        <div className="st-glass st-card">
          <p className="st-card-note">
            Blocks before your first trading block form the first group, blocks after your last trading block form the last.
          </p>
          {[
            ["prep", "Before trading"],
            ["session", "During trading"],
            ["close", "After trading"],
          ].map(([k, hint]) => (
            <label className="st-field row" key={k}>
              <span>
                {hint}
                <em>{groups[k].length ? `${groupRange(groups[k])} · ${groups[k].length} ${groups[k].length === 1 ? "block" : "blocks"}` : "No blocks"}</em>
              </span>
              <input
                type="text"
                maxLength={24}
                value={draft.titles[k]}
                placeholder={DEFAULT_TITLES[k]}
                onChange={(e) => setTitle(k, e.target.value)}
              />
            </label>
          ))}
          <label className="st-field row">
            <span>
              Daily goal check-in
              <em>When the goal popup reviews your day</em>
            </span>
            <input
              type="time"
              step={300}
              value={toTimeValue(Number.isFinite(draft.goalCheck) ? draft.goalCheck : DEFAULT_GOAL_CHECK)}
              onChange={(e) => {
                const m = fromTimeValue(e.target.value);
                if (m !== null) setDraft((d) => ({ ...d, goalCheck: m }));
              }}
            />
          </label>
        </div>

        <h2 className="st-h2">Appearance</h2>
        <div className="st-glass st-card">
          <div className="st-theme" role="radiogroup" aria-label="Theme">
            {[
              ["dark", "Dark", "moon"],
              ["light", "Light", "sun"],
            ].map(([k, label, icon]) => (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={theme === k}
                className={theme === k ? "on" : ""}
                onClick={() => chooseTheme(k)}
              >
                <Icon name={icon} size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="st-reset">
          <button type="button" className="st-linkbtn" onClick={resetDefault}>
            <Icon name="reset" size={14} /> Restore the original routine
          </button>
        </div>
      </div>

      {toast && (
        <div className="st-toast" role="status" aria-live="polite">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <div className="st-savebar" role="region" aria-label="Save changes">
        <div className={`st-status${check.errors > 0 || blocksEmpty ? " bad" : dirty ? " dirty" : ""}`}>
          <span className="st-dot" aria-hidden="true" />
          {statusText}
        </div>
        {dirty && (
          <button type="button" className="st-btn ghost small" onClick={discard}>Discard</button>
        )}
        <button type="button" className="st-btn primary" onClick={save} disabled={saveDisabled}>
          {!dirty && !blocksEmpty ? <Icon name="check" size={16} /> : null} Save schedule
        </button>
      </div>

      <ConfirmModal modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}

function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));
  useEffect(() => {
    writeLS(key, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state]);
  return [state, setState];
}

const CSS = `
.st-root{
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
--hero:linear-gradient(155deg,#25356a 0%,#16224a 48%,#0a1028 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.16) inset,0 30px 60px -26px rgba(0,0,0,.95),0 0 40px -10px rgba(232,201,122,.12);
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--glow-amber:rgba(232,201,122,.30);
--dock-bg:rgba(11,16,32,.9);
--c-prep:#9cc4ff; --c-trade:#f6e0a2; --c-rest:#8dffc0;
--r-card:26px; --r-input:14px; --r-pill:999px;
color-scheme:dark;
padding-top:env(safe-area-inset-top,0px);
box-sizing:border-box;min-height:100vh;position:relative;
background:var(--bg-grad);background-attachment:fixed;
color:var(--text);font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;overflow-x:clip;max-width:100vw;
}
.st-root[data-theme="light"]{
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
--hero:linear-gradient(155deg,#2c5c9c 0%,#1b4180 50%,#10284f 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 28px 54px -24px rgba(16,40,90,.7);
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--modal-bg:#eef4ff;
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--glow-amber:rgba(233,169,42,.42);
--dock-bg:rgba(20,50,104,.92);
--c-prep:#2f6fc4; --c-trade:#e8a825; --c-rest:#0b8f50;
color-scheme:light;
}
.st-root::before{
content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:
radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);
}
.st-root *{box-sizing:border-box;}
.st-root button,.st-root input,.st-root textarea{font-family:inherit;}
.st-root ::selection{background:var(--amber);color:var(--on-accent);}
.st-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.st-wrap{position:relative;z-index:1;max-width:520px;margin:0 auto;padding:20px 18px 170px;}
.st-glass,.st-block,.st-tools{
background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
border:1px solid var(--border);box-shadow:var(--shadow-card);
}
.st-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
.st-head h1{margin:0;font-size:clamp(26px,6.4vw,32px);font-weight:800;letter-spacing:-.03em;line-height:1.05;}
.st-head p{margin:3px 0 0;font-size:12.5px;color:var(--muted);}
.st-root:not([data-theme="light"]) .st-head h1{background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;}
.st-back{flex-shrink:0;width:44px;height:44px;border-radius:50%;border:1px solid var(--border);background:var(--surface-2);color:var(--text);display:grid;place-items:center;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:border-color .18s ease;}
.st-back:hover{border-color:var(--amber);}
.st-hero{position:relative;overflow:hidden;padding:20px;border-radius:30px;border:1px solid rgba(255,255,255,.3);background:var(--hero);color:#fff;box-shadow:var(--hero-shadow);}
.st-hero::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(420px 220px at 100% -10%,rgba(255,255,255,.28),transparent 65%);}
.st-hero>*{position:relative;z-index:1;}
.st-root:not([data-theme="light"]) .st-hero{border-color:rgba(232,201,122,.30);}
.st-root:not([data-theme="light"]) .st-hero::after{background:radial-gradient(420px 220px at 100% -10%,rgba(232,201,122,.22),transparent 65%);}
.st-hero-kicker{font-size:13px;font-weight:500;color:rgba(255,255,255,.82);margin-bottom:8px;}
.st-hero-big{font-size:clamp(32px,9.5vw,44px);font-weight:700;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums;}
.st-hero-big span{font-size:.4em;font-weight:500;letter-spacing:0;color:rgba(255,255,255,.7);margin:0 .15em;}
.st-hero-big.small{font-size:26px;}
.st-hero-sub{font-size:13px;color:rgba(255,255,255,.85);margin-top:8px;}
.st-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 16px;}
.st-hchip{font-size:12px;font-weight:600;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);border-radius:var(--r-pill);padding:5px 11px;font-variant-numeric:tabular-nums;}
.st-tl{margin-top:4px;}
.st-tl-bar{position:relative;height:38px;border-radius:12px;background:rgba(255,255,255,.14);overflow:hidden;}
.st-tl-seg{position:absolute;top:5px;bottom:5px;border-radius:7px;transition:left .3s ease,width .3s ease;}
.st-tl-ticks{position:relative;height:18px;margin:6px 14px 0;}
.st-tl-ticks span{position:absolute;top:0;transform:translateX(-50%);font-size:10.5px;font-weight:600;color:rgba(255,255,255,.72);font-variant-numeric:tabular-nums;white-space:nowrap;}
.st-tl-empty{font-size:12.5px;color:rgba(255,255,255,.8);margin-top:12px;}
.st-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:11.5px;color:rgba(255,255,255,.82);font-weight:500;}
.st-legend span{display:inline-flex;align-items:center;gap:6px;}
.st-legend i{width:8px;height:8px;border-radius:50%;display:inline-block;}
.st-root[data-theme="light"] .st-hero .st-legend i,.st-root[data-theme="light"] .st-hero .st-tl-seg{filter:brightness(1.35) saturate(1.1);}
.st-h2{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;font-weight:700;font-size:19px;letter-spacing:-.02em;margin:34px 0 14px;padding:0 4px;}
.st-h2 span{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0;}
.st-presets{display:flex;gap:10px;overflow-x:auto;margin:0 -18px;padding:2px 18px 10px;scroll-snap-type:x proximity;scrollbar-width:none;}
.st-presets::-webkit-scrollbar{display:none;}
.st-preset{flex:0 0 auto;width:152px;scroll-snap-align:start;text-align:left;display:flex;flex-direction:column;gap:3px;padding:14px;border-radius:22px;border:1px solid var(--border);background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--shadow-card);color:var(--text);cursor:pointer;transition:border-color .18s ease,transform .18s ease;}
.st-preset:hover{border-color:var(--amber);transform:translateY(-1px);}
.st-preset strong{font-size:14.5px;font-weight:700;letter-spacing:-.01em;}
.st-preset-range{font-size:12.5px;font-weight:700;color:var(--accent-text);font-variant-numeric:tabular-nums;}
.st-preset-note{font-size:11.5px;color:var(--muted);line-height:1.35;}
.st-tools{border-radius:var(--r-card);padding:6px 16px;}
.st-tool-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid var(--border);}
.st-tool-row:last-child{border-bottom:none;}
.st-tool-row.stack{flex-direction:column;align-items:stretch;gap:10px;}
.st-tool-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}
.st-tool-txt strong{font-size:14px;font-weight:700;}
.st-tool-txt span{font-size:12px;color:var(--muted);line-height:1.4;}
.st-switch{position:relative;flex-shrink:0;width:48px;height:28px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);cursor:pointer;transition:background .2s ease,border-color .2s ease;}
.st-switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--muted);transition:transform .25s cubic-bezier(.3,1.3,.5,1),background .2s ease;}
.st-switch.on{border-color:var(--amber);background:var(--amber-dim);}
.st-switch.on::after{transform:translateX(20px);background:var(--btn);}
.st-shift{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.st-shift button{height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;transition:border-color .18s ease;}
.st-shift button:hover:not(:disabled){border-color:var(--amber);}
.st-shift button:disabled{opacity:.4;cursor:default;}
.st-banner{display:flex;align-items:flex-start;gap:9px;margin-top:12px;padding:12px 14px;border-radius:16px;font-size:12.5px;line-height:1.45;color:var(--text);}
.st-banner svg{flex-shrink:0;margin-top:1px;}
.st-banner.error{background:var(--rose-dim);border:1px solid var(--rose);}
.st-banner.warn{background:var(--warn-dim);border:1px solid var(--warn);}
.st-list{margin-top:6px;}
.st-block{position:relative;border-radius:22px;padding:14px;}
.st-block.prep{box-shadow:inset 3px 0 0 var(--c-prep),var(--shadow-card);}
.st-block.trade{box-shadow:inset 3px 0 0 var(--amber),var(--shadow-card);}
.st-block.rest{box-shadow:inset 3px 0 0 var(--teal),var(--shadow-card);}
.st-block.err{border-color:var(--rose);}
.st-block-top{display:flex;align-items:center;gap:8px;}
.st-emoji{flex-shrink:0;width:46px;height:46px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);font-size:22px;line-height:1;cursor:pointer;display:grid;place-items:center;transition:border-color .18s ease;}
.st-emoji:hover,.st-emoji[aria-expanded="true"]{border-color:var(--amber);}
.st-title{flex:1;min-width:0;height:46px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:0 12px;font-size:15px;font-weight:700;letter-spacing:-.01em;}
.st-title:focus,.st-desc:focus,.st-field input:focus{border-color:var(--amber);outline:none;}
.st-iconbtn{flex-shrink:0;width:38px;height:46px;border-radius:12px;border:1px solid transparent;background:none;color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:color .15s ease,background .15s ease;}
.st-iconbtn:hover{color:var(--text);background:var(--surface-2);}
.st-iconbtn.danger:hover{color:var(--rose);background:var(--rose-dim);}
.st-emoji-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:10px;padding:8px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border);animation:st-pop .18s ease;}
.st-emoji-grid button{aspect-ratio:1;border:1px solid transparent;border-radius:10px;background:none;font-size:18px;cursor:pointer;display:grid;place-items:center;padding:0;}
.st-emoji-grid button:hover{background:var(--amber-dim);}
.st-emoji-grid button.on{border-color:var(--amber);background:var(--amber-dim);}
@keyframes st-pop{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
.st-times{display:flex;align-items:flex-end;gap:8px;margin-top:12px;}
.st-arrow{padding-bottom:12px;color:var(--muted);}
.st-field{display:block;flex:1;min-width:0;}
.st-field>span{display:block;font-size:12px;font-weight:500;color:var(--muted);margin-bottom:6px;}
.st-field input[type=time],.st-field input[type=text]{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:10px 12px;font-size:15px;font-variant-numeric:tabular-nums;min-height:44px;}
.st-field input[type=text]{font-variant-numeric:normal;}
.st-len{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;}
.st-len-lbl{font-size:12px;color:var(--muted);font-weight:500;}
.st-stepper{display:flex;align-items:center;gap:4px;padding:3px;border-radius:var(--r-pill);background:var(--surface-2);border:1px solid var(--border);}
.st-stepper button{min-width:38px;height:32px;padding:0 6px;border:none;border-radius:var(--r-pill);background:none;color:var(--muted);font-size:12px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;}
.st-stepper button:hover{color:var(--text);background:var(--amber-dim);}
.st-stepper output{min-width:58px;text-align:center;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;}
.st-stepper output.bad{color:var(--rose);}
.st-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px;}
.st-seg button{display:flex;align-items:center;justify-content:center;gap:7px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:12.5px;font-weight:700;cursor:pointer;transition:all .18s ease;}
.st-seg button i{width:8px;height:8px;border-radius:50%;display:block;}
.st-seg button.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.st-seg button.on i{box-shadow:0 0 0 2px rgba(0,0,0,.18);}
.st-notes-toggle{display:block;width:100%;margin-top:12px;padding:0;border:none;background:none;text-align:left;color:var(--muted);font-size:12.5px;line-height:1.45;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px;}
.st-notes-toggle:hover{color:var(--text);}
.st-desc{display:block;width:100%;margin-top:8px;resize:vertical;min-height:66px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:10px 12px;font-size:13.5px;line-height:1.45;}
.st-issue{display:flex;align-items:center;gap:7px;margin-top:10px;font-size:12px;font-weight:600;}
.st-issue.error{color:var(--rose);}
.st-issue.warn{color:var(--warn);}
.st-slot{position:relative;display:flex;justify-content:center;align-items:center;min-height:28px;}
.st-slot::before{content:"";position:absolute;left:24px;right:24px;top:50%;height:1px;background:var(--border);}
.st-slot.open::before{display:none;}
.st-slot-btn{position:relative;width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--modal-bg);color:var(--muted);display:grid;place-items:center;cursor:pointer;padding:0;transition:all .18s ease;}
.st-slot-btn:hover{border-color:var(--amber);color:var(--text);transform:scale(1.12);}
.st-slot-menu{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:6px 0;animation:st-pop .18s ease;}
.st-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:12.5px;font-weight:700;cursor:pointer;transition:border-color .18s ease;}
.st-chip:hover{border-color:var(--amber);}
.st-chip.ghost{background:none;color:var(--muted);}
.st-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;padding:16px;border-radius:var(--r-card);border:1.5px dashed var(--border);background:var(--surface-2);color:var(--muted);font-size:13.5px;font-weight:700;cursor:pointer;transition:all .18s ease;}
.st-add:hover{border-color:var(--amber);color:var(--text);}
.st-empty{text-align:center;color:var(--muted);font-size:13px;padding:10px 0;}
.st-empty p{margin:0 0 6px;line-height:1.45;}
.st-card{border-radius:var(--r-card);padding:16px 18px;}
.st-card-note{margin:0 0 6px;font-size:12px;color:var(--muted);line-height:1.45;}
.st-field.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid var(--border);}
.st-field.row:last-of-type{border-bottom:none;padding-bottom:0;}
.st-field.row>span{flex:1;margin:0;font-size:14px;font-weight:700;color:var(--text);}
.st-field.row>span em{display:block;margin-top:2px;font-style:normal;font-size:11.5px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums;}
.st-field.row input{flex:0 0 150px;width:150px;}
.st-theme{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.st-theme button{display:flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:13.5px;font-weight:700;cursor:pointer;transition:all .18s ease;}
.st-theme button.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.st-reset{display:flex;justify-content:center;margin-top:28px;}
.st-linkbtn{display:inline-flex;align-items:center;gap:7px;border:none;background:none;color:var(--muted);font-size:12.5px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:6px;}
.st-linkbtn:hover{color:var(--text);}
.st-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:46px;padding:0 20px;border-radius:16px;border:1px solid transparent;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap;transition:transform .15s ease,opacity .15s ease;}
.st-btn:active:not(:disabled){transform:scale(.97);}
.st-btn.primary{background:var(--btn);color:var(--on-accent);box-shadow:0 10px 22px -12px var(--glow-amber);}
.st-btn.ghost{background:var(--surface-2);border-color:var(--border);color:var(--text);}
.st-btn.danger{background:var(--rose);color:#fff;}
.st-btn.small{height:38px;padding:0 14px;font-size:12.5px;border-radius:12px;background:var(--surface-2);border-color:var(--border);color:var(--text);}
.st-btn:disabled{opacity:.45;cursor:default;box-shadow:none;}
.st-savebar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:45;width:min(calc(100% - 28px),484px);display:flex;align-items:center;gap:8px;padding:8px 8px 8px 18px;border-radius:30px;background:var(--dock-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 22px 44px -16px rgba(2,10,30,.7);}
.st-root:not([data-theme="light"]) .st-savebar{border-color:rgba(232,201,122,.14);}
.st-status{flex:1;min-width:0;display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-root[data-theme="light"] .st-status{color:#c9d8f2;}
.st-dot{flex-shrink:0;width:9px;height:9px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 3px var(--teal-dim);}
.st-status.dirty{color:var(--text);}
.st-root[data-theme="light"] .st-status.dirty,.st-root[data-theme="light"] .st-status.bad{color:#fff;}
.st-status.dirty .st-dot{background:var(--amber);box-shadow:0 0 0 3px var(--amber-dim);}
.st-status.bad{color:var(--text);}
.st-status.bad .st-dot{background:var(--rose);box-shadow:0 0 0 3px var(--rose-dim);}
.st-savebar .st-btn{height:42px;border-radius:22px;padding:0 18px;}
.st-savebar .st-btn.ghost.small{padding:0 14px;}
.st-root[data-theme="light"] .st-savebar .st-btn.ghost{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.24);color:#fff;}
.st-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;align-items:center;gap:14px;max-width:calc(100vw - 36px);padding:11px 16px;border-radius:var(--r-pill);background:var(--modal-bg);border:1px solid var(--border);box-shadow:0 16px 36px -12px rgba(0,0,0,.6);font-size:13px;font-weight:600;color:var(--text);animation:st-pop .2s ease;}
.st-toast span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.st-toast button{flex-shrink:0;border:none;background:none;color:var(--accent-text);font-size:13px;font-weight:800;cursor:pointer;padding:0;}
.st-backdrop{position:fixed;inset:0;z-index:100;background:rgba(3,10,30,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:st-fade .2s ease;}
@media (min-width:640px){.st-backdrop{align-items:center;padding:20px;}}
@keyframes st-fade{from{opacity:0;}to{opacity:1;}}
.st-modal{width:100%;max-width:420px;background:var(--modal-bg);border:1px solid var(--border);border-radius:28px 28px 0 0;padding:24px 22px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.4);animation:st-up .25s ease;color:var(--text);}
@media (min-width:640px){.st-modal{border-radius:28px;padding:24px 26px;}}
@keyframes st-up{from{transform:translateY(24px);opacity:0;}to{transform:none;opacity:1;}}
.st-modal-title{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;}
.st-modal-sub{font-size:13px;color:var(--muted);margin-bottom:20px;line-height:1.5;}
.st-modal-actions{display:flex;gap:10px;}
.st-modal-actions .st-btn{flex:1;}
@media (max-width:420px){
.st-field.row{flex-direction:column;align-items:stretch;gap:8px;}
.st-field.row input{flex:none;width:100%;}
.st-emoji-grid{grid-template-columns:repeat(5,1fr);}
.st-stepper button{min-width:34px;}
.st-status{font-size:12px;}
}
@media (min-width:900px){.st-wrap{max-width:560px;}}
@media (prefers-reduced-motion:reduce){
.st-emoji-grid,.st-slot-menu,.st-toast,.st-backdrop,.st-modal{animation:none;}
.st-tl-seg,.st-switch,.st-switch::after{transition:none;}
}

/* =====================================================
v2: dashboard shell
===================================================== */
.st-root{
--sheet:linear-gradient(180deg,rgba(24,32,58,.62),rgba(9,13,26,.74));
--sheet-border:rgba(232,201,122,.12);
--nav-text:rgba(255,255,255,.72);
--ease:cubic-bezier(.22,1,.36,1);
--field-in:rgba(0,0,0,.20);
}
.st-root[data-theme="light"]{
--sheet:linear-gradient(180deg,rgba(255,255,255,.74),rgba(236,243,255,.56));
--sheet-border:rgba(255,255,255,.75);
--field-in:rgba(255,255,255,.72);
}

/* header */
.st-head{gap:16px;margin-bottom:22px;}
.st-head h1{font-size:clamp(28px,7vw,38px);}
.st-head p{font-size:13px;}

/* section headings: left aligned, with a gold kicker and hairline */
.st-h2{align-items:flex-start;text-align:left;gap:5px;margin:38px 0 16px;padding:26px 0 0;border-top:1px solid var(--border);font-size:22px;letter-spacing:-.025em;scroll-margin-top:84px;}
.st-h2::before{content:attr(data-k);font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text);}
.st-h2 span{font-size:12.5px;line-height:1.45;max-width:46ch;}

/* navigator: mobile = floating pill dock */
.st-shell{display:block;}
.st-main{min-width:0;}
.st-side{position:sticky;top:calc(8px + env(safe-area-inset-top,0px));z-index:30;margin:0 -18px 8px;padding:8px 18px;}
.st-nav{display:flex;gap:4px;width:max-content;max-width:100%;margin:0 auto;overflow-x:auto;padding:5px;border-radius:var(--r-pill);background:var(--dock-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,.12) inset,0 18px 36px -16px rgba(2,10,30,.7);scrollbar-width:none;}
.st-nav::-webkit-scrollbar{display:none;}
.st-nav-group{display:contents;}
.st-nav-label{display:none;}
.st-nav button{flex:0 0 auto;height:36px;padding:0 15px;border:none;border-radius:var(--r-pill);background:none;color:var(--nav-text);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .25s var(--ease),color .25s var(--ease);}
.st-nav button:hover{color:#fff;}
.st-nav button.on{background:var(--btn);color:var(--on-accent);}

/* polish: focus glow, rising blocks, hover */
.st-title:focus,.st-desc:focus,.st-field input:focus{box-shadow:0 0 0 3px var(--amber-dim);}
.st-block{animation:st-rise .45s var(--ease) both;transition:border-color .2s var(--ease);}
.st-block:hover{border-color:var(--amber-dim);}
@keyframes st-rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.st-preset{transition:border-color .2s var(--ease),transform .25s var(--ease),box-shadow .25s var(--ease);}
.st-preset:hover{box-shadow:0 18px 34px -18px var(--glow-amber),var(--shadow-card);}
.st-field.row input{flex:0 0 190px;width:190px;}
.st-savebar{width:min(calc(100% - 28px),540px);}

/* =====================================================
v2: desktop. sidebar + sheet
===================================================== */
@media (min-width:900px){
.st-wrap{max-width:1120px;padding:32px 28px 170px;}
.st-head{margin-bottom:28px;}
.st-shell{display:grid;grid-template-columns:224px minmax(0,1fr);gap:32px;align-items:start;}
.st-h2{scroll-margin-top:28px;}

/* left navigator */
.st-side{top:28px;margin:0;padding:0;}
.st-nav{flex-direction:column;gap:24px;width:auto;margin:0;overflow:visible;padding:0;border-radius:0;background:none;border:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
.st-nav-group{display:flex;flex-direction:column;gap:2px;}
.st-nav-label{display:block;padding:0 14px 8px;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.st-nav button{position:relative;height:42px;padding:0 14px;text-align:left;border-radius:14px;color:var(--muted);font-size:14px;}
.st-nav button:hover{color:var(--text);background:var(--surface-2);}
.st-nav button.on{background:var(--surface-2);color:var(--accent-text);}
.st-nav button.on::before{content:"";position:absolute;left:0;top:50%;width:3px;height:18px;margin-top:-9px;border-radius:3px;background:var(--amber);}

/* the sheet */
.st-main{padding:30px;border-radius:34px;background:var(--sheet);border:1px solid var(--sheet-border);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--shadow-card);}
.st-main .st-glass,.st-main .st-block{background:var(--surface-2);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;}
.st-main .st-block.prep{box-shadow:inset 3px 0 0 var(--c-prep);}
.st-main .st-block.trade{box-shadow:inset 3px 0 0 var(--amber);}
.st-main .st-block.rest{box-shadow:inset 3px 0 0 var(--teal);}
.st-main .st-title,.st-main .st-field input,.st-main .st-desc,.st-main .st-emoji,.st-main .st-stepper,.st-main .st-seg button,.st-main .st-shift button,.st-main .st-theme button,.st-main .st-switch:not(.on){background:var(--field-in);}
.st-main .st-seg button.on,.st-main .st-theme button.on{background:var(--btn);}
.st-main .st-add{background:none;}

/* hero: stats left, timeline right */
.st-hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);column-gap:36px;padding:28px;}
.st-hero>.st-hero-kicker,.st-hero>.st-hero-big,.st-hero>.st-hero-sub,.st-hero>.st-chips{grid-column:1;}
.st-hero>.st-tl{grid-column:2;grid-row:1 / span 4;align-self:center;margin:0;}
.st-hero>.st-tl-empty{grid-column:2;grid-row:1 / span 4;align-self:center;}
.st-hero>.st-legend{grid-column:2;grid-row:5;}
.st-hero-big{font-size:clamp(40px,4.4vw,54px);}
.st-chips{margin:16px 0 0;}
.st-tl-bar{height:52px;border-radius:16px;}

/* presets as a clean 5-up grid */
.st-presets{display:grid;grid-template-columns:repeat(5,1fr);overflow:visible;margin:0;padding:0;}
.st-preset{width:auto;}

/* each block on one tidy row of controls */
.st-block{display:grid;grid-template-columns:auto auto minmax(230px,1fr);column-gap:22px;align-items:end;padding:18px;}
.st-block>*{grid-column:1 / -1;}
.st-block>.st-times,.st-block>.st-len,.st-block>.st-seg{grid-column:auto;margin-top:14px;}
.st-len{flex-direction:column;align-items:flex-start;gap:6px;margin-top:14px;}
.st-len-lbl{font-size:12px;}
.st-field.row input{flex:0 0 220px;width:220px;}
.st-savebar{width:min(calc(100% - 28px),560px);}
}

@media (prefers-reduced-motion:reduce){
.st-block{animation:none;}
.st-preset,.st-nav button{transition:none;}
}
`;
