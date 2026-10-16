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

const CSS = `.st-root{ --bg:#07080b;--bg-glass:rgba(7,8,11,.82);--pop:#0d0f14;--bar:rgba(13,15,20,.84); --panel:rgba(255,255,255,.03);--panel-2:rgba(255,255,255,.065);--field:rgba(0,0,0,.28); --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.18); --fg:#ececf1;--dim:#7f8594; --accent:#7ce8ff;--accent-ink:#021218;--ring:rgba(124,232,255,.16); --ok:#7cf0b4;--bad:#ff6b7d;--bad-line:rgba(255,107,125,.4);--bad-bg:rgba(255,107,125,.08); --warn:#f5b85c;--warn-line:rgba(245,184,92,.4);--warn-bg:rgba(245,184,92,.08); --c-prep:#a5b4fc;--c-trade:#7ce8ff;--c-rest:#86efac; --glow:rgba(124,232,255,.10);--grid:rgba(255,255,255,.035); color-scheme:dark; position:relative;min-height:100vh;overflow-x:clip; background:var(--bg);color:var(--fg); font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased; padding-top:env(safe-area-inset-top,0px); } .st-root[data-theme="light"]{ --bg:#f5f6f8;--bg-glass:rgba(245,246,248,.85);--pop:#ffffff;--bar:rgba(255,255,255,.88); --panel:rgba(255,255,255,.72);--panel-2:rgba(10,20,40,.05);--field:#ffffff; --line:rgba(10,20,40,.10);--line-2:rgba(10,20,40,.22); --fg:#0b0d12;--dim:#677085; --accent:#0a6cff;--accent-ink:#ffffff;--ring:rgba(10,108,255,.16); --ok:#0b9a5b;--bad:#d93a4c;--bad-line:rgba(217,58,76,.4);--bad-bg:rgba(217,58,76,.07); --warn:#b86e0a;--warn-line:rgba(184,110,10,.4);--warn-bg:rgba(184,110,10,.08); --c-prep:#6366f1;--c-trade:#0a6cff;--c-rest:#12a36b; --glow:rgba(10,108,255,.08);--grid:rgba(10,20,40,.05); color-scheme:light; } .st-root::before{ content:"";position:fixed;inset:0;pointer-events:none;z-index:0; background: radial-gradient(900px 480px at 50% -8%,var(--glow),transparent 70%), linear-gradient(var(--grid) 1px,transparent 1px) 0 0/48px 48px, linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/48px 48px; -webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000 25%,transparent 78%); mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000 25%,transparent 78%); } .st-root *{box-sizing:border-box;} .st-root button,.st-root input,.st-root textarea{font-family:inherit;} .st-root button{cursor:pointer;} .st-root ::selection{background:var(--accent);color:var(--accent-ink);} .st-root :focus-visible{outline:2px solid var(--accent);outline-offset:2px;} .st-root input[type=time]{color-scheme:inherit;} .st-root[data-theme="dark"] input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.65);} .st-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace;font-variant-numeric:tabular-nums;} @keyframes st-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}} @keyframes st-up{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:none;}} @keyframes st-fade{from{opacity:0;}to{opacity:1;}} @media (prefers-reduced-motion:reduce){.st-root *{animation:none !important;transition:none !important;}}`;

