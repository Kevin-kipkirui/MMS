import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/**
 * <Settings />  ->  pages/Settings.jsx
 *
 * Lets the trader own their day. Every block of the routine (times, titles,
 * icons, descriptions, type) is editable, new blocks can be inserted anywhere,
 * and one tap loads a ready-made layout (early morning, evening, ...).
 *
 * The schedule is stored in localStorage under SCHEDULE_KEY. The named exports
 * below (loadScheduleDoc, groupSchedule, ...) are what <Session /> reads.
 *
 * Visual layer: Tailwind utility classes + the token sheet at the bottom.
 * Theme is shared with the rest of the app through "td_theme".
 */

// =====================================================================
// shared helpers (these exports are what Session.jsx imports)
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
    if (level === "error") errors++;
    else warns++;
  };
  blocks.forEach((b) => {
    if (!b.title.trim()) add(b.id, "error", "Give this block a title.");
    if (b.end <= b.start) add(b.id, "error", "End time must be after the start time.");
  });
  const ok = blocks
    .filter((b) => b.end > b.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < ok.length - 1; i++) {
    const a = ok[i];
    const n = ok[i + 1];
    if (a.end > n.start) {
      const by = a.end - n.start;
      add(a.id, "warn", `Overlaps "${n.title || "Untitled"}" by ${by} min.`);
      add(n.id, "warn", `Overlaps "${a.title || "Untitled"}" by ${by} min.`);
    }
  }
  return { byId, errors, warns, noTrade: blocks.length > 0 && !blocks.some((b) => b.type === "trade") };
}

function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));
  useEffect(() => {
    writeLS(key, state);
  }, [key, state]);
  return [state, setState];
}

// =====================================================================
// icons
// =====================================================================
const ICONS = {
  back: ["m15 18-6-6 6-6"],
  copy: ["M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
  plus: ["M12 5v14", "M5 12h14"],
  reset: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  check: ["M20 6 9 17l-5-5"],
  alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
};

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {ICONS[name].map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

// =====================================================================
// shared style kit (Tailwind classes that read the CSS variables below)
// =====================================================================
const cx = (...a) => a.filter(Boolean).join(" ");

const UI = {
  panel: "rounded-2xl border border-[color:var(--line)] bg-[var(--panel)] backdrop-blur-xl",
  field:
    "h-10 rounded-lg border border-[color:var(--line)] bg-[var(--field)] px-3 text-sm text-[color:var(--fg)] outline-none transition placeholder:text-[color:var(--dim)] hover:border-[color:var(--line-2)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--ring)]",
  label: "text-[10.5px] font-medium uppercase tracking-[.14em] text-[color:var(--dim)]",
  dim: "text-[color:var(--dim)]",
  btn: "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-40",
  primary: "bg-[var(--accent)] text-[color:var(--accent-ink)] hover:brightness-110",
  ghost: "border border-[color:var(--line)] bg-[var(--panel)] text-[color:var(--fg)] hover:border-[color:var(--line-2)]",
  danger: "bg-[var(--bad)] text-white hover:brightness-110",
  icon: "grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[color:var(--dim)] transition hover:bg-[var(--panel-2)] hover:text-[color:var(--fg)]",
  step: "st-mono h-8 min-w-[2.4rem] rounded-md px-1.5 text-xs font-medium text-[color:var(--dim)] transition hover:bg-[var(--panel-2)] hover:text-[color:var(--fg)]",
};

const SECTIONS = [
  { id: "st-overview", label: "Overview", group: "Your day" },
  { id: "st-layouts", label: "Layouts", group: "Your day" },
  { id: "st-routine", label: "Routine", group: "Your day" },
  { id: "st-headings", label: "Headings & check-in", group: "Setup" },
  { id: "st-appearance", label: "Appearance", group: "Setup" },
];

function SideNav({ active, onGo }) {
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  return (
    <div className="sticky top-0 z-30 -mx-5 border-b border-[color:var(--line)] bg-[var(--bg-glass)] px-5 py-2 backdrop-blur-xl lg:top-10 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <nav aria-label="Settings sections" className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-6 lg:overflow-visible">
        {groups.map((g) => (
          <div key={g} className="flex gap-1 lg:flex-col">
            <div className={cx(UI.label, "hidden px-3 pb-2 lg:block")}>{g}</div>
            {SECTIONS.filter((s) => s.group === g).map((s) => (
              <button
                type="button"
                key={s.id}
                aria-current={active === s.id ? "true" : undefined}
                onClick={() => onGo(s.id)}
                className={cx(
                  "h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-left text-sm transition",
                  active === s.id
                    ? "bg-[var(--panel-2)] font-medium text-[color:var(--fg)] lg:shadow-[inset_2px_0_0_var(--accent)]"
                    : "text-[color:var(--dim)] hover:text-[color:var(--fg)]"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

function Section({ id, kicker, title, sub, children }) {
  return (
    <section id={id} className="scroll-mt-20 pt-14 first:pt-0 lg:scroll-mt-10">
      <div className="mb-5">
        <div className="st-mono text-[11px] uppercase tracking-[.18em] text-[color:var(--accent)]">{kicker}</div>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{title}</h2>
        {sub && <p className={cx("mt-1 text-sm", UI.dim)}>{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Banner({ tone, children }) {
  const isErr = tone === "error";
  return (
    <div
      role={isErr ? "alert" : undefined}
      className={cx(
        "mt-3 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        isErr ? "border-[color:var(--bad-line)] bg-[var(--bad-bg)]" : "border-[color:var(--warn-line)] bg-[var(--warn-bg)]"
      )}
    >
      <span className={cx("mt-0.5 shrink-0", isErr ? "text-[color:var(--bad)]" : "text-[color:var(--warn)]")}>
        <Icon name="alert" size={16} />
      </span>
      <span>{children}</span>
    </div>
  );
}

// =====================================================================
// components
// =====================================================================
function Timeline({ blocks }) {
  const valid = blocks.filter((b) => b.end > b.start);
  if (!valid.length) return <div className={cx("text-sm", UI.dim)}>Add a block to see your day take shape.</div>;
  const lo = Math.floor(Math.min(...valid.map((b) => b.start)) / 60) * 60;
  const hi = Math.max(lo + 60, Math.ceil(Math.max(...valid.map((b) => b.end)) / 60) * 60);
  const span = hi - lo;
  const step = Math.max(1, Math.ceil(span / 60 / 6));
  const ticks = [];
  for (let m = lo; m <= hi; m += step * 60) ticks.push(m);
  const pct = (m) => ((m - lo) / span) * 100;
  return (
    <div role="img" aria-label="Visual timeline of your trading day">
      <div className="relative h-14 overflow-hidden rounded-xl border border-[color:var(--line)] bg-[var(--field)]">
        {valid.map((b) => (
          <span
            key={b.id}
            title={`${b.title || "Untitled"} · ${fmtT(b.start)}–${fmtT(b.end)}`}
            className="absolute inset-y-2 rounded-md transition-all duration-500"
            style={{
              left: `calc(${pct(b.start)}% + 1px)`,
              width: `calc(${((b.end - b.start) / span) * 100}% - 2px)`,
              background: `var(--c-${b.type})`,
              opacity: b.type === "rest" ? 0.4 : 0.92,
            }}
          />
        ))}
      </div>
      <div className="relative mx-3 mt-2 h-4" aria-hidden="true">
        {ticks.map((m) => (
          <span key={m} className={cx("st-mono absolute -translate-x-1/2 text-[10px]", UI.dim)} style={{ left: pct(m) + "%" }}>
            {pad(Math.floor(m / 60) % 24)}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({ modal, onClose }) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex animate-[st-fade_.2s_ease] items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="st-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-[st-up_.25s_ease] rounded-t-3xl border border-[color:var(--line-2)] bg-[var(--pop)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-[color:var(--fg)] shadow-2xl sm:rounded-3xl sm:pb-6"
      >
        <div id="st-modal-title" className="text-lg font-semibold tracking-tight">{modal.title}</div>
        <p className={cx("mb-6 mt-1.5 text-sm leading-relaxed", UI.dim)}>{modal.body}</p>
        <div className="flex gap-2">
          <button type="button" className={cx(UI.btn, UI.ghost, "flex-1")} onClick={onClose}>
            {modal.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            autoFocus
            className={cx(UI.btn, modal.danger ? UI.danger : UI.primary, "flex-1")}
            onClick={() => {
              modal.onConfirm();
              onClose();
            }}
          >
            {modal.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InsertSlot({ open, bottom, onOpen, onClose, onPick }) {
  if (open) {
    return (
      <div role="group" aria-label="Choose the kind of block to add" className="flex animate-[st-in_.2s_ease] flex-wrap justify-center gap-2 py-2">
        {["trade", "rest", "prep"].map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => onPick(t)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--line)] bg-[var(--panel)] px-4 text-xs font-medium transition hover:border-[color:var(--accent)]"
          >
            <span aria-hidden="true">{TYPE_META[t].emoji}</span>
            {t === "prep" ? "Prep / review" : TYPE_META[t].label}
          </button>
        ))}
        <button type="button" onClick={onClose} className={cx("h-9 rounded-full px-4 text-xs font-medium transition hover:text-[color:var(--fg)]", UI.dim)}>
          Cancel
        </button>
      </div>
    );
  }
  if (bottom) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          "mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--line-2)] text-sm font-medium transition hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]",
          UI.dim
        )}
      >
        <Icon name="plus" size={16} /> Add a block
      </button>
    );
  }
  return (
    <div className="group relative flex h-7 items-center justify-center">
      <span className="absolute inset-x-8 h-px bg-[var(--line)] opacity-0 transition group-hover:opacity-100" />
      <button
        type="button"
        onClick={onOpen}
        aria-label="Insert a block here"
        title="Insert a block here"
        className={cx(
          "relative grid h-5 w-5 place-items-center rounded-full border border-[color:var(--line-2)] bg-[var(--pop)] opacity-40 transition hover:scale-110 hover:border-[color:var(--accent)] group-hover:opacity-100",
          UI.dim
        )}
      >
        <Icon name="plus" size={11} />
      </button>
    </div>
  );
}

function BlockCard({ b, issues, showNotes, showPicker, onUpdate, onNudge, onToggleNotes, onTogglePicker, onDuplicate, onDelete }) {
  const hasErr = issues.some((i) => i.level === "error");
  const dur = b.end - b.start;
  return (
    <div
      className={cx(
        UI.panel,
        "relative animate-[st-in_.4s_cubic-bezier(.22,1,.36,1)_both] p-4 pl-5 transition hover:border-[color:var(--line-2)]",
        hasErr && "!border-[color:var(--bad)]"
      )}
    >
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `var(--c-${b.type})` }} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePicker}
          aria-expanded={showPicker}
          aria-label="Choose an icon for this block"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[color:var(--line)] bg-[var(--field)] text-xl leading-none transition hover:border-[color:var(--line-2)]"
        >
          {b.emoji || TYPE_META[b.type].emoji}
        </button>
        <input
          className={cx(UI.field, "min-w-0 flex-1 font-medium")}
          value={b.title}
          maxLength={40}
          placeholder="Block title"
          aria-label="Block title"
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
        <button type="button" className={UI.icon} onClick={onDuplicate} aria-label="Duplicate block" title="Duplicate">
          <Icon name="copy" size={16} />
        </button>
        <button
          type="button"
          className={cx(UI.icon, "hover:!bg-[var(--bad-bg)] hover:!text-[color:var(--bad)]")}
          onClick={onDelete}
          aria-label="Delete block"
          title="Delete"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>

      {showPicker && (
        <div role="listbox" aria-label="Icons" className="mt-3 grid animate-[st-in_.18s_ease] grid-cols-5 gap-1 rounded-xl border border-[color:var(--line)] bg-[var(--field)] p-2 sm:grid-cols-10">
          {EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              role="option"
              aria-selected={b.emoji === em}
              onClick={() => {
                onUpdate({ emoji: em });
                onTogglePicker();
              }}
              className={cx(
                "grid aspect-square place-items-center rounded-lg border text-lg transition hover:bg-[var(--panel-2)]",
                b.emoji === em ? "border-[color:var(--accent)] bg-[var(--panel-2)]" : "border-transparent"
              )}
            >
              {em}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="flex items-end gap-2">
          <label className="block">
            <span className={UI.label}>Starts</span>
            <input
              type="time"
              step={300}
              value={toTimeValue(b.start)}
              className={cx(UI.field, "st-mono mt-1.5 block w-[7.6rem]")}
              onChange={(e) => {
                const m = fromTimeValue(e.target.value);
                if (m !== null) onUpdate({ start: m });
              }}
            />
          </label>
          <span className={cx("pb-2.5", UI.dim)} aria-hidden="true">→</span>
          <label className="block">
            <span className={UI.label}>Ends</span>
            <input
              type="time"
              step={300}
              value={toTimeValue(b.end)}
              className={cx(UI.field, "st-mono mt-1.5 block w-[7.6rem]")}
              onChange={(e) => {
                const m = fromTimeValue(e.target.value);
                if (m !== null) onUpdate({ end: m });
              }}
            />
          </label>
        </div>

        <div>
          <span className={UI.label}>Length</span>
          <div className="mt-1.5 flex h-10 items-center rounded-lg border border-[color:var(--line)] bg-[var(--field)] p-0.5">
            {[-15, -5].map((d) => (
              <button type="button" key={d} className={UI.step} onClick={() => onNudge(d)} aria-label={`Shorten by ${-d} minutes`}>
                −{-d}
              </button>
            ))}
            <output className={cx("st-mono min-w-[3.6rem] text-center text-sm font-medium", dur <= 0 && "text-[color:var(--bad)]")}>
              {dur > 0 ? fmtDur(dur) : "—"}
            </output>
            {[5, 15].map((d) => (
              <button type="button" key={d} className={UI.step} onClick={() => onNudge(d)} aria-label={`Extend by ${d} minutes`}>
                +{d}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-[15rem] flex-1">
          <span className={UI.label}>Type</span>
          <div role="radiogroup" aria-label="Block type" className="mt-1.5 grid h-10 grid-cols-3 gap-0.5 rounded-lg border border-[color:var(--line)] bg-[var(--field)] p-0.5">
            {Object.keys(TYPE_META).map((t) => (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={b.type === t}
                onClick={() => onUpdate({ type: t })}
                className={cx(
                  "flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition",
                  b.type === t
                    ? "bg-[var(--panel-2)] text-[color:var(--fg)] shadow-[inset_0_0_0_1px_var(--line-2)]"
                    : "text-[color:var(--dim)] hover:text-[color:var(--fg)]"
                )}
              >
                <i className="block h-1.5 w-1.5 rounded-full" style={{ background: `var(--c-${t})` }} aria-hidden="true" />
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleNotes}
        aria-expanded={showNotes}
        className={cx("mt-4 block w-full truncate text-left text-xs underline decoration-[color:var(--line-2)] underline-offset-4 transition hover:text-[color:var(--fg)]", UI.dim)}
      >
        {showNotes ? "Hide description" : b.desc ? b.desc : "Add a description"}
      </button>
      {showNotes && (
        <textarea
          className={cx(UI.field, "mt-2 block min-h-[72px] w-full resize-y py-2.5 leading-relaxed")}
          rows={3}
          maxLength={220}
          value={b.desc}
          placeholder="A short reminder shown while this block is live."
          aria-label="Block description"
          onChange={(e) => onUpdate({ desc: e.target.value })}
        />
      )}

      {issues.map((i, k) => (
        <div
          key={k}
          className={cx("mt-3 flex items-center gap-1.5 text-xs font-medium", i.level === "error" ? "text-[color:var(--bad)]" : "text-[color:var(--warn)]")}
        >
          <Icon name="alert" size={14} /> {i.msg}
        </div>
      ))}
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
  const [insertAt, setInsertAt] = useState(null); // -1 = before first block
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const fontLinkAdded = useRef(false);

  // share the theme with the rest of the app
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

  // fonts: Inter for text, JetBrains Mono for times
  useEffect(() => {
    if (fontLinkAdded.current || typeof document === "undefined") return;
    fontLinkAdded.current = true;
    if (!document.getElementById("st-font-link")) {
      const link = document.createElement("link");
      link.id = "st-font-link";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // which section is in view (drives the navigator highlight)
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const onScroll = () => {
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) cur = s.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(id);
  };

  const showToast = useCallback((msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  // ---------- derived ----------
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

  // ---------- draft mutations ----------
  const updateBlock = (id, patch) => {
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return d;
      const old = d.blocks[idx];
      const next = { ...old, ...patch };
      if (patch.type && patch.type !== old.type && (old.emoji === TYPE_META[old.type].emoji || !old.emoji)) {
        next.emoji = TYPE_META[patch.type].emoji; // keep the default icon in step with the type
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

      <div className="relative z-10 mx-auto max-w-5xl px-5 pb-44 pt-6 lg:pt-10">
        <header className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={leave}
            aria-label="Back to The Session"
            className="grid h-10 w-10 place-items-center rounded-full border border-[color:var(--line)] bg-[var(--panel)] transition hover:border-[color:var(--line-2)] hover:bg-[var(--panel-2)]"
          >
            <Icon name="back" size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
            <p className={cx("text-sm", UI.dim)}>Build the trading day around you</p>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14">
          <aside className="contents lg:block">
            <SideNav active={active} onGo={goTo} />
          </aside>

          <main className="min-w-0">
            {/* ---------- overview ---------- */}
            <Section id="st-overview" kicker="01 / Overview" title="Your trading day" sub="Everything below updates this view live.">
              <div className={cx(UI.panel, "p-5 sm:p-6")}>
                {stats ? (
                  <div className="grid gap-6 md:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] md:items-center">
                    <div>
                      <div className="st-mono text-4xl font-medium tracking-tight sm:text-5xl">
                        {fmtT(stats.lo)}
                        <span className={cx("mx-2 text-xl", UI.dim)}>→</span>
                        {fmtT(stats.hi)}
                      </div>
                      <p className={cx("mt-2 text-sm", UI.dim)}>
                        {fmtDur(stats.span)} window · {stats.count} {stats.count === 1 ? "block" : "blocks"}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="st-mono rounded-full border border-[color:var(--line)] px-3 py-1 text-xs">
                          <i className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--c-trade)]" />
                          {fmtDur(stats.trade)} trading
                        </span>
                        <span className="st-mono rounded-full border border-[color:var(--line)] px-3 py-1 text-xs">
                          <i className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--c-rest)]" />
                          {fmtDur(stats.rest)} breaks
                        </span>
                      </div>
                    </div>
                    <div>
                      <Timeline blocks={draft.blocks} />
                      <div className={cx("mt-3 flex flex-wrap gap-4 text-[11px]", UI.dim)} aria-hidden="true">
                        {Object.keys(TYPE_META).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1.5">
                            <i className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--c-${t})` }} />
                            {t === "prep" ? "Prep / review" : TYPE_META[t].label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-lg font-medium">No blocks yet</div>
                )}
              </div>
            </Section>

            {/* ---------- layouts ---------- */}
            <Section id="st-layouts" kicker="02 / Layouts" title="Start from a layout" sub="One tap, then fine-tune below.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="list">
                {PRESETS.map((p) => {
                  const bl = buildBlocks(p.shift, p.meal);
                  const range = fmtT(Math.min(...bl.map((x) => x.start))) + " – " + fmtT(Math.max(...bl.map((x) => x.end)));
                  return (
                    <button
                      type="button"
                      role="listitem"
                      key={p.key}
                      onClick={() => applyPreset(p)}
                      className={cx(UI.panel, "flex flex-col gap-1 p-4 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--line-2)] hover:bg-[var(--panel-2)]")}
                    >
                      <span className="text-sm font-semibold">{p.name}</span>
                      <span className="st-mono text-xs text-[color:var(--accent)]">{range}</span>
                      <span className={cx("text-xs", UI.dim)}>{p.note}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ---------- routine ---------- */}
            <Section id="st-routine" kicker="03 / Routine" title="Your routine" sub="Times, titles and block types. Every block is yours to shape.">
              <div className={cx(UI.panel, "divide-y divide-[color:var(--line)] px-5")}>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Move everything after a change</div>
                    <p className={cx("mt-0.5 text-xs leading-relaxed", UI.dim)}>
                      When on, changing a block's end time pushes every block after it by the same amount.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ripple}
                    aria-label="Move later blocks when a block's end time changes"
                    onClick={() => setRipple((r) => !r)}
                    className={cx(
                      "relative h-6 w-11 shrink-0 rounded-full border transition",
                      ripple ? "border-transparent bg-[var(--accent)]" : "border-[color:var(--line-2)] bg-[var(--panel-2)]"
                    )}
                  >
                    <span
                      className={cx(
                        "absolute left-[3px] top-[3px] h-4 w-4 rounded-full transition-transform duration-300",
                        ripple ? "translate-x-5 bg-[var(--accent-ink)]" : "bg-[var(--dim)]"
                      )}
                    />
                  </button>
                </div>

                <div className="py-4">
                  <div className="text-sm font-medium">Shift the whole day</div>
                  <p className={cx("mb-3 mt-0.5 text-xs", UI.dim)}>Slide every block earlier or later, keeping the gaps.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[-60, -15, 15, 60].map((d) => (
                      <button type="button" key={d} onClick={() => shiftAll(d)} disabled={blocksEmpty} className={cx(UI.btn, UI.ghost, "st-mono !px-0")}>
                        {d > 0 ? "+" : "−"}
                        {Math.abs(d) === 60 ? "1h" : Math.abs(d) + "m"}
                      </button>
                    ))}
                  </div>
                </div>

                {outOfOrder && (
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <div className="text-sm font-medium">Blocks are out of order</div>
                      <p className={cx("mt-0.5 text-xs", UI.dim)}>They sort themselves when you save, or sort them now.</p>
                    </div>
                    <button type="button" className={cx(UI.btn, UI.ghost)} onClick={sortByTime}>
                      Sort by time
                    </button>
                  </div>
                )}
              </div>

              {check.errors > 0 && (
                <Banner tone="error">
                  Fix {check.errors} {check.errors === 1 ? "issue" : "issues"} below before you can save.
                </Banner>
              )}
              {check.errors === 0 && check.warns > 0 && (
                <Banner tone="warn">Some blocks overlap. You can still save, but the app shows the earlier block as "now" while they overlap.</Banner>
              )}
              {check.noTrade && (
                <Banner tone="warn">No trading block yet. Set a block's type to Trading so P&L logging appears during it.</Banner>
              )}

              <div className="mt-5">
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
                    <InsertSlot
                      bottom={i === draft.blocks.length - 1}
                      open={insertAt === i}
                      onOpen={() => setInsertAt(i)}
                      onClose={() => setInsertAt(null)}
                      onPick={(t) => insertBlock(i, t)}
                    />
                  </React.Fragment>
                ))}
                {blocksEmpty && (
                  <div className={cx("py-4 text-center text-sm", UI.dim)}>
                    <p className="mb-3">Your routine is empty. Add a block or load a layout above to get started.</p>
                    <InsertSlot bottom open={insertAt === 0} onOpen={() => setInsertAt(0)} onClose={() => setInsertAt(null)} onPick={(t) => insertBlock(-1, t)} />
                  </div>
                )}
              </div>
            </Section>

            {/* ---------- headings ---------- */}
            <Section id="st-headings" kicker="04 / Setup" title="Headings and check-in" sub="Blocks before your first trading block form the first group, blocks after your last form the last.">
              <div className={cx(UI.panel, "divide-y divide-[color:var(--line)] px-5")}>
                {[
                  ["prep", "Before trading"],
                  ["session", "During trading"],
                  ["close", "After trading"],
                ].map(([k, hint]) => (
                  <label key={k} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <span className="text-sm font-medium">
                      {hint}
                      <em className={cx("st-mono mt-0.5 block text-[11px] font-normal not-italic", UI.dim)}>
                        {groups[k].length ? `${groupRange(groups[k])} · ${groups[k].length} ${groups[k].length === 1 ? "block" : "blocks"}` : "No blocks"}
                      </em>
                    </span>
                    <input
                      type="text"
                      maxLength={24}
                      value={draft.titles[k]}
                      placeholder={DEFAULT_TITLES[k]}
                      className={cx(UI.field, "w-full sm:w-60")}
                      onChange={(e) => setTitle(k, e.target.value)}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <span className="text-sm font-medium">
                    Daily goal check-in
                    <em className={cx("mt-0.5 block text-[11px] font-normal not-italic", UI.dim)}>When the goal popup reviews your day</em>
                  </span>
                  <input
                    type="time"
                    step={300}
                    value={toTimeValue(Number.isFinite(draft.goalCheck) ? draft.goalCheck : DEFAULT_GOAL_CHECK)}
                    className={cx(UI.field, "st-mono w-full sm:w-60")}
                    onChange={(e) => {
                      const m = fromTimeValue(e.target.value);
                      if (m !== null) setDraft((d) => ({ ...d, goalCheck: m }));
                    }}
                  />
                </label>
              </div>
            </Section>

            {/* ---------- appearance ---------- */}
            <Section id="st-appearance" kicker="05 / Setup" title="Appearance" sub="Choose the look that suits your screen.">
              <div role="radiogroup" aria-label="Theme" className="grid max-w-sm grid-cols-2 gap-2">
                {[
                  ["dark", "Dark", "moon"],
                  ["light", "Light", "sun"],
                ].map(([k, label, icon]) => (
                  <button
                    type="button"
                    key={k}
                    role="radio"
                    aria-checked={theme === k}
                    onClick={() => chooseTheme(k)}
                    className={cx(
                      UI.panel,
                      "flex h-12 items-center justify-center gap-2 text-sm font-medium transition",
                      theme === k
                        ? "!border-[color:var(--accent)] text-[color:var(--fg)] shadow-[0_0_0_4px_var(--ring)]"
                        : "text-[color:var(--dim)] hover:border-[color:var(--line-2)] hover:text-[color:var(--fg)]"
                    )}
                  >
                    <Icon name={icon} size={16} /> {label}
                  </button>
                ))}
              </div>

              <div className="mt-12 flex">
                <button
                  type="button"
                  onClick={resetDefault}
                  className={cx("inline-flex items-center gap-2 text-xs underline underline-offset-4 transition hover:text-[color:var(--fg)]", UI.dim)}
                >
                  <Icon name="reset" size={14} /> Restore the original routine
                </button>
              </div>
            </Section>
          </main>
        </div>
      </div>

      {/* ---------- toast ---------- */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex max-w-[calc(100vw-36px)] -translate-x-1/2 animate-[st-in_.2s_ease] items-center gap-4 rounded-full border border-[color:var(--line-2)] bg-[var(--pop)] px-4 py-2.5 text-sm shadow-2xl"
        >
          <span className="truncate">{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              className="shrink-0 font-semibold text-[color:var(--accent)]"
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

      {/* ---------- save bar ---------- */}
      <div
        role="region"
        aria-label="Save changes"
        className="fixed bottom-[calc(14px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 flex w-[min(calc(100%-28px),560px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[color:var(--line-2)] bg-[var(--bar)] p-2 pl-4 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
          <span
            aria-hidden="true"
            className={cx(
              "h-2 w-2 shrink-0 rounded-full",
              check.errors > 0 || blocksEmpty ? "bg-[var(--bad)]" : dirty ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--ok)]"
            )}
          />
          <span className="truncate font-medium">{statusText}</span>
        </div>
        {dirty && (
          <button type="button" className={cx(UI.btn, UI.ghost, "!h-9")} onClick={discard}>
            Discard
          </button>
        )}
        <button type="button" className={cx(UI.btn, UI.primary, "!h-9")} onClick={save} disabled={saveDisabled}>
          {!dirty && !blocksEmpty ? <Icon name="check" size={16} /> : null} Save schedule
        </button>
      </div>

      <ConfirmModal modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}

// =====================================================================
// token sheet: defines every CSS variable the Tailwind classes above read
// =====================================================================
const CSS = `
.st-root{
--bg:#07080b;--bg-glass:rgba(7,8,11,.82);--pop:#0d0f14;--bar:rgba(13,15,20,.84);
--panel:rgba(255,255,255,.03);--panel-2:rgba(255,255,255,.065);--field:rgba(0,0,0,.28);
--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.18);
--fg:#ececf1;--dim:#7f8594;
--accent:#7ce8ff;--accent-ink:#021218;--ring:rgba(124,232,255,.16);
--ok:#7cf0b4;--bad:#ff6b7d;--bad-line:rgba(255,107,125,.4);--bad-bg:rgba(255,107,125,.08);
--warn:#f5b85c;--warn-line:rgba(245,184,92,.4);--warn-bg:rgba(245,184,92,.08);
--c-prep:#a5b4fc;--c-trade:#7ce8ff;--c-rest:#86efac;
--glow:rgba(124,232,255,.10);--grid:rgba(255,255,255,.035);
color-scheme:dark;
position:relative;min-height:100vh;overflow-x:clip;
background:var(--bg);color:var(--fg);
font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;
padding-top:env(safe-area-inset-top,0px);
}
.st-root[data-theme="light"]{
--bg:#f5f6f8;--bg-glass:rgba(245,246,248,.85);--pop:#ffffff;--bar:rgba(255,255,255,.88);
--panel:rgba(255,255,255,.72);--panel-2:rgba(10,20,40,.05);--field:#ffffff;
--line:rgba(10,20,40,.10);--line-2:rgba(10,20,40,.22);
--fg:#0b0d12;--dim:#677085;
--accent:#0a6cff;--accent-ink:#ffffff;--ring:rgba(10,108,255,.16);
--ok:#0b9a5b;--bad:#d93a4c;--bad-line:rgba(217,58,76,.4);--bad-bg:rgba(217,58,76,.07);
--warn:#b86e0a;--warn-line:rgba(184,110,10,.4);--warn-bg:rgba(184,110,10,.08);
--c-prep:#6366f1;--c-trade:#0a6cff;--c-rest:#12a36b;
--glow:rgba(10,108,255,.08);--grid:rgba(10,20,40,.05);
color-scheme:light;
}
.st-root::before{
content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:
radial-gradient(900px 480px at 50% -8%,var(--glow),transparent 70%),
linear-gradient(var(--grid) 1px,transparent 1px) 0 0/48px 48px,
linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/48px 48px;
-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000 25%,transparent 78%);
mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000 25%,transparent 78%);
}
.st-root *{box-sizing:border-box;}
.st-root button,.st-root input,.st-root textarea{font-family:inherit;}
.st-root button{cursor:pointer;}
.st-root ::selection{background:var(--accent);color:var(--accent-ink);}
.st-root :focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.st-root input[type=time]{color-scheme:inherit;}
.st-root[data-theme="dark"] input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.65);}
.st-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace;font-variant-numeric:tabular-nums;}
@keyframes st-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes st-up{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:none;}}
@keyframes st-fade{from{opacity:0;}to{opacity:1;}}
@media (prefers-reduced-motion:reduce){.st-root *{animation:none !important;transition:none !important;}}
`;