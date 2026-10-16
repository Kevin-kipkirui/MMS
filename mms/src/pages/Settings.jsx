import React from "react";

const M = (h, m) => h * 60 + m;
const clampMin = (n) => Math.max(0, Math.min(1439, Math.round(n)));
const pad = (n) => String(n).padStart(2, "0");

export const SCHEDULE_KEY = "td_schedule";
export const SCHEDULE_EVENT = "td-schedule-change";
export const DEFAULT_GOAL_CHECK = M(16, 30);

const DEFAULT_TITLES = { prep: "Preparation", session: "The window", close: "Wrap-up" };

const BASE_BLOCKS = [
  { id: "review", type: "prep", start: M(10, 30), end: M(10, 45), emoji: "📓", title: "Previous Day Review" },
  { id: "premarket", type: "prep", start: M(10, 45), end: M(11, 0), emoji: "🧭", title: "Pre-Market Preparation" },
  { id: "t1", type: "trade", start: M(11, 0), end: M(12, 15), emoji: "🎯", title: "Trading Block 1" },
  { id: "b1", type: "rest", start: M(12, 15), end: M(12, 30), emoji: "☕", title: "Break" },
  { id: "t2", type: "trade", start: M(12, 30), end: M(13, 30), emoji: "🎯", title: "Trading Block 2" },
  { id: "lunch", type: "rest", start: M(13, 30), end: M(14, 0), emoji: "🍽️", title: "Lunch + Break" },
  { id: "t3", type: "trade", start: M(14, 0), end: M(15, 0), emoji: "🎯", title: "Trading Block 3" },
  { id: "b2", type: "rest", start: M(15, 0), end: M(15, 15), emoji: "🚶", title: "Break" },
  { id: "t4", type: "trade", start: M(15, 15), end: M(16, 15), emoji: "🎯", title: "Trading Block 4" },
  { id: "b3", type: "rest", start: M(16, 15), end: M(16, 30), emoji: "☕", title: "Break" },
  { id: "tfinal", type: "trade", start: M(16, 30), end: M(16, 50), emoji: "🎯", title: "Final Trading Block" },
  { id: "eod", type: "prep", start: M(16, 50), end: M(17, 0), emoji: "📊", title: "End-of-Day Review" },
];

export function finalizeDoc(doc = {}) {
  const blocks = (Array.isArray(doc.blocks) ? doc.blocks : BASE_BLOCKS).map((b) => ({
    id: b.id || `b-${Math.random().toString(36).slice(2, 8)}`,
    type: b.type || "prep",
    start: clampMin(Number(b.start) || 0),
    end: clampMin(Number(b.end) || 0),
    emoji: b.emoji || "📌",
    title: String(b.title || "Untitled").trim(),
    desc: String(b.desc || "").trim(),
  }));

  const titles = { ...DEFAULT_TITLES };
  if (doc.titles) {
    Object.keys(DEFAULT_TITLES).forEach((k) => {
      if (typeof doc.titles[k] === "string" && doc.titles[k].trim()) titles[k] = doc.titles[k].trim();
    });
  }

  const goalCheck = Number.isFinite(Number(doc.goalCheck)) ? clampMin(Number(doc.goalCheck)) : DEFAULT_GOAL_CHECK;
  return { version: 1, goalCheck, titles, blocks };
}

export function makeDefaultDoc() {
  return finalizeDoc({ blocks: BASE_BLOCKS, titles: DEFAULT_TITLES, goalCheck: DEFAULT_GOAL_CHECK });
}

function readLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function loadScheduleDoc() {
  const raw = readLS(SCHEDULE_KEY, null);
  return finalizeDoc(raw || makeDefaultDoc());
}

export function saveScheduleDoc(doc) {
  const clean = finalizeDoc(doc);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(SCHEDULE_EVENT, { detail: clean }));
  }
  return clean;
}

export function groupSchedule(doc) {
  const blocks = finalizeDoc(doc).blocks;
  const firstTrade = blocks.findIndex((b) => b.type === "trade");
  const lastTrade = blocks.reduce((last, b, i) => (b.type === "trade" ? i : last), -1);
  const out = { prep: [], session: [], close: [] };
  blocks.forEach((b, i) => {
    if (firstTrade === -1) out.session.push(b);
    else if (i < firstTrade) out.prep.push(b);
    else if (i > lastTrade) out.close.push(b);
    else out.session.push(b);
  });
  return out;
}

export function groupRange(list) {
  if (!list || !list.length) return "";
  const min = Math.min(...list.map((b) => b.start));
  const max = Math.max(...list.map((b) => b.end));
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)} – ${pad(Math.floor(max / 60))}:${pad(max % 60)}`;
}

export default function Settings({ onBack } = {}) {
  const doc = loadScheduleDoc();
  const groups = groupSchedule(doc);

  return (
    <div style={{ padding: 20, color: "#fff", background: "#0d1325", minHeight: "100vh" }}>
      <button type="button" onClick={() => (typeof onBack === "function" ? onBack() : window.history.back())} style={{ marginBottom: 16 }}>
        Back
      </button>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <p>Schedule is loaded and ready.</p>
      <div>
        {Object.entries(groups).map(([key, list]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <strong>{doc.titles[key] || key}</strong>
            <div>{list.length ? list.map((b) => `${b.title} (${b.start}–${b.end})`).join(" | ") : "No blocks"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
