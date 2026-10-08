import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Login from "./Login";
import { supabase } from "../lib/supabase";
import { pullAll, pushSettings, pushDay, pushHistory } from "../lib/sync";
import { useFeed, normalizeImpact, flagCodeFor, flagUrl, FLAG_CODE } from "../components/News";

/**
 * <Session />
 * Daily-routine + risk-limit tracker. Visual layer: blue glass fintech look
 * (dark = deep navy glass, light = frosted sky-blue glass).
 * Logic, storage keys and behaviour are unchanged from the original build.
 */

// ---------- small utilities ----------
const pad = (n) => String(n).padStart(2, "0");

const todayKey = (d = new Date()) =>
  d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

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

// ---------- day screenshot helpers ----------
const IMG_PREFIX = "td_img_";

function readImage(date) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(IMG_PREFIX + date);
  } catch (e) {
    return null;
  }
}
function writeImage(date, dataUrl) {
  if (typeof window === "undefined") return true;
  try {
    if (dataUrl) window.localStorage.setItem(IMG_PREFIX + date, dataUrl);
    else window.localStorage.removeItem(IMG_PREFIX + date);
    return true;
  } catch (e) {
    return false; // quota exceeded
  }
}
function compressImage(file, maxDim = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));
  useEffect(() => {
    writeLS(key, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state]);
  return [state, setState];
}

const M = (h, m) => h * 60 + m;

const SCHEDULE = {
  prep: [
    { id: "review", t: "10:30–10:45", label: "📓 Previous Day Review", desc: "Yesterday's trades, screenshots, mistakes, wins, P&L.", type: "prep", start: M(10, 30), end: M(10, 45) },
    { id: "premarket", t: "10:45–11:00", label: "🧭 Pre-Market Preparation", desc: "HTF bias, key levels, liquidity, important zones, market conditions. Set today's loss limit and trade cap now, while calm.", type: "prep", start: M(10, 45), end: M(11, 0) },
  ],
  session: [
    { id: "t1", t: "11:00–12:15", label: "🎯 Trading Block 1", desc: "Execute your plan. Take only your best setups.", type: "trade", start: M(11, 0), end: M(12, 15) },
    { id: "b1", t: "12:15–12:30", label: "☕ Break", desc: "Step away from the screen. Water, stretch, reset.", type: "rest", start: M(12, 15), end: M(12, 30) },
    { id: "t2", t: "12:30–13:30", label: "🎯 Trading Block 2", desc: "Stay patient and stick to the plan.", type: "trade", start: M(12, 30), end: M(13, 30) },
    { id: "lunch", t: "13:30–14:00", label: "🍽️ Lunch + Break", desc: "Eat away from the desk. No charts.", type: "rest", start: M(13, 30), end: M(14, 0) },
    { id: "t3", t: "14:00–15:00", label: "🎯 Trading Block 3", desc: "Fresh eyes after lunch. Same rules, same discipline.", type: "trade", start: M(14, 0), end: M(15, 0) },
    { id: "b2", t: "15:00–15:15", label: "🚶 Break", desc: "Walk, breathe, eyes off the screen.", type: "rest", start: M(15, 0), end: M(15, 15) },
    { id: "t4", t: "15:15–16:15", label: "🎯 Trading Block 4", desc: "Stay selective. Quality over quantity.", type: "trade", start: M(15, 15), end: M(16, 15) },
    { id: "b3", t: "16:15–16:30", label: "☕ Break", desc: "Short reset before the final block.", type: "rest", start: M(16, 15), end: M(16, 30) },
    { id: "tfinal", t: "16:30–16:50", label: "🎯 Final Trading Block", desc: "Last window. A+ setups only, or just manage what's open.", type: "trade", start: M(16, 30), end: M(16, 50) },
  ],
  close: [
    { id: "eod", t: "16:50–17:00", label: "📊 End-of-Day Review", desc: "P&L, executions, screenshots, lessons, journal.", type: "prep", start: M(16, 50), end: M(17, 0) },
  ],
};

const ALL_BLOCKS = [...SCHEDULE.prep, ...SCHEDULE.session, ...SCHEDULE.close];
const IMPACT_RULE = { high: "Stand aside", med: "Half size", low: "Trade as normal" };
const IMPACT_LABEL = { high: "Red · High impact", med: "Orange · Medium impact", low: "Yellow · Low impact" };
// ---------- auto news (focus markets) ----------
const FOCUS_OPTIONS = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "USOIL", "US500", "BTC"];
const IMPACT_RANK = { low: 1, med: 2, high: 3 };
const MIN_IMPACT_OPTIONS = [
  { k: "all", l: "All" },
  { k: "med", l: "Medium+" },
  { k: "high", l: "High only" },
];
// A trade with P&L strictly between -BE_LIMIT and +BE_LIMIT counts as break-even
const BE_LIMIT = 10;
const isBreakEven = (v) => Math.abs(v) < BE_LIMIT;

function toMin(hhmm) {
  const p = (hhmm || "").split(":");
  return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? Number(p[0]) * 60 + Number(p[1]) : null;
}
function isWeekday(dateStr) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow !== 0 && dow !== 6;
}
function pruneHistory(hist) {
  // Keep every logged weekday — the calendar needs the full record.
  return hist.filter((h) => isWeekday(h.date));
}
function newId() {
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- calendar helpers ----------
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstWeekday(y, m) { return new Date(y, m, 1).getDay(); } // 0 = Sun
function ymd(y, m, day) { return `${y}-${pad(m + 1)}-${pad(day)}`; }

function buildMonthGrid(y, m) {
  const total = daysInMonth(y, m);
  const startDow = firstWeekday(y, m);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(ymd(y, m, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ---------- focus-widget helpers ----------
function formatCountdown(mins) {
  if (mins < 1) return "less than a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------- daily goal helpers ----------
const GOAL_CHECK_MIN = M(16, 30); // 4:30 PM check-in

const GOAL_MSGS = {
  hit: [
    "Target smashed. Discipline paid you today, now close the platform and enjoy it.",
    "You executed the plan and the plan delivered. That's how consistency is built.",
    "Goal reached. Protect it: no extra trades, no giving it back.",
    "This is what patience looks like in numbers. Well earned.",
    "Green day, on your terms. Log it, learn from it, repeat it.",
    "You waited for A+ setups and got paid for it. Take the win.",
    "Another day of proof that the process works. Proud of this one.",
  ],
  half: [
    "You were {d} short. More than halfway there is a solid day, not a failure.",
    "{d} away from the goal. You're in profit and the account is safe. That counts.",
    "Past the halfway mark with discipline intact. Tomorrow's goal is within reach.",
    "So close, only {d} off. Don't chase it now. Let the plan finish the job tomorrow.",
    "Net {n} against a {t} goal. Good progress. Review what worked and run it back.",
    "{d} to go, and you didn't force anything to get here. That's a win in itself.",
  ],
  low: [
    "You needed {d} to reach your goal. Smaller days still protect your capital.",
    "{d} short today. Not every session pays in full, but you showed up with a plan.",
    "Goal missed by {d}. Review your best setup of the day and build tomorrow around it.",
    "A quiet one. {d} to the goal, and zero damage done. Reset and come back sharp.",
    "Progress isn't always loud. Note what the market gave you today and move on.",
    "{d} off target. The edge plays out over many days, not just this one.",
  ],
  red: [
    "You needed {d} to reach your goal. Red days happen to every trader. Stopping on time is the skill.",
    "Tough session. Close the charts, step away, and don't try to win it back today.",
    "The goal was {d} away, but your next trade isn't tied to this one. Fresh start tomorrow.",
    "Losses are tuition. Write down the one lesson and let the rest go.",
    "A red day doesn't define you. How you respond to it does. Rest up.",
    "Your capital is your business. Protect it today and the goal will come back around.",
    "Every great trader has days like this. Review calmly, reset fully, return stronger.",
  ],
};

function pickGoalMsg(kind) {
  const pool = GOAL_MSGS[kind];
  const key = "td_goalMsg_" + kind;
  const last = readLS(key, -1);
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === last) i = (i + 1) % pool.length; // never the same twice in a row
  writeLS(key, i);
  return pool[i];
}

function buildGoalPopup(kind, target, net, money, fmt) {
  const d = money(Math.max(0, target - net));
  const msg = pickGoalMsg(kind)
    .replace(/{d}/g, d)
    .replace(/{n}/g, fmt(net))
    .replace(/{t}/g, money(target));
  if (kind === "hit") {
    return { kind, emoji: "🏆", kicker: "Daily target hit", title: "Congratulations!", figure: fmt(net), sub: "Today's goal: " + money(target), msg };
  }
  if (kind === "half") {
    return { kind, emoji: "🔥", kicker: "4:30 PM check-in", title: "So close!", figure: d, sub: "left to reach your goal", msg };
  }
  if (kind === "low") {
    return { kind, emoji: "🌱", kicker: "4:30 PM check-in", title: "Day's almost done", figure: d, sub: "left to reach your goal", msg };
  }
  return { kind, emoji: "💙", kicker: "4:30 PM check-in", title: "Tough day, stay steady", figure: d, sub: "was needed to reach your goal (net " + fmt(net) + ")", msg };
}

const CONFETTI_COLORS = ["#8dffc0", "#ffd36b", "#7ab6ff", "#ff9ab0", "#ffffff", "#c9a6ff"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 56 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.6 + Math.random() * 2.2,
        size: 6 + Math.random() * 8,
        dx: Math.round((Math.random() - 0.5) * 160),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        round: Math.random() > 0.6,
      })),
    []
  );
  return (
    <div className="ts-confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left + "%",
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            background: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animationDelay: p.delay + "s",
            animationDuration: p.dur + "s",
            "--dx": p.dx + "px",
          }}
        />
      ))}
    </div>
  );
}

function GoalPopup({ popup, onClose }) {
  if (!popup) return null;
  const hit = popup.kind === "hit";
  return (
    <>
      {hit && <Confetti />}

      <div
        className={`ts-modal ts-goal ${popup.kind}`}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ts-emoji">{popup.emoji}</div>

        <div className="ts-kicker">{popup.kicker}</div>

        <h1>{popup.title}</h1>

        <div className="ts-figure">{popup.figure}</div>

        <div className="ts-sub">{popup.sub}</div>

        <p className="ts-msg">{popup.msg}</p>

        <button onClick={onClose} className="ts-btn-primary">
          {hit ? "Let's go 🔥" : "Got it"}
        </button>
      </div>
    </>
  );
}

// ---------- presentational helpers (module scope, no logic) ----------
// Fades the decimals of a money string: "+$1,286.28" -> "+$1,286" + faded ".28"
function DimMoney({ text }) {
  if (text == null) return null;
  const s = String(text);
  const i = s.lastIndexOf(".");
  if (i < 0) return <>{s}</>;
  return (
    <>
      {s.slice(0, i)}
      <span className="ts-dim">{s.slice(i)}</span>
    </>
  );
}

// Progress ring for the hero card
function Ring({ pct, met, neg }) {
  const size = 84;
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg className="ts-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="9" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={met ? "#8dffc0" : neg ? "#ffb0a8" : "#ffffff"}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .5s ease" }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// Bottom dock (scroll shortcuts only — no routing, no logic)
const DOCK = [
  { key: "home", id: "ts-top", label: "Home", d: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { key: "day", id: "ts-day", label: "Session", d: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
  { key: "news", id: "ts-news", label: "News", d: "M4 5h13v14H6a2 2 0 0 1-2-2V5zM17 8h3v9a2 2 0 0 1-2 2M8 9h6M8 13h6" },
  { key: "history", id: "ts-history", label: "History", d: "M5 20V10M12 20V4M19 20v-7" },
];

// ---------- standalone focus card component ----------
function FocusCard({
  block, done, onToggle, isTrade, isEnergy, energy, onEnergy,
  pnlInputRef, pnlInput, setPnlInput, addResult,
  netPnl, maxLoss, fmt, money, usedFraction,
}) {
  return (
    <div className="ts-focus-enter ts-glass" style={{ borderRadius: "26px", padding: "18px", marginBottom: "10px" }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px", fontWeight: 600 }}>
        {block.t}
      </div>
      <h3 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-.025em", marginBottom: "8px", marginTop: 0 }}>
        {block.label}
      </h3>
      <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: "1.45", marginBottom: "14px" }}>
        {block.desc}
      </div>

      <button
        onClick={onToggle}
        style={{
          width: "100%",
          borderRadius: "16px",
          border: done ? "1px solid transparent" : "1px solid var(--border)",
          padding: "13px 14px",
          fontSize: "14px",
          fontWeight: "700",
          transition: "all 0.2s ease",
          background: done ? "var(--btn)" : "var(--surface-2)",
          color: done ? "var(--on-accent)" : "var(--text)",
          cursor: "pointer",
          marginBottom: "10px",
        }}
      >
        {done ? "Marked done ✓" : "Mark as done"}
      </button>

      {isTrade && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px", fontWeight: 600 }}>Log a result</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              ref={pnlInputRef}
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="P&L"
              value={pnlInput}
              onChange={(e) => setPnlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addResult(); } }}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                padding: "10px 12px",
                fontSize: "14px",
                color: "var(--text)",
              }}
            />
            <button
              onClick={addResult}
              style={{
                borderRadius: "14px",
                background: "var(--btn)",
                color: "var(--on-accent)",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: "700",
                whiteSpace: "nowrap",
                border: "none",
                cursor: "pointer",
              }}
            >
              Log
            </button>
          </div>
          <div style={{ height: "8px", borderRadius: "999px", background: "var(--surface-2)", overflow: "hidden", marginBottom: "8px" }}>
            <div
              style={{
                height: "100%",
                borderRadius: "999px",
                background: usedFraction >= 0.66 ? "linear-gradient(90deg,#ff9a8f,var(--rose))" : "var(--meter)",
                width: `${Math.min(100, usedFraction * 100)}%`,
                transition: "width 0.25s ease",
              }}
            />
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
            Net {fmt(netPnl)} — {money(Math.max(0, maxLoss + Math.min(0, netPnl)))} of room left.
          </div>
        </div>
      )}

      {isEnergy && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px", fontWeight: 600 }}>Energy check-in</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => onEnergy(i)}
                style={{
                  flex: 1,
                  height: "40px",
                  borderRadius: "14px",
                  border: energy === i ? "1px solid transparent" : "1px solid var(--border)",
                  background: energy === i ? "var(--btn)" : "var(--surface-2)",
                  color: energy === i ? "var(--on-accent)" : "var(--muted)",
                  fontSize: "13.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NextUpCard({ nextBlock, minsUntil }) {
  if (!nextBlock) {
    return (
      <div className="ts-glass" style={{ borderRadius: "26px", padding: "18px", marginBottom: "10px", textAlign: "center", color: "var(--muted)" }}>
        Nothing scheduled for the rest of today. Good work.
      </div>
    );
  }
  return (
    <div className="ts-glass" style={{ borderRadius: "26px", padding: "18px", marginBottom: "10px" }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px", fontWeight: 600 }}>
        Next up in {formatCountdown(minsUntil)}
      </div>
      <h3 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)", marginTop: 0, marginBottom: "4px" }}>
        {nextBlock.label}
      </h3>
      <div style={{ fontSize: "12px", color: "var(--muted)" }}>{nextBlock.t}</div>
    </div>
  );
}

function EditLimitModal({ mode, maxLoss, currency, tradeLimit, dailyTarget, onClose, onSaveLoss, onSaveCap, onSaveGoal }) {
  const [lossVal, setLossVal] = useState(String(maxLoss));
  const [curVal, setCurVal] = useState(currency);
  const [capVal, setCapVal] = useState(String(tradeLimit));
  const [goalVal, setGoalVal] = useState(String(dailyTarget));

  useEffect(() => {
    setLossVal(String(maxLoss));
    setCurVal(currency);
    setCapVal(String(tradeLimit));
    setGoalVal(String(dailyTarget));
  }, [mode, maxLoss, currency, tradeLimit, dailyTarget]);

  if (!mode) return null;

  const handleSave = () => {
    if (mode === "loss") {
      const n = parseFloat(lossVal);
      if (!isNaN(n) && n > 0) {
        onSaveLoss(Math.abs(n), curVal.trim() ? curVal.trim().slice(0, 4) : currency);
      }
    } else if (mode === "goal") {
      const n = parseFloat(goalVal);
      if (!isNaN(n) && n >= 0) onSaveGoal(n); // 0 turns the goal off
    } else {
      const n = parseInt(capVal, 10);
      if (!isNaN(n)) onSaveCap(Math.max(1, n));
    }
    onClose();
  };

  const title =
    mode === "loss" ? "Set today's loss floor"
    : mode === "goal" ? "Set your daily profit goal"
    : "Set today's trade cap";
  const sub =
    mode === "loss" ? "The most you're willing to be down today, set now while calm."
    : mode === "goal" ? "Hit it and you'll get a celebration. Miss it and you'll get a 4:30 PM check-in. Enter 0 to turn it off."
    : "The most trades you'll take today, set now while calm.";

  return (
    <div className="ts-modal-backdrop" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modal-title">{title}</div>
        <div className="ts-modal-sub">{sub}</div>

        {mode === "loss" ? (
          <div className="ts-modal-row">
            <div className="ts-modal-field" style={{ flex: 2 }}>
              <label>Max loss</label>
              <input
                type="number" min="0" step="0.01" autoFocus
                value={lossVal}
                onChange={(e) => setLossVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
            <div className="ts-modal-field" style={{ flex: 1 }}>
              <label>Currency</label>
              <input
                type="text" maxLength={4}
                value={curVal}
                onChange={(e) => setCurVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
          </div>
        ) : mode === "goal" ? (
          <div className="ts-modal-field">
            <label>Daily profit goal</label>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={goalVal}
              onChange={(e) => setGoalVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
        ) : (
          <div className="ts-modal-field">
            <label>Trade cap</label>
            <input
              type="number" min="1" step="1" autoFocus
              value={capVal}
              onChange={(e) => setCapVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
        )}

        <div className="ts-modal-actions">
          <button className="ts-modal-btn ghost" onClick={onClose}>Cancel</button>
          <button className="ts-modal-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------- floating hologram clock ----------
const SEG_POLY = {
  a: "2,1 18,1 15.5,4.5 4.5,4.5",
  b: "19,2 19,18 15.5,14.5 15.5,5.5",
  c: "19,18 19,34 15.5,30.5 15.5,21.5",
  d: "2,35 18,35 15.5,31.5 4.5,31.5",
  e: "1,18 4.5,21.5 4.5,30.5 1,34",
  f: "1,2 4.5,5.5 4.5,14.5 1,18",
  g: "2.5,18 5,14.8 15,14.8 17.5,18 15,21.2 5,21.2",
};
const SEG_MAP = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc",
  5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

const ce = React.createElement;

function HoloDigit({ ch }) {
  const lit = ch == null ? "" : SEG_MAP[ch] || "";
  return ce(
    "svg",
    { className: "ts-holo-digit", width: 19, height: 34, viewBox: "0 0 20 36", "aria-hidden": "true" },
    Object.keys(SEG_POLY).map((k) =>
      ce("polygon", { key: k, points: SEG_POLY[k], className: lit.includes(k) ? "on" : "off" })
    )
  );
}

const SESSIONS = [
  { name: "SYDNEY", tz: "Australia/Sydney", open: 8, close: 17 },
  { name: "ASIAN", tz: "Asia/Tokyo", open: 9, close: 18 },
  { name: "LONDON", tz: "Europe/London", open: 8, close: 17 },
  { name: "NEW YORK", tz: "America/New_York", open: 8, close: 17 },
];

const sessionFmtCache = {};
function sessionFmt(tz) {
  if (!sessionFmtCache[tz]) {
    sessionFmtCache[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    });
  }
  return sessionFmtCache[tz];
}

function activeSessionLabel(date) {
  try {
    const open = SESSIONS.filter((s) => {
      let wd = "";
      let h = -1;
      sessionFmt(s.tz).formatToParts(date).forEach((p) => {
        if (p.type === "weekday") wd = p.value;
        if (p.type === "hour") h = Number(p.value);
      });
      if (wd === "Sat" || wd === "Sun") return false;
      return h >= s.open && h < s.close;
    }).map((s) => s.name);
    return open.length ? open.join(" + ") : "MARKETS CLOSED";
  } catch (e) {
    return "";
  }
}

function HoloClock() {
  const [t, setT] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  let hr = t.getHours();
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  const hh = pad(hr);
  const mm = pad(t.getMinutes());
  const blink = t.getSeconds() % 2 === 0;
  const sessionLabel = activeSessionLabel(t);

  return ce(
    "div",
    { className: "ts-holo", role: "timer", "aria-label": hh + ":" + mm + " " + ap + " " + sessionLabel },
    ce(HoloDigit, { ch: hh[0] === "0" ? null : Number(hh[0]) }),
    ce(HoloDigit, { ch: Number(hh[1]) }),
    ce(
      "svg",
      {
        className: "ts-holo-colon",
        width: 7,
        height: 34,
        viewBox: "0 0 7 36",
        "aria-hidden": "true",
        style: { opacity: blink ? 1 : 0.18 },
      },
      ce("rect", { x: 1.5, y: 9, width: 4, height: 4, rx: 1 }),
      ce("rect", { x: 1.5, y: 23, width: 4, height: 4, rx: 1 })
    ),
    ce(HoloDigit, { ch: Number(mm[0]) }),
    ce(HoloDigit, { ch: Number(mm[1]) }),
    ce(
      "div",
      { className: "ts-holo-side" },
      ce("span", { className: "ts-holo-session" }, sessionLabel),
      ce("span", { className: "ts-holo-meridiem" }, ap)
    )
  );
}

// ---------- floating news + P&L ticker ----------
function Ticker({ news, nowMin, netPnl, trades, tradeLimit, maxLoss, fmt, money, loading }) {
  const items = [];

  if (news.length === 0) {
    items.push({
      key: "nonews",
      kind: "info",
      text: loading ? "Fetching today's news…" : "No news events today for your focus markets",
    });
  } else {
    news.forEach((n) => {
      const m = toMin(n.time);
      items.push({
        key: n.id || n.title + n.time,
        kind: "news",
        impact: n.impact,
        time: n.time || "--:--",
        text: n.title,
        rule: IMPACT_RULE[n.impact],
        past: m !== null && m < nowMin - 15,
      });
    });
  }

  const tone = netPnl > 0 ? "pos" : netPnl < 0 ? "neg" : "";
  items.push({ key: "pnl", kind: "stat", label: "Net today", value: fmt(netPnl), tone });
  items.push({ key: "trades", kind: "stat", label: "Trades", value: trades + "/" + tradeLimit });
  items.push({
    key: "room",
    kind: "stat",
    label: "Room left",
    value: money(Math.max(0, maxLoss + Math.min(0, netPnl))),
  });

  const chars = items.reduce(
    (a, it) => a + (it.text ? it.text.length : 0) + (it.label ? it.label.length : 0) + 14,
    0
  );
  const duration = Math.max(40, Math.round(chars * 0.4));

  const renderItem = (it, suffix) => {
    const key = it.key + suffix;
    if (it.kind === "news") {
      return ce(
        "span",
        { className: "ts-tk-item" + (it.past ? " past" : ""), key },
        ce("span", { className: "impact " + it.impact }),
        ce("span", { className: "ts-tk-time" }, it.time),
        ce("span", { className: "ts-tk-text" }, it.text),
        ce("span", { className: "ts-tk-rule" }, it.rule)
      );
    }
    if (it.kind === "info") {
      return ce("span", { className: "ts-tk-item", key }, ce("span", { className: "ts-tk-text" }, it.text));
    }
    return ce(
      "span",
      { className: "ts-tk-item", key },
      ce("span", { className: "ts-tk-label" }, it.label),
      ce("span", { className: "ts-tk-val " + (it.tone || "") }, it.value)
    );
  };

  const renderGroup = (suffix) =>
    ce(
      "div",
      { className: "ts-ticker-group", key: suffix, "aria-hidden": suffix === "b" ? "true" : undefined },
      items.map((it) => renderItem(it, suffix)),
      ce("span", { className: "ts-tk-sep", "aria-hidden": "true" }, "◆")
    );

  return ce(
    "div",
    {
      className: "ts-ticker",
      role: "marquee",
      "aria-label": "Today's news and P&L",
      style: { position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, overflow: "hidden" },
    },
    ce(
      "div",
      { className: "ts-ticker-viewport" },
      ce(
        "div",
        { className: "ts-ticker-track", style: { animationDuration: duration + "s" } },
        renderGroup("a"),
        renderGroup("b")
      )
    )
  );
}

// ---------- component ----------
export default function Session({ onOpenSummit, onOpenPerformance, onOpenNews } = {}) {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthUser(data.session ? data.session.user : null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session ? session.user : null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const dayKey = "td_day_" + todayKey();

  const [theme, setTheme] = useLocalStorageState("td_theme", "dark");
  const [follow, setFollow] = useLocalStorageState("td_follow", true);

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

  const [maxLoss, setMaxLoss] = useLocalStorageState("td_maxLoss", 160);
  const [tradeLimit, setTradeLimit] = useLocalStorageState("td_tradeLimit", 6);
  const [currency, setCurrency] = useLocalStorageState("td_currency", "$");
  const [history, setHistory] = useLocalStorageState("td_history", []);
  const [day, setDay] = useLocalStorageState(dayKey, { checks: {}, energy: null, pnl: [], news: [] });

  const [now, setNow] = useState(new Date());
  const [pnlInput, setPnlInput] = useState("");
  const [newsTitle, setNewsTitle] = useState("");
  const [newsTime, setNewsTime] = useState("");
  const [newsImpact, setNewsImpact] = useState("high");
  const [logForm, setLogForm] = useState(() => {
    const saved = readLS("td_history", []).find((h) => h.date === todayKey());
    return {
      missed: saved && saved.missed ? String(saved.missed) : "",
      note: saved ? saved.note || "" : "",
    };
  });
  const [logImage, setLogImage] = useState(() => readImage(todayKey()));
  const [imgBusy, setImgBusy] = useState(false);
  const [imgMsg, setImgMsg] = useState("");
  const [imgTick, setImgTick] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [activeHistDate, setActiveHistDate] = useState(null);
  const [nowBtnVisible, setNowBtnVisible] = useState(false);
  const [viewMode, setViewMode] = useLocalStorageState("td_viewMode", "focus"); // "focus" | "full"
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [editModal, setEditModal] = useState(null); // null | "loss" | "cap"
  const [monthlyTarget, setMonthlyTarget] = useLocalStorageState("td_monthlyTarget", 2000);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [dockActive, setDockActive] = useState("home"); // visual only
  // ids of news events whose "30 minutes to go" popup has already been shown/dismissed today
  const [alerted, setAlerted] = useLocalStorageState("td_alerted_" + todayKey(), []);
  const [dailyTarget, setDailyTarget] = useLocalStorageState("td_dailyTarget", 100);
  const [goalCelebrated, setGoalCelebrated] = useLocalStorageState("td_goalCelebrated_" + todayKey(), false);
  const [goalEvaluated, setGoalEvaluated] = useLocalStorageState("td_goalEvaluated_" + todayKey(), false);
  const [goalPopup, setGoalPopup] = useState(null);

  const pnlInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const newsTitleRef = useRef(null);
  const blockRefs = useRef({});
  const lastAutoScroll = useRef(0);
  const prevNowId = useRef(null);
  const fontLinkAdded = useRef(false);

  // ---------- Supabase sync ----------
  const userId = authUser ? authUser.id : null;
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | synced | offline
  const [retryTick, setRetryTick] = useState(0);
  const pushedHist = useRef({});
  const dayDate = dayKey.slice("td_day_".length);

  // retry when the connection comes back
  useEffect(() => {
    const onOnline = () => setRetryTick((t) => t + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // 1) On sign-in: pull from Supabase. Anything that exists only on this device is kept and uploaded.
  useEffect(() => {
    if (!userId) {
      if (hydrated) setHydrated(false);
      pushedHist.current = {};
      return;
    }
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        setSyncState("syncing");
        const remote = await pullAll(userId, dayDate);
        if (cancelled) return;

        if (remote.settings) {
          const s = remote.settings;
          if (s.maxLoss != null) setMaxLoss(s.maxLoss);
          if (s.tradeLimit != null) setTradeLimit(s.tradeLimit);
          if (s.currency != null) setCurrency(s.currency);
          if (s.monthlyTarget != null) setMonthlyTarget(s.monthlyTarget);
        }

        if (remote.day) {
          setDay({ checks: {}, energy: null, pnl: [], news: [], ...remote.day });
        }

        const remoteDates = new Set(remote.history.map((h) => h.date));
        const localOnly = readLS("td_history", []).filter((h) => !remoteDates.has(h.date));
        const merged = pruneHistory([...remote.history, ...localOnly]).sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );
        const map = {};
        remote.history.forEach((h) => { map[h.date] = JSON.stringify(h); });
        pushedHist.current = map;
        setHistory(merged);

        setHydrated(true);
        setSyncState("synced");
      } catch (e) {
        if (!cancelled) setSyncState("offline");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated, retryTick]);

  // 2) Push settings when they change
  useEffect(() => {
    if (!userId || !hydrated) return;
    const t = setTimeout(() => {
      setSyncState("syncing");
      pushSettings(userId, { maxLoss, tradeLimit, currency, monthlyTarget })
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("offline"));
    }, 800);
    return () => clearTimeout(t);
  }, [userId, hydrated, retryTick, maxLoss, tradeLimit, currency, monthlyTarget]);

  // 3) Push today's session when it changes
  useEffect(() => {
    if (!userId || !hydrated) return;
    const hasData =
      day.pnl.length > 0 || day.news.length > 0 || day.energy !== null || Object.values(day.checks).some(Boolean);
    if (!hasData) return;
    const t = setTimeout(() => {
      setSyncState("syncing");
      pushDay(userId, dayDate, day)
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("offline"));
    }, 800);
    return () => clearTimeout(t);
  }, [userId, hydrated, retryTick, day, dayDate]);

  // 4) Push only the history entries that changed
  useEffect(() => {
    if (!userId || !hydrated) return;
    const changed = history.filter((h) => pushedHist.current[h.date] !== JSON.stringify(h));
    if (!changed.length) return;
    const t = setTimeout(() => {
      setSyncState("syncing");
      pushHistory(userId, changed)
        .then(() => {
          changed.forEach((h) => { pushedHist.current[h.date] = JSON.stringify(h); });
          setSyncState("synced");
        })
        .catch(() => setSyncState("offline"));
    }, 500);
    return () => clearTimeout(t);
  }, [userId, hydrated, retryTick, history]);

  const syncLabel =
    syncState === "synced" ? "Synced to your account."
      : syncState === "syncing" ? "Syncing…"
      : syncState === "offline" ? "Offline. Changes will sync when you reconnect."
      : "Connecting…";

  // inject Google Fonts once
  useEffect(() => {
    if (fontLinkAdded.current || typeof document === "undefined") return;
    fontLinkAdded.current = true;
    if (!document.getElementById("ts-font-link")) {
      const link = document.createElement("link");
      link.id = "ts-font-link";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // clock tick
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 15000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // ---------- auto news: today's events for your focus markets ----------
  const [focus, setFocus] = useLocalStorageState("td_focus", ["USD"]);
  const [minImpact, setMinImpact] = useLocalStorageState("td_newsMin", "med");
  const calFeed = useFeed("/api/economic-calendar", !!userId, 15 * 60 * 1000);

  const autoNews = useMemo(() => {
    const floor = minImpact === "all" ? 1 : IMPACT_RANK[minImpact] || 1;
    const out = [];
    (calFeed.items || []).forEach((raw, idx) => {
      const iso = raw.time || raw.publishedAt || raw.date;
      const d = iso ? new Date(iso) : null;
      if (!d || isNaN(d.getTime()) || todayKey(d) !== dayDate) return; // today only
      const symbols = raw.symbols || raw.currencies || [];
      if (!symbols.some((s) => focus.includes(s) || s === "ALL")) return; // focus markets only
      const norm = normalizeImpact(raw.impact);
      const impact = norm === "medium" ? "med" : norm; // Session uses "med"
      if (IMPACT_RANK[impact] < floor) return;
      out.push({
        id: "auto-" + (raw.id != null ? raw.id : idx),
        title: raw.title || raw.headline || "Untitled",
        time: pad(d.getHours()) + ":" + pad(d.getMinutes()),
        impact,
        symbols,
        country: raw.country || raw.countryCode || null,
        auto: true,
      });
    });
    return out;
  }, [calFeed.items, focus, minImpact, dayDate]);

  // auto events + any older manual ones already saved for today
  const todaysNews = useMemo(() => [...autoNews, ...day.news], [autoNews, day.news]);

  const toggleFocus = (s) =>
    setFocus((f) => (f.includes(s) ? (f.length > 1 ? f.filter((x) => x !== s) : f) : [...f, s]));
  // always keeps at least one focus market selected.

  // ---------- derived values ----------
  const netPnl = useMemo(() => day.pnl.reduce((a, b) => a + b, 0), [day.pnl]);

  const money = useCallback(
    (n) => currency + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 }),
    [currency]
  );
  const fmt = useCallback((n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + money(n), [money]);

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const currentNowId = useMemo(() => {
    for (const b of ALL_BLOCKS) {
      const isNow =
        b.end > b.start
          ? nowMin >= b.start && nowMin < b.end
          : nowMin >= b.start && nowMin < b.start + 15 && b.start === b.end;
      if (isNow) return b.id;
    }
    return null;
  }, [nowMin]);

  const liveHighImpact = useMemo(() => {
    return (
      todaysNews
        .filter((n) => n.impact === "high" && toMin(n.time) !== null)
        .map((n) => ({ title: n.title, time: n.time, m: toMin(n.time) }))
        .filter((n) => nowMin >= n.m - 30 && nowMin <= n.m + 15)
        .sort((a, b) => a.m - b.m)[0] || null
    );
  }, [todaysNews, nowMin]);

  const stopband = useMemo(() => {
    if (netPnl <= -maxLoss) {
      return {
        limit: true,
        head: "Max loss reached — done for the day",
        sub: `Net ${fmt(netPnl)} against a ${money(maxLoss)} floor you set this morning, while calm.`,
      };
    }
    if (liveHighImpact && nowMin < M(17, 0)) {
      return {
        limit: true,
        head: `Red news window — ${liveHighImpact.title} at ${liveHighImpact.time}`,
        sub: "Be flat or half size. Trade the reaction after it settles, not the spike.",
      };
    }
    if (nowMin < M(11, 0)) {
      return { limit: false, head: "Market not open yet", sub: "Use this window to prep, not to pre-load stress." };
    }
    if (nowMin < M(17, 0)) {
      const minsLeft = M(17, 0) - nowMin;
      return {
        limit: false,
        head: "In session",
        sub: `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m until session close. Net ${fmt(netPnl)}, ${money(
          maxLoss + Math.min(0, netPnl)
        )} of room left.`,
      };
    }
    return { limit: false, head: "Session closed for today", sub: `Closed at ${fmt(netPnl)}. Log the day and step away.` };
  }, [netPnl, maxLoss, liveHighImpact, nowMin, fmt, money]);

  const wins = day.pnl.filter((v) => v >= BE_LIMIT).length;
  const losses = day.pnl.filter((v) => v <= -BE_LIMIT).length;
  const breakevens = day.pnl.filter(isBreakEven).length;
  const usedFraction = Math.min(1, Math.max(0, -netPnl) / maxLoss);
  const goalPct = dailyTarget > 0 ? Math.max(0, Math.min(100, (netPnl / dailyTarget) * 100)) : 0;
  const goalHit = dailyTarget > 0 && netPnl >= dailyTarget;

  const sortedNews = useMemo(
    () => todaysNews.slice().sort((a, b) => (toMin(a.time) ?? 1e9) - (toMin(b.time) ?? 1e9)),
    [todaysNews]
  );
  const highNews = sortedNews.filter((n) => n.impact === "high");

  const fullHistory = useMemo(() => pruneHistory(history), [history]);

  const historyByDate = useMemo(() => {
    const map = {};
    fullHistory.forEach((h) => { map[h.date] = h; });
    return map;
  }, [fullHistory]);

  const streak = useMemo(() => {
    const reversed = fullHistory.slice().reverse();
    let s = 0;
    for (const h of reversed) {
      const floor = h.maxLoss ?? maxLoss;
      const heldFloor = h.net === undefined || h.net > -floor;
      if (h.stoppedOnTime && heldFloor) s++;
      else break;
    }
    return s;
  }, [fullHistory, maxLoss]);

  const currentMonthKey = todayKey().slice(0, 7); // "YYYY-MM"

  const monthProgress = useMemo(() => {
    let total = 0;
    fullHistory.forEach((h) => {
      // sum every saved day this month except today — today comes from live state below,
      // so it stays accurate even if you keep logging trades after saving
      if (h.date.startsWith(currentMonthKey) && h.date !== todayKey()) {
        total += h.net || 0;
      }
    });
    total += netPnl;
    return total;
  }, [fullHistory, netPnl, currentMonthKey]);

  const targetPct = monthlyTarget > 0 ? Math.max(0, Math.min(100, (monthProgress / monthlyTarget) * 100)) : 0;
  const targetMet = monthlyTarget > 0 && monthProgress >= monthlyTarget;

  const monthGrid = useMemo(
    () => buildMonthGrid(calendarMonth.y, calendarMonth.m),
    [calendarMonth]
  );
  const monthLabel = useMemo(
    () => new Date(calendarMonth.y, calendarMonth.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [calendarMonth]
  );
  const goPrevMonth = () =>
    setCalendarMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const goNextMonth = () =>
    setCalendarMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const calendarYearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    let minY = nowY - 5;
    fullHistory.forEach((h) => {
      const y = Number(h.date.slice(0, 4));
      if (y < minY) minY = y;
    });
    const arr = [];
    for (let y = minY; y <= nowY + 1; y++) arr.push(y);
    return arr;
  }, [fullHistory]);

  const jumpToToday = () => {
    const d = new Date();
    setCalendarMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const currentBlock = useMemo(
    () => ALL_BLOCKS.find((b) => b.id === currentNowId) || null,
    [currentNowId]
  );
  const nextBlock = useMemo(
    () => ALL_BLOCKS.filter((b) => b.start > nowMin).sort((a, b) => a.start - b.start)[0] || null,
    [nowMin]
  );

  // ---------- news alert popup (fires when an event is within 30 min) ----------
  const pendingAlert = useMemo(() => {
    return (
      todaysNews
        .filter((n) => !alerted.includes(n.id) && toMin(n.time) !== null)
        .map((n) => ({ ...n, minsLeft: toMin(n.time) - nowMin }))
        .filter((n) => n.minsLeft > 0 && n.minsLeft <= 30)
        .sort((a, b) => a.minsLeft - b.minsLeft)[0] || null
    );
  }, [todaysNews, alerted, nowMin]);

  // short vibration on phones when the popup appears
  const pendingAlertId = pendingAlert ? pendingAlert.id : null;
  useEffect(() => {
    if (pendingAlertId && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [pendingAlertId]);

  // ---------- daily goal: celebration + 4:30 PM check-in ----------
  useEffect(() => {
    if (goalPopup) return;
    if (!(hydrated || syncState === "offline")) return; // wait for data to load
    if (!(dailyTarget > 0) || !isWeekday(todayKey())) return;

    if (!goalCelebrated && netPnl >= dailyTarget) {
      setGoalCelebrated(true);
      setGoalPopup(buildGoalPopup("hit", dailyTarget, netPnl, money, fmt));
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 240]);
      return;
    }

    if (!goalCelebrated && !goalEvaluated && nowMin >= GOAL_CHECK_MIN) {
      setGoalEvaluated(true);
      const kind = netPnl < 0 ? "red" : netPnl >= dailyTarget / 2 ? "half" : "low";
      setGoalPopup(buildGoalPopup(kind, dailyTarget, netPnl, money, fmt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netPnl, nowMin, dailyTarget, goalCelebrated, goalEvaluated, goalPopup, hydrated, syncState]);

  // ---------- scroll-to-now ----------
  const scrollToNow = useCallback(
    (force) => {
      const el = blockRefs.current[currentNowId];
      if (!el) return false;
      if (!force && !follow) return false;
      const t = Date.now();
      if (t - lastAutoScroll.current < 700) return false;
      lastAutoScroll.current = t;
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      el.classList.remove("just-scrolled");
      void el.offsetWidth;
      el.classList.add("just-scrolled");
      setTimeout(() => el.classList.remove("just-scrolled"), 1000);
      return true;
    },
    [currentNowId, follow]
  );

  useEffect(() => {
    if (currentNowId && currentNowId !== prevNowId.current && follow) {
      prevNowId.current = currentNowId;
      requestAnimationFrame(() => scrollToNow(false));
    } else {
      prevNowId.current = currentNowId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNowId, follow]);

  // "back to now" visibility via IntersectionObserver
  useEffect(() => {
    const el = currentNowId ? blockRefs.current[currentNowId] : null;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNowBtnVisible(false);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setNowBtnVisible(!entry.isIntersecting),
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [currentNowId]);

  const nowBlockLabel = useMemo(
    () => ALL_BLOCKS.find((b) => b.id === currentNowId)?.label || "",
    [currentNowId]
  );

  // ---------- handlers ----------
  const toggleCheck = (id) => {
    setDay((d) => ({ ...d, checks: { ...d.checks, [id]: !d.checks[id] } }));
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      /* network hiccup: the auth listener still clears the local session */
    }
  };

  const handleGoToSummit = () => {
    if (typeof onOpenSummit === "function") {
      onOpenSummit();
    } else if (typeof window !== "undefined") {
      window.location.hash = "summit";
    }
  };
  const handleGoToPerformance = () => {
    if (typeof onOpenPerformance === "function") {
      onOpenPerformance();
    } else if (typeof window !== "undefined") {
      window.location.hash = "performance";
    }
  };
  const handleGoToNews = () => {
    if (typeof onOpenNews === "function") {
      onOpenNews();
    } else if (typeof window !== "undefined") {
      window.location.hash = "news";
    }
  };

  const addResult = () => {
    const v = parseFloat(pnlInput);
    if (isNaN(v) || v === 0) { pnlInputRef.current?.focus(); return; }
    const stamp = new Date();
    const minuteOfDay = stamp.getHours() * 60 + stamp.getMinutes();
    setDay((d) => {
      const times = (d.times || []).slice();
      while (times.length < d.pnl.length) times.push(null); // pad older trades logged before timestamps existed
      times.push(minuteOfDay);
      return { ...d, pnl: [...d.pnl, v], times };
    });
    setPnlInput("");
    if (!scrollToNow(true)) pnlInputRef.current?.focus();
    else setTimeout(() => pnlInputRef.current?.blur(), 60);
  };
  const removeResult = (idx) => {
    setDay((d) => ({
      ...d,
      pnl: d.pnl.filter((_, i) => i !== idx),
      times: (d.times || []).filter((_, i) => i !== idx),
    }));
  };

  const openLossEdit = () => setEditModal("loss");
  const openCapEdit = () => setEditModal("cap");
  const openGoalEdit = () => setEditModal("goal");

  const startEditTarget = () => {
    setTargetInput(String(monthlyTarget));
    setEditingTarget(true);
  };
  const saveTarget = () => {
    const n = parseFloat(targetInput);
    if (!isNaN(n) && n > 0) setMonthlyTarget(n);
    setEditingTarget(false);
  };
  const cancelEditTarget = () => setEditingTarget(false);

  const addNews = () => {
    const title = newsTitle.trim();
    if (!title) { newsTitleRef.current?.focus(); return; }
    setDay((d) => ({ ...d, news: [...d.news, { id: newId(), title, time: newsTime, impact: newsImpact }] }));
    setNewsTitle("");
    setNewsTime("");
    newsTitleRef.current?.focus();
  };
  const removeNews = (id) => {
    setDay((d) => ({ ...d, news: d.news.filter((n) => n.id !== id) }));
  };
  const dismissAlert = () => {
    if (!pendingAlert) return;
    const id = pendingAlert.id;
    setAlerted((a) => (a.includes(id) ? a : [...a, id]));
  };

  const buildEntry = () => ({
    date: todayKey(),
    wins,
    losses,
    breakeven: breakevens,
    missed: Number(logForm.missed) || 0,
    net: netPnl,
    maxLoss,
    energy: day.energy,
    news: todaysNews.map((n) => ({ time: n.time, title: n.title, impact: n.impact })),
    note: logForm.note.trim(),
    stoppedOnTime: !!day.checks["eod"],
    trades: day.pnl.map((v, i) => ({ v, m: day.times && day.times[i] != null ? day.times[i] : null })),
  });

  const commitEntry = (entry) => {
    setHistory((h) => {
      const next = h.slice();
      const idx = next.findIndex((x) => x.date === entry.date);
      if (idx > -1) next[idx] = entry; else next.push(entry);
      return pruneHistory(next);
    });
  };

  const saveLog = () => {
    commitEntry(buildEntry());
    const ok = writeImage(todayKey(), logImage);
    setImgTick((t) => t + 1);
    setSavedMsg(ok ? "Saved." : "Saved, but the photo was too large to store.");
    setTimeout(() => setSavedMsg(""), 3500);
  };

  const onPickImage = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImgMsg("Please choose an image file.");
      return;
    }
    setImgBusy(true);
    setImgMsg("");
    try {
      setLogImage(await compressImage(file));
    } catch (err) {
      setImgMsg("Couldn't read that image.");
    }
    setImgBusy(false);
  };

  const removeImage = () => {
    setLogImage(null);
    setImgMsg("");
  };

  const dayHasData = () =>
    day.pnl.length > 0 || day.news.length > 0 || day.energy !== null || Object.values(day.checks).some(Boolean);

  const resetToday = () => {
    if (!window.confirm("Reset today's checklist, energy and counters?")) return;
    if (dayHasData()) {
      const already = history.some((h) => h.date === todayKey());
      if (!already) commitEntry(buildEntry());
    }
    setDay({ checks: {}, energy: null, pnl: [], times: [], news: [] });
    setLogForm({ missed: "", note: "" });
    setAlerted([]);
    setGoalCelebrated(false);
    setGoalEvaluated(false);
    setGoalPopup(null);
  };

  const goToSection = (key, id) => {
    setDockActive(key);
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeHistEntry = activeHistDate ? historyByDate[activeHistDate] || null : null;
  const detailImage = useMemo(
    () => (activeHistDate ? readImage(activeHistDate) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeHistDate, imgTick]
  );

  // All hooks have run by this point — safe to branch on auth state now.
  if (!authReady) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#080b17",
        }}
        aria-busy="true"
      />
    );
  }

  if (!authUser) {
    return <Login />;
  }

  // ---------- render helpers ----------
  const renderBlock = (b) => {
    const done = !!day.checks[b.id];
    const isNow = b.id === currentNowId;
    return (
      <div
        key={b.id}
        ref={(el) => { blockRefs.current[b.id] = el; }}
        className={`block ${b.type}${done ? " done" : ""}${isNow ? " now" : ""}`}
      >
        <div className="time">{b.t}</div>
        <div className="main">
          <div className="label">{b.label}</div>
          <div className="desc">{b.desc}</div>
        </div>
        <div
          className="check"
          role="checkbox"
          aria-checked={done}
          tabIndex={0}
          onClick={() => toggleCheck(b.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCheck(b.id); } }}
        >
          {done ? "\u2713" : ""}
        </div>
      </div>
    );
  };

  const pillStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
    background: active ? "var(--btn)" : "var(--surface-2)",
    color: active ? "var(--on-accent)" : "var(--muted)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  });

  return (
    <div className="ts-root" data-theme={theme}>
      <style>{CSS}</style>

      <Ticker
        news={sortedNews}
        nowMin={nowMin}
        netPnl={netPnl}
        trades={day.pnl.length}
        tradeLimit={tradeLimit}
        maxLoss={maxLoss}
        fmt={fmt}
        money={money}
        loading={calFeed.loading && calFeed.items === null}
      />

      <div className="wrap">
        <header className="top" id="ts-top">
          <div className="brand">
            <h1>The Session</h1>
            <button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Switch to dark" : "Switch to light"}
            </button>
            <button className="theme-toggle lg-logout-btn" onClick={handleLogout}>
              Log out
            </button>
            <button className="theme-toggle ts-summit-btn" onClick={handleGoToSummit}>
              🏔️ Summit
            </button>
            <button className="theme-toggle ts-perf-btn" onClick={handleGoToPerformance}>
              📈 Performance
            </button>
            <button className="theme-toggle ts-perf-btn" onClick={handleGoToNews}>
              📰 News
            </button>
          </div>
          <div className="clockbox">
            <div className="time">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
            <div className="date">{now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
            <div className="followrow" onClick={() => setFollow((f) => !f)}>
              <label>Follow the clock</label>
              <input type="checkbox" checked={follow} readOnly onClick={(e) => e.stopPropagation()} onChange={() => setFollow((f) => !f)} />
            </div>
          </div>
        </header>

        <div className="ts-target-card">
          <div className="ts-target-head">
            <span>Monthly target</span>
            {!editingTarget && (
              <button className="limitset" onClick={startEditTarget}>edit target</button>
            )}
          </div>

          {editingTarget ? (
            <div className="ts-target-edit">
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTarget();
                  if (e.key === "Escape") cancelEditTarget();
                }}
              />
              <button className="ts-target-save" onClick={saveTarget}>Save</button>
              <button className="ts-target-cancel" onClick={cancelEditTarget}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="ts-target-top">
                <div className="ts-target-nums">
                  <span className={`ts-target-current${monthProgress > 0 ? " pos" : monthProgress < 0 ? " neg" : ""}`}>
                    <DimMoney text={fmt(monthProgress)} />
                  </span>
                  <span className="ts-target-of">/ {money(monthlyTarget)}</span>
                </div>
                <Ring pct={targetPct} met={targetMet} neg={monthProgress < 0} />
              </div>
              <div className="ts-chips">
                <span className="ts-chip">{"\u2197"} {Math.round(targetPct)}% of target</span>
                <span className="ts-chip">{fmt(netPnl)} · Today</span>
              </div>
              <div className="ts-target-bar">
                <div
                  className={`ts-target-fill${targetMet ? " met" : monthProgress < 0 ? " neg" : ""}`}
                  style={{ width: `${targetPct}%` }}
                />
              </div>
              <div className="ts-target-sub">
                {targetMet
                  ? "Target reached this month. Anything from here is a bonus."
                  : monthProgress < 0
                  ? `${money(Math.abs(monthProgress))} in the hole — ${money(monthlyTarget - monthProgress)} needed to reach target.`
                  : `${money(monthlyTarget - monthProgress)} to go this month.`}
              </div>
            </>
          )}
        </div>

        <div className={`stopband${stopband.limit ? " limit" : ""}`}>
          <div className="dot" />
          <div>
            <strong>{stopband.head}</strong>
            <span>{stopband.sub}</span>
          </div>
        </div>

        <div className="counters">
          <div className={`counter${netPnl <= -maxLoss ? " over" : ""}`} id="pnlCounter">
            <div className="label">
              <span>Net result today</span>
              <button className="limitset" onClick={openLossEdit}>edit max loss</button>
            </div>
            <div className="row">
              <div>
                <span className={`num${netPnl > 0 ? " pos" : netPnl < 0 ? " neg" : ""}`}><DimMoney text={fmt(netPnl)} /></span>{" "}
                <span className="maxof">/ <span>{"\u2212" + money(maxLoss)}</span></span>
              </div>
            </div>
            <div className="pnl-entry" style={{ marginTop: 12 }}>
              <input
                ref={pnlInputRef}
                type="number"
                step="0.01"
                placeholder="P&L"
                value={pnlInput}
                onChange={(e) => setPnlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addResult(); } }}
              />
              <button onClick={addResult}>Log result</button>
            </div>
            <div className="pnl-meter">
              <div className={`pnl-meter-fill${usedFraction >= 0.66 ? " danger" : ""}`} style={{ width: (usedFraction * 100).toFixed(1) + "%" }} />
            </div>
            <div className="pnl-meterlbl">
              {netPnl <= -maxLoss ? "Floor reached. Close the platform." : `${money(maxLoss + Math.min(0, netPnl))} of room left before the floor.`}
            </div>
          </div>

          <div className={`counter${day.pnl.length >= tradeLimit ? " over" : ""}`} id="tradeCounter">
            <div className="label">
              <span>Trades closed</span>
              <button className="limitset" onClick={openCapEdit}>edit cap</button>
            </div>
            <div className="row">
              <div><span className="num">{day.pnl.length}</span> <span className="maxof">/ <span>{tradeLimit}</span></span></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div><span className="num">{wins}{"\u2013"}{losses}{"\u2013"}{breakevens}</span></div>
            </div>
            <div className="pnl-trades">
              {day.pnl.length === 0 ? (
                <span className="pnl-meterlbl">No closed trades yet.</span>
              ) : (
                day.pnl.map((v, i) => (
                  <span className={`chip ${isBreakEven(v) ? "be" : v > 0 ? "win" : "loss"}`} key={i}>
                    <span>{fmt(v)}</span>
                    <button aria-label={"Remove result " + fmt(v)} onClick={() => removeResult(i)}>&times;</button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={`counter goalcard${goalHit ? " hit" : ""}`}>
          <div className="label">
            <span>Daily profit goal</span>
            <button className="limitset" onClick={openGoalEdit}>{dailyTarget > 0 ? "edit goal" : "set goal"}</button>
          </div>
          {dailyTarget > 0 ? (
            <>
              <div className="row">
                <div>
                  <span className={`num${netPnl > 0 ? " pos" : netPnl < 0 ? " neg" : ""}`}><DimMoney text={fmt(netPnl)} /></span>{" "}
                  <span className="maxof">/ {money(dailyTarget)}</span>
                </div>
                <span className="goalpct">{Math.round(goalPct)}%</span>
              </div>
              <div className="pnl-meter">
                <div className={`pnl-meter-fill goalfill${goalHit ? " hit" : ""}`} style={{ width: goalPct + "%" }} />
              </div>
              <div className="pnl-meterlbl">
                {goalHit
                  ? "Goal reached. Protect the day and stop on time."
                  : `${money(dailyTarget - netPnl)} to go today. Check-in at 4:30 PM.`}
              </div>
            </>
          ) : (
            <div className="pnl-meterlbl">No goal set. Tap "set goal" to add one.</div>
          )}
        </div>

        <h2 className="section" id="ts-news">Today's news<span className="sub">fetched automatically for your focus</span></h2>
        <div className="newscard">
          <div className="newslabel" style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
            Focus of the day
          </div>

          <div className="newsfocus" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {FOCUS_OPTIONS.map((s) => {
              const code = FLAG_CODE[s];
              const active = focus.includes(s);
              return (
                <button
                  type="button"
                  key={s}
                  className={`newsfocusbtn ${active ? "active" : ""}`}
                  onClick={() => toggleFocus(s)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: active ? "1px solid transparent" : "1px solid var(--border)",
                    background: active ? "var(--btn)" : "var(--surface-2)",
                    color: active ? "var(--on-accent)" : "var(--text)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {code && (
                    <img
                      src={flagUrl(code)}
                      alt=""
                      style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  {s}
                </button>
              );
            })}
          </div>

          <div className="newsfilters" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {MIN_IMPACT_OPTIONS.map((o) => (
              <button
                key={o.k}
                type="button"
                className={`newsfilter ${minImpact === o.k ? "active" : ""}`}
                onClick={() => setMinImpact(o.k)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  border: minImpact === o.k ? "1px solid transparent" : "1px solid var(--border)",
                  background: minImpact === o.k ? "var(--surface-2)" : "transparent",
                  color: minImpact === o.k ? "var(--text)" : "var(--muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {o.l}
              </button>
            ))}

            <button
              type="button"
              className="newsrefresh"
              onClick={() => calFeed.reload && calFeed.reload()}
              style={{
                marginLeft: "auto",
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>

          <div className="newsmeta" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            {calFeed.loading && calFeed.items === null
              ? "Fetching today's events…"
              : calFeed.error && calFeed.items === null
              ? "Couldn't load the calendar. Tap refresh to retry."
              : sortedNews.length === 0
              ? "No events today for your focus markets."
              : `${sortedNews.length} ${sortedNews.length === 1 ? "event" : "events"} today for ${focus.join(", ")}.`}
          </div>

          <div>
            {sortedNews.map((n) => {
              const code = flagCodeFor({ country: n.country, symbols: n.symbols || [] });
              return (
                <div className="newsitem" key={n.id || n.title + n.time}>
                  <span className={`impact ${n.impact}`} />
                  <span className="ntime">{n.time || "--:--"}</span>
                  {code && (
                    <img
                      src={flagUrl(code)}
                      alt=""
                      style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <span className="ntitle">{n.title}</span>
                  <span className="nrule">{IMPACT_RULE[n.impact]}</span>
                  {!n.auto && (
                    <button className="ndel" aria-label={"Remove " + n.title} onClick={() => removeNews(n.id)}>
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {highNews.length > 0 && (
            <div className="newsflag" style={{ display: "block" }}>
              {highNews.length === 1
                ? `One red event today at ${highNews[0].time || "an unset time"}. Plan to be flat 30 minutes either side of it.`
                : `${highNews.length} red events today. The gaps between them are the only real trading windows — size down and expect fewer setups.`}
            </div>
          )}
        </div>

        <h2 className="section" id="ts-day">Right now<span className="sub">auto-updates as the day moves</span></h2>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button onClick={() => setViewMode("focus")} style={pillStyle(viewMode === "focus")}>Focus</button>
          <button onClick={() => setViewMode("full")} style={pillStyle(viewMode === "full")}>Full day</button>
        </div>

        {viewMode === "focus" ? (
          currentBlock ? (
            <FocusCard
              key={currentBlock.id}
              block={currentBlock}
              done={!!day.checks[currentBlock.id]}
              onToggle={() => toggleCheck(currentBlock.id)}
              isTrade={currentBlock.type === "trade"}
              isEnergy={currentBlock.id === "eod"}
              energy={day.energy}
              onEnergy={(i) => setDay((d) => ({ ...d, energy: i }))}
              pnlInputRef={pnlInputRef}
              pnlInput={pnlInput}
              setPnlInput={setPnlInput}
              addResult={addResult}
              netPnl={netPnl}
              maxLoss={maxLoss}
              fmt={fmt}
              money={money}
              usedFraction={usedFraction}
            />
          ) : (
            <NextUpCard key="nextup" nextBlock={nextBlock} minsUntil={nextBlock ? nextBlock.start - nowMin : 0} />
          )
        ) : (
          <>
            <h2 className="section">Preparation<span className="sub">10:30 – 11:00</span></h2>
            <div>{SCHEDULE.prep.map(renderBlock)}</div>

            <h2 className="section">The window<span className="sub">11:00 – 16:50 EAT</span></h2>
            <div>{SCHEDULE.session.map(renderBlock)}</div>

            <h2 className="section">Wrap-up<span className="sub">16:50 – 17:00</span></h2>
            <div>{SCHEDULE.close.map(renderBlock)}</div>

            <div className="energybar">
              <div className="lbl">Energy check-in — be honest about how the day felt</div>
              <div className="energyrow">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} className={day.energy === i ? "sel" : ""} onClick={() => setDay((d) => ({ ...d, energy: i }))}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <h2 className="section">End-of-day log</h2>
        <div className="logcard">
          <div className="logstats">
            <div className="logstat">
              <div className="v pos">{wins}</div>
              <div className="l">Wins</div>
            </div>
            <div className="logstat">
              <div className="v neg">{losses}</div>
              <div className="l">Losses</div>
            </div>
            <div className="logstat">
              <div className="v be">{breakevens}</div>
              <div className="l">Break even</div>
            </div>
            <div className="logstat">
              <div className="v">{day.pnl.length}</div>
              <div className="l">Trades</div>
            </div>
          </div>

          <div className="logauto">
            Counted automatically from your trade log. Break even = between {"\u2212"}{money(BE_LIMIT)} and +{money(BE_LIMIT)}.
          </div>

          <label>What actually happened (one line, be blunt)</label>
          <textarea
            placeholder="e.g. good until 2pm, forced two trades after the break"
            value={logForm.note}
            onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
          />

          <label>Missed setups <span className="opt">optional</span></label>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={logForm.missed}
            onChange={(e) => setLogForm((f) => ({ ...f, missed: e.target.value }))}
          />

          <label>Screenshot <span className="opt">optional</span></label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} hidden />
          {logImage ? (
            <div className="upload-preview">
              <img src={logImage} alt="Day screenshot preview" onClick={() => setLightbox(logImage)} />
              <div className="upload-actions">
                <button type="button" onClick={() => fileInputRef.current?.click()}>Replace</button>
                <button type="button" onClick={removeImage}>Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" className="upload-box" onClick={() => fileInputRef.current?.click()} disabled={imgBusy}>
              {imgBusy ? "Processing…" : "＋ Add a chart or trade screenshot"}
            </button>
          )}
          {imgMsg && <div className="upload-err">{imgMsg}</div>}

          <button className="savebtn" onClick={saveLog}>Save today's log</button>
          <div className="savedmsg">{savedMsg}</div>
        </div>

        <div className="history" id="ts-history">
          <h2 className="section" style={{ marginTop: 0 }}>History<span className="sub">tap a day to see what happened</span></h2>
          <div className="ts-glass ts-calcard">
            <div className="ts-cal-jump">
              <select
                value={calendarMonth.m}
                onChange={(e) => setCalendarMonth((c) => ({ ...c, m: Number(e.target.value) }))}
              >
                {monthNames.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              <select
                value={calendarMonth.y}
                onChange={(e) => setCalendarMonth((c) => ({ ...c, y: Number(e.target.value) }))}
              >
                {calendarYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button className="ts-cal-today" onClick={jumpToToday}>Today</button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <button onClick={goPrevMonth} className="ts-cal-nav" aria-label="Previous month">‹</button>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)" }}>{monthLabel}</div>
              <button onClick={goNextMonth} className="ts-cal-nav" aria-label="Next month">›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", fontSize: "10.5px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px", textAlign: "center" }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
              {monthGrid.map((date, i) => {
                if (!date) return <div key={i} style={{ aspectRatio: "1" }} />;
                const entry = historyByDate[date];
                const isToday = date === todayKey();
                const net = entry?.net ?? null;
                const tone =
                  net === null ? { background: "var(--surface-2)", color: "var(--muted)" }
                  : net > 0 ? { background: "var(--teal-dim)", color: "var(--teal)" }
                  : net < 0 ? { background: "var(--rose-dim)", color: "var(--rose)" }
                  : { background: "var(--surface-2)", color: "var(--text)" };
                return (
                  <button
                    key={date}
                    onClick={() => entry && setActiveHistDate((cur) => (cur === date ? null : date))}
                    disabled={!entry}
                    style={{
                      aspectRatio: "1",
                      borderRadius: "14px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "2px",
                      border: activeHistDate === date ? "2px solid var(--text)" : "1px solid transparent",
                      transition: "all 0.2s ease",
                      cursor: entry ? "pointer" : "default",
                      opacity: entry ? 1 : 0.5,
                      ...tone,
                      outline: isToday ? "1.5px solid var(--amber)" : "none",
                      outlineOffset: "1px",
                    }}
                    onMouseEnter={(e) => { if (entry) e.currentTarget.style.filter = "brightness(1.12)"; }}
                    onMouseLeave={(e) => { if (entry) e.currentTarget.style.filter = "brightness(1)"; }}
                  >
                    <span>{Number(date.slice(-2))}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeHistEntry && (
            <div className="daydetail show">
              <div className="ddhead">
                <strong>{new Date(activeHistEntry.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</strong>
              </div>

              <div className="ddgrid">
                <div className="ddstat">
                  <div className={`v${(activeHistEntry.net ?? 0) > 0 ? " pos" : (activeHistEntry.net ?? 0) < 0 ? " neg" : ""}`}>{fmt(activeHistEntry.net ?? 0)}</div>
                  <div className="l">net</div>
                </div>
                <div className="ddstat"><div className="v">{activeHistEntry.wins ?? 0}</div><div className="l">wins</div></div>
                <div className="ddstat"><div className="v">{activeHistEntry.losses ?? 0}</div><div className="l">losses</div></div>
                <div className="ddstat"><div className="v" style={{ color: "var(--warn)" }}>{activeHistEntry.breakeven ?? 0}</div><div className="l">break even</div></div>
                <div className="ddstat"><div className="v">{activeHistEntry.missed ?? 0}</div><div className="l">missed</div></div>
              </div>

              {activeHistEntry.note && (
                <>
                  <div className="ddlabel">Notes</div>
                  <div className="ddnote">"{activeHistEntry.note}"</div>
                </>
              )}

              <div className="ddnews">
                {activeHistEntry.news && activeHistEntry.news.length
                  ? activeHistEntry.news.map((n) => `${n.time || "--:--"} \u00b7 ${n.title}`).join(" \u00b7 ")
                  : "No news logged that day."}
              </div>

              {detailImage && (
                <>
                  <div className="ddlabel">Screenshot</div>
                  <button type="button" className="ddimg" onClick={() => setLightbox(detailImage)} aria-label="View screenshot full size">
                    <img src={detailImage} alt="Screenshot from this day" />
                  </button>
                </>
              )}

              <button className="ddclose" onClick={() => setActiveHistDate(null)}>Close</button>
            </div>
          )}

          <div className="streak">
            <div className="n">{streak}</div>
            <div className="t">day streak stopping on time, without blowing the loss limit</div>
          </div>
        </div>

        <footer>
          {syncLabel} <button className="resetlink" onClick={resetToday}>Reset today</button>
        </footer>
      </div>

      <button
        className={`nowbtn${nowBtnVisible ? " show" : ""}`}
        type="button"
        onClick={() => scrollToNow(true)}
      >
        <span className="pulse" />
        <span className="what">{nowBlockLabel}</span>
        <span>Back to now</span>
      </button>

      <HoloClock />

      <nav className="ts-dock" aria-label="Sections">
        {DOCK.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ts-dock-btn${dockActive === t.key ? " active" : ""}`}
            onClick={() => goToSection(t.key, t.id)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.d} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {lightbox && (
        <div className="ts-modal-backdrop" onClick={() => setLightbox(null)}>
          <img
            className="ts-lightbox-img"
            src={lightbox}
            alt="Screenshot full size"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pendingAlert && (
        <div className="ts-modal-backdrop ts-alert-backdrop" onClick={dismissAlert}>
          <div
            className={`ts-modal ts-alert ${pendingAlert.impact}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ts-alert-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ts-alert-icon" aria-hidden="true">🔔</div>
            <div className="ts-alert-kicker" id="ts-alert-title">{IMPACT_LABEL[pendingAlert.impact]}</div>
            <div className="ts-alert-title">
              News in {pendingAlert.minsLeft} {pendingAlert.minsLeft === 1 ? "minute" : "minutes"}
            </div>
            <div className="ts-alert-event">{pendingAlert.title}</div>
            <div className="ts-alert-time">Scheduled for {pendingAlert.time}</div>
            <div className="ts-alert-rule">{IMPACT_RULE[pendingAlert.impact]}</div>
            <button type="button" className="ts-modal-btn primary ts-alert-btn" onClick={dismissAlert}>Got it</button>
          </div>
        </div>
      )}

      <GoalPopup popup={goalPopup} onClose={() => setGoalPopup(null)} />

      <EditLimitModal
        mode={editModal}
        maxLoss={maxLoss}
        currency={currency}
        tradeLimit={tradeLimit}
        dailyTarget={dailyTarget}
        onClose={() => setEditModal(null)}
        onSaveLoss={(v, c) => { setMaxLoss(v); setCurrency(c); }}
        onSaveCap={(v) => setTradeLimit(v)}
        onSaveGoal={(v) => setDailyTarget(v)}
      />
    </div>
  );
}

// ---------- scoped styles ----------
const CSS = `
.ts-root{
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
--hero:linear-gradient(155deg,#25356a 0%,#16224a 48%,#0a1028 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.16) inset,0 30px 60px -26px rgba(0,0,0,.95),0 0 40px -10px rgba(232,201,122,.12);
--hero-ink:#0a1028;
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--meter:linear-gradient(90deg,#a07f35,#f6e0a2);
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--shadow-card-hover:0 1px 0 rgba(255,255,255,.11) inset,0 26px 50px -18px rgba(0,0,0,1);
--glow-amber:rgba(232,201,122,.30); --glow-rose:rgba(255,107,125,.38);
--dock-bg:rgba(11,16,32,.88);
--r-card:26px; --r-input:14px; --r-pill:999px;

padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
box-sizing:border-box; min-height:100vh; position:relative;
background:var(--bg-grad); background-attachment:fixed;
color:var(--text); font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.ts-root[data-theme="light"]{
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
--hero:linear-gradient(155deg,#2c5c9c 0%,#1b4180 50%,#10284f 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 28px 54px -24px rgba(16,40,90,.7);
--hero-ink:#10284f;
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--meter:linear-gradient(90deg,#2f6fc4,#78aeee);
--modal-bg:#eef4ff;
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--shadow-card-hover:0 1px 0 rgba(255,255,255,1) inset,0 22px 42px -18px rgba(38,72,150,.48);
--glow-amber:rgba(233,169,42,.42); --glow-rose:rgba(214,60,51,.28);
--dock-bg:rgba(20,50,104,.9);
}
.ts-root::before{
  content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
    radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
    radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);
}
.ts-root .wrap{position:relative; z-index:1; max-width:520px; margin:0 auto; padding:26px 18px 150px;}
.ts-root *{box-sizing:border-box;}
.ts-root ::selection{background:var(--amber);color:var(--on-accent);}
.ts-root button{font-family:inherit;}
.ts-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.ts-root [id^="ts-"]{scroll-margin-top:16px;}
.ts-root .num,.ts-root .ts-target-current,.ts-root .clockbox .time,.ts-root .streak .n{font-variant-numeric:tabular-nums;}
.ts-root .ts-dim{opacity:.5;}

/* ---------- glass surfaces (shared) ---------- */
.ts-root .stopband,.ts-root .counter,.ts-root .block,.ts-root .newscard,.ts-root .logcard,
.ts-root .streak,.ts-root .daydetail,.ts-root .ts-glass{
  background:var(--surface);
  -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur);
  border:1px solid var(--border);
  box-shadow:var(--shadow-card);
}
.ts-root .ts-calcard{border-radius:var(--r-card);padding:16px;}

/* ---------- header ---------- */
.ts-root header.top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:4px;}
.ts-root .brand{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
.ts-root .brand h1{width:100%;font-weight:800;font-size:clamp(26px,6vw,32px);margin:0 0 8px;letter-spacing:-.03em;line-height:1.05;}
.ts-root .theme-toggle{margin:0;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:6px 12px;font-size:11.5px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.ts-root .theme-toggle:hover{border-color:var(--amber);color:var(--text);}
.ts-root .lg-logout-btn{margin-left:0;}
.ts-root .ts-summit-btn{background:var(--btn);color:var(--on-accent);border-color:transparent;font-weight:800;}
.ts-root .ts-perf-btn{background:var(--surface-2);color:var(--text);font-weight:800;}
.ts-root .clockbox{text-align:right;flex-shrink:0;}
.ts-root .clockbox .time{font-size:26px;font-weight:800;letter-spacing:-.02em;}
.ts-root .clockbox .date{font-size:12px;color:var(--muted);font-weight:500;}
.ts-root .followrow{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin-top:10px;font-size:11.5px;color:var(--muted);cursor:pointer;user-select:none;}
.ts-root .followrow input{accent-color:var(--amber);width:14px;height:14px;cursor:pointer;margin:0;}

/* ---------- hero (monthly target) ---------- */
.ts-root .ts-target-card{
  position:relative; overflow:hidden; margin:18px 0 14px; padding:20px 20px 18px;
  border-radius:30px; border:1px solid rgba(255,255,255,.3);
  background:var(--hero); color:#fff;
  box-shadow:var(--hero-shadow);
}
.ts-root .ts-target-card::after{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(420px 220px at 100% -10%,rgba(255,255,255,.3),transparent 65%);
}
.ts-root .ts-target-card>*{position:relative;z-index:1;}
.ts-root .ts-target-head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:500;color:rgba(255,255,255,.85);margin-bottom:10px;}
.ts-root .ts-target-card .limitset{color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:var(--r-pill);padding:4px 11px;text-decoration:none;font-weight:600;}
.ts-root .ts-target-card .limitset:hover{background:rgba(255,255,255,.26);color:#fff;}
.ts-root .ts-target-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.ts-root .ts-target-nums{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0;}
.ts-root .ts-target-current{font-size:clamp(34px,10vw,46px);font-weight:700;letter-spacing:-.035em;line-height:1;color:#fff;}
.ts-root .ts-target-current.neg{color:#ffd0ca;}
.ts-root .ts-target-of{font-size:14px;color:rgba(255,255,255,.75);font-weight:500;}
.ts-root .ts-ring{flex-shrink:0;filter:drop-shadow(0 6px 14px rgba(5,20,60,.35));}
.ts-root .ts-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
.ts-root .ts-chip{font-size:12px;font-weight:600;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);border-radius:var(--r-pill);padding:5px 11px;font-variant-numeric:tabular-nums;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.ts-root .ts-target-bar{height:10px;border-radius:var(--r-pill);background:rgba(255,255,255,.22);overflow:hidden;}
.ts-root .ts-target-fill{height:100%;border-radius:var(--r-pill);background:#fff;transition:width .35s ease;}
.ts-root .ts-target-fill.met{background:#8dffc0;}
.ts-root .ts-target-fill.neg{background:#ffb0a8;}
.ts-root .ts-target-sub{font-size:12px;color:rgba(255,255,255,.85);margin-top:10px;}
.ts-root .ts-target-edit{display:flex;gap:8px;align-items:center;}
.ts-root .ts-target-edit input{flex:1;min-width:0;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.32);border-radius:12px;color:#fff;padding:10px 12px;font-size:15px;font-family:inherit;}
.ts-root .ts-target-save{border:none;background:#fff;color:var(--hero-ink);border-radius:12px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;}
.ts-root .ts-target-cancel{border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.14);color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;cursor:pointer;}

/* ---------- stop band ---------- */
.ts-root .stopband{margin:0 0 14px;border-radius:var(--r-card);padding:14px 16px;display:flex;gap:14px;align-items:center;}
.ts-root .stopband .dot{width:10px;height:10px;border-radius:50%;background:var(--teal);flex-shrink:0;box-shadow:0 0 0 4px var(--teal-dim);}
.ts-root .stopband.limit .dot{background:var(--rose);box-shadow:0 0 0 4px var(--rose-dim);}
.ts-root .stopband.limit{animation:ts-breathe 2.6s ease-in-out infinite;}
.ts-root .stopband strong{display:block;font-size:15.5px;font-weight:700;letter-spacing:-.01em;margin-bottom:2px;}
.ts-root .stopband span{font-size:12.5px;color:var(--muted);}

/* ---------- counters ---------- */
.ts-root .counters{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;}
.ts-root #pnlCounter{grid-column:1 / -1;}
.ts-root .counter{border-radius:var(--r-card);padding:16px 18px;}
.ts-root .counter .label{font-size:12.5px;font-weight:500;color:var(--muted);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}
.ts-root .counter .row{display:flex;align-items:center;justify-content:space-between;}
.ts-root .counter .num{font-size:44px;font-weight:700;letter-spacing:-.035em;line-height:1;}
.ts-root .counter .maxof{font-size:13px;color:var(--muted);font-weight:500;}
.ts-root .num.pos{color:var(--teal);}
.ts-root .num.neg{color:var(--rose);}
.ts-root .counter.over{border-color:var(--rose);}
.ts-root .counter.over .num{color:var(--rose);}
.ts-root .limitset{border:none;background:none;color:var(--muted);font-size:11.5px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:0;}
.ts-root .limitset:hover{color:var(--text);}
.ts-root .pnl-entry{display:flex;gap:8px;}
.ts-root .pnl-entry input{width:130px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:10px 12px;font-size:14px;font-family:inherit;font-variant-numeric:tabular-nums;}
.ts-root .pnl-entry button{border:none;background:var(--btn);color:var(--on-accent);font-weight:700;border-radius:var(--r-input);padding:10px 16px;font-size:13px;cursor:pointer;white-space:nowrap;box-shadow:0 8px 18px -8px var(--glow-amber);transition:transform .15s ease;}
.ts-root .pnl-entry button:active{transform:scale(.97);}
.ts-root .pnl-meter{height:8px;border-radius:var(--r-pill);background:var(--surface-2);margin-top:16px;overflow:hidden;}
.ts-root .pnl-meter-fill{height:100%;width:0%;border-radius:var(--r-pill);background:var(--meter);transition:width .3s ease;}
.ts-root .pnl-meter-fill.danger{background:linear-gradient(90deg,#ff9a8f,var(--rose));}
.ts-root .pnl-meterlbl{font-size:11.5px;color:var(--muted);margin-top:8px;}
.ts-root .pnl-trades{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}
.ts-root .chip{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;border:1px solid var(--border);background:var(--surface-2);border-radius:var(--r-pill);padding:4px 8px 4px 11px;display:flex;align-items:center;gap:6px;}
.ts-root .chip.win{border-color:var(--teal);color:var(--teal);background:var(--teal-dim);}
.ts-root .chip.loss{border-color:var(--rose);color:var(--rose);background:var(--rose-dim);}
.ts-root .chip.be{border-color:var(--warn);color:var(--warn);background:var(--warn-dim);}
.ts-root .chip button{background:none;border:none;color:inherit;opacity:.6;cursor:pointer;font-size:14px;padding:0;line-height:1;}
.ts-root .chip button:hover{opacity:1;}

/* ---------- section titles ---------- */
.ts-root h2.section{font-weight:700;font-size:19px;letter-spacing:-.02em;margin:34px 0 14px;padding:0 4px;border:none;display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.ts-root h2.section .sub{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0;text-align:right;}

/* ---------- schedule blocks ---------- */
.ts-root .block{display:flex;gap:14px;border-radius:22px;padding:14px 16px;margin-bottom:10px;position:relative;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;scroll-margin-top:calc(84px + env(safe-area-inset-top,0px));}
.ts-root .block:hover{transform:translateY(-1px);}
.ts-root .block.prep{box-shadow:inset 3px 0 0 var(--amber),var(--shadow-card);}
.ts-root .block.trade{box-shadow:inset 3px 0 0 var(--amber),var(--shadow-card);}
.ts-root .block.rest{box-shadow:inset 3px 0 0 var(--teal),var(--shadow-card);}
.ts-root .block.stop{box-shadow:inset 3px 0 0 var(--rose),var(--shadow-card);}
.ts-root .block .time{flex-shrink:0;width:92px;font-size:12px;font-weight:500;color:var(--muted);padding-top:2px;font-variant-numeric:tabular-nums;line-height:1.45;}
.ts-root .block .main{flex:1;min-width:0;}
.ts-root .block .label{font-size:15px;font-weight:700;margin-bottom:2px;letter-spacing:-.01em;}
.ts-root .block .desc{font-size:12.5px;color:var(--muted);line-height:1.45;}
.ts-root .block .check{flex-shrink:0;width:28px;height:28px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface-2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:transparent;font-size:15px;font-weight:700;align-self:flex-start;margin-top:1px;transition:all .18s ease;}
.ts-root .block .check:hover{border-color:var(--amber);}
.ts-root .block.done .check{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.ts-root .block.done .label{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--border);}
.ts-root .block.now{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber) inset,0 0 28px 2px var(--glow-amber);}
.ts-root .block.now .time::before{content:"now";display:block;color:var(--accent-text);font-weight:800;font-size:11px;letter-spacing:.02em;margin-bottom:2px;}
.ts-root .block.just-scrolled{animation:ts-nudge .9s ease-out;}
@keyframes ts-nudge{0%{box-shadow:0 0 0 1px var(--amber) inset,0 0 0 0 var(--amber-dim);}35%{box-shadow:0 0 0 1px var(--amber) inset,0 0 0 8px var(--amber-dim);}100%{box-shadow:0 0 0 1px var(--amber) inset,0 0 0 0 transparent;}}
@keyframes ts-breathe{0%,100%{box-shadow:var(--shadow-card),0 0 0 0 var(--glow-rose);}50%{box-shadow:var(--shadow-card),0 0 28px 4px var(--glow-rose);}}

/* ---------- energy ---------- */
.ts-root .energybar{margin:18px 0 0;}
.ts-root .energybar .lbl{font-size:12.5px;color:var(--muted);margin-bottom:8px;padding:0 4px;}
.ts-root .energyrow{display:flex;gap:8px;}
.ts-root .energyrow button{flex:1;height:40px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;font-size:13.5px;font-weight:600;transition:all .18s ease;}
.ts-root .energyrow button.sel{background:var(--btn);border-color:transparent;color:var(--on-accent);font-weight:800;}

/* ---------- news ---------- */
.ts-root .newscard{border-radius:var(--r-card);padding:16px;}
.ts-root .newsform{display:grid;grid-template-columns:1fr 110px 168px auto;gap:8px;}
.ts-root .newsform input,.ts-root .newsform select{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:10px 12px;font-size:13.5px;font-family:inherit;width:100%;}
.ts-root .newsform button{border:none;background:var(--btn);color:var(--on-accent);font-weight:700;border-radius:var(--r-input);padding:10px 16px;font-size:13.5px;cursor:pointer;white-space:nowrap;}
.ts-root .newsitem{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);}
.ts-root .newsitem:last-child{border-bottom:none;}
.ts-root .newsitem .impact{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ts-root .impact.high{background:var(--rose);box-shadow:0 0 0 3px var(--rose-dim);}
.ts-root .impact.med{background:var(--warn);box-shadow:0 0 0 3px var(--warn-dim);}
.ts-root .impact.low{background:var(--teal);box-shadow:0 0 0 3px var(--teal-dim);}
.ts-root .newsitem .ntime{font-size:12.5px;color:var(--muted);width:46px;flex-shrink:0;font-variant-numeric:tabular-nums;}
.ts-root .newsitem .ntitle{flex:1;font-size:14px;font-weight:500;min-width:0;overflow-wrap:anywhere;}
.ts-root .newsitem .nrule{font-size:11.5px;color:var(--muted);flex-shrink:0;}
.ts-root .newsitem .ndel{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;line-height:1;}
.ts-root .newsitem .ndel:hover{color:var(--text);}
.ts-root .newsempty{font-size:13px;color:var(--muted);padding-top:14px;line-height:1.45;}
.ts-root .newsflag{margin-top:14px;border-radius:16px;padding:12px 14px;font-size:13px;background:var(--rose-dim);color:var(--text);}

/* ---------- log ---------- */
.ts-root .logcard{border-radius:var(--r-card);padding:18px;margin-top:8px;}
.ts-root .logcard label{display:block;font-size:12.5px;font-weight:500;color:var(--muted);margin:12px 0 6px;}
.ts-root .logcard label:first-child{margin-top:0;}
.ts-root .logrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.ts-root .logcard input[type=number],.ts-root .logcard textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:10px 12px;font-size:14px;font-family:inherit;}
.ts-root .logcard textarea{resize:vertical;min-height:64px;}
.ts-root .savebtn{margin-top:16px;width:100%;padding:14px;border-radius:16px;border:none;background:var(--btn);color:var(--on-accent);font-weight:800;font-size:14.5px;cursor:pointer;box-shadow:0 12px 24px -12px var(--glow-amber);transition:transform .15s ease;}
.ts-root .savebtn:active{transform:scale(.985);}
.ts-root .savedmsg{font-size:12.5px;color:var(--teal);margin-top:8px;height:14px;font-weight:600;}

/* ---------- history ---------- */
.ts-root .history{margin-top:34px;}
.ts-root .ts-cal-jump{display:flex;gap:6px;margin-bottom:12px;}
.ts-root .ts-cal-jump select{flex:1;min-width:0;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:8px 10px;font-size:12.5px;font-family:inherit;}
.ts-root .ts-cal-today{border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:12px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;}
.ts-root .ts-cal-today:hover{border-color:var(--amber);color:var(--text);}
.ts-root .ts-cal-nav{background:var(--surface-2);border:1px solid var(--border);color:var(--text);cursor:pointer;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;}
.ts-root .ts-cal-nav:hover{border-color:var(--amber);}
.ts-root .daydetail{margin-top:14px;border-radius:22px;padding:16px 18px;}
.ts-root .daydetail .ddhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);}
.ts-root .daydetail .ddhead strong{font-size:14.5px;font-weight:700;}
.ts-root .daydetail .ddhead span{font-size:12px;color:var(--muted);}
.ts-root .ddgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px;}
.ts-root .ddstat{text-align:center;}
.ts-root .ddstat .v{font-size:18px;font-weight:700;}
.ts-root .ddstat .v.pos{color:var(--teal);}
.ts-root .ddstat .v.neg{color:var(--rose);}
.ts-root .ddstat .l{font-size:10.5px;color:var(--muted);margin-top:2px;}
.ts-root .ddnote{font-size:13px;line-height:1.5;font-style:italic;}
.ts-root .ddnews{margin-top:8px;font-size:12px;color:var(--muted);}
.ts-root .ddclose{margin-top:12px;background:none;border:none;color:var(--muted);text-decoration:underline;font-size:12px;cursor:pointer;padding:0;}
.ts-root .streak{display:flex;gap:14px;align-items:center;margin-top:16px;border-radius:22px;padding:14px 18px;}
.ts-root .streak .n{font-size:38px;font-weight:800;letter-spacing:-.03em;color:var(--accent-text);}
.ts-root .streak .t{font-size:12.5px;color:var(--muted);line-height:1.4;}
.ts-root footer{margin-top:40px;text-align:center;font-size:12px;color:var(--muted);}
.ts-root .resetlink{background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;font-size:12px;}
.ts-root .resetlink:hover{color:var(--text);}

/* ---------- floating "back to now" pill ---------- */
.ts-root .nowbtn{position:fixed;left:50%;transform:translate(-50%,16px);bottom:calc(128px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);color:var(--text);border-radius:var(--r-pill);padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 14px 30px -10px rgba(5,15,40,.55);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}
.ts-root .nowbtn.show{opacity:1;pointer-events:auto;transform:translate(-50%,0);}
.ts-root .nowbtn:hover{border-color:var(--amber);}
.ts-root .nowbtn .pulse{width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0;box-shadow:0 0 0 4px var(--amber-dim);}
.ts-root .nowbtn .what{color:var(--muted);font-weight:500;}

/* ---------- bottom dock ---------- */
.ts-root .ts-dock{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:45;width:min(calc(100% - 28px),484px);display:flex;justify-content:space-between;gap:4px;padding:8px;border-radius:30px;background:var(--dock-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 22px 44px -16px rgba(2,10,30,.7);}
.ts-root .ts-dock-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px 7px;border:none;background:none;color:var(--muted);font-size:11px;font-weight:600;border-radius:22px;cursor:pointer;transition:all .18s ease;}
.ts-root .ts-dock-btn:hover{color:var(--text);}
.ts-root .ts-dock-btn.active{color:var(--on-accent);background:var(--btn);box-shadow:0 10px 20px -10px var(--glow-amber);}

/* ---------- responsive ---------- */
@media (max-width:420px){.ts-root .nowbtn .what{display:none;}}
@media (max-width:600px){
  .ts-root .newsform{grid-template-columns:1fr 1fr;}
  .ts-root .newsform input:first-of-type{grid-column:1 / -1;}
  .ts-root .newsform button{grid-column:1 / -1;}
  .ts-root .newsitem .nrule{display:none;}
  .ts-root .pnl-entry input{width:100px;}
}
@media (max-width:480px){
  .ts-root .block{gap:10px;padding:13px;}
  .ts-root .block .time{width:70px;font-size:11.5px;}
  .ts-root .logrow{grid-template-columns:1fr 1fr;}
  .ts-root .logstat .v{font-size:22px;}
}
@media (min-width:900px){.ts-root .wrap{max-width:560px;}}

/* ---------- focus card + modal ---------- */
.ts-focus-enter{animation:ts-focus-fade .35s ease;}
@keyframes ts-focus-fade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.ts-modal-backdrop{position:fixed;inset:0;background:rgba(3,10,30,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;z-index:100;animation:ts-modal-fade .2s ease;}
@media (min-width:640px){.ts-modal-backdrop{align-items:center;padding:20px;}}
@keyframes ts-modal-fade{from{opacity:0;}to{opacity:1;}}
.ts-modal{width:100%;max-width:420px;background:var(--surface);background-color:var(--modal-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:28px 28px 0 0;padding:24px 22px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.4);animation:ts-modal-up .25s ease;color:var(--text);font-family:'Plus Jakarta Sans',system-ui,sans-serif;}
@media (min-width:640px){.ts-modal{border-radius:28px;padding:24px 26px;}}
@keyframes ts-modal-up{from{transform:translateY(24px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.ts-modal-title{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px;}
.ts-modal-sub{font-size:13px;color:var(--muted);margin-bottom:18px;line-height:1.4;}
.ts-modal-row{display:flex;gap:10px;}
.ts-modal-field{margin-bottom:16px;flex:1;}
.ts-modal-field label{display:block;font-size:12px;font-weight:500;color:var(--muted);margin-bottom:6px;}
.ts-modal-field input{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;color:var(--text);padding:12px 14px;font-size:15px;font-family:inherit;}
.ts-modal-field input:focus{border-color:var(--amber);outline:none;}
.ts-modal-actions{display:flex;gap:10px;margin-top:4px;}
.ts-modal-btn{flex:1;padding:13px;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid transparent;}
.ts-modal-btn.ghost{background:var(--surface-2);border-color:var(--border);color:var(--text);}
.ts-modal-btn.primary{background:var(--btn);color:var(--on-accent);}

@media (prefers-reduced-motion:reduce){
  .ts-root .block.just-scrolled,.ts-focus-enter,.ts-modal-backdrop,.ts-modal,.ts-root .stopband.limit{animation:none;}
}

/* ---------- auto stats + upload + day photo ---------- */
.ts-root .logstats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.ts-root .logstat{background:var(--surface-2);border:1px solid var(--border);border-radius:16px;padding:12px 8px;text-align:center;}
.ts-root .logstat .v{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;}
.ts-root .logstat .v.pos{color:var(--teal);}
.ts-root .logstat .v.neg{color:var(--rose);}
.ts-root .logstat .v.be{color:var(--warn);}
.ts-root .logstat .l{font-size:11px;color:var(--muted);margin-top:6px;font-weight:600;}
.ts-root .logauto{font-size:11.5px;color:var(--muted);margin:8px 2px 4px;}
.ts-root .logcard .opt{font-weight:500;opacity:.7;font-size:11px;margin-left:4px;}
.ts-root .logcard input[type=number]{margin:0;}
.ts-root .upload-box{width:100%;padding:18px;border-radius:var(--r-input);border:1.5px dashed var(--border);background:var(--surface-2);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;transition:all .18s ease;}
.ts-root .upload-box:hover{border-color:var(--amber);color:var(--text);}
.ts-root .upload-preview{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);}
.ts-root .upload-preview img{display:block;width:100%;max-height:220px;object-fit:cover;cursor:zoom-in;}
.ts-root .upload-actions{position:absolute;right:8px;bottom:8px;display:flex;gap:6px;}
.ts-root .upload-actions button{border:none;border-radius:var(--r-pill);padding:6px 12px;font-size:11.5px;font-weight:700;cursor:pointer;background:rgba(0,0,0,.6);color:#fff;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.ts-root .upload-err{font-size:12px;color:var(--rose);margin-top:8px;}
.ts-root .ddlabel{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px;}
.ts-root .ddimg{display:block;width:100%;padding:0;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface-2);cursor:zoom-in;}
.ts-root .ddimg img{display:block;width:100%;max-height:240px;object-fit:cover;}
.ts-lightbox-img{max-width:100%;max-height:88vh;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);}

/* dark-only: premium obsidian & gold details */
.ts-root:not([data-theme="light"])::after{
  content:""; position:fixed; left:0; right:0; top:0; height:360px; pointer-events:none; z-index:0;
  background-image:
    radial-gradient(520px 200px at 50% -40px,rgba(232,201,122,.14),transparent 70%),
    linear-gradient(rgba(190,205,255,.028) 1px,transparent 1px),
    linear-gradient(90deg,rgba(190,205,255,.028) 1px,transparent 1px);
  background-size:100% 100%,34px 34px,34px 34px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
}
.ts-root:not([data-theme="light"]) .ts-target-card{border-color:rgba(232,201,122,.30);}
.ts-root:not([data-theme="light"]) .ts-target-card::after{background:radial-gradient(420px 220px at 100% -10%,rgba(232,201,122,.22),transparent 65%);}
.ts-root:not([data-theme="light"]) .brand h1{
  font-weight:700;letter-spacing:-.035em;
  background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
}
.ts-root:not([data-theme="light"]) .ts-summit-btn{box-shadow:0 8px 20px -10px rgba(232,201,122,.55);}
.ts-root:not([data-theme="light"]) .theme-toggle:hover{border-color:rgba(232,201,122,.55);}
.ts-root:not([data-theme="light"]) .block.now{box-shadow:0 0 0 1px var(--amber) inset,0 0 32px 2px rgba(232,201,122,.22);}
.ts-root:not([data-theme="light"]) .ts-dock{border-color:rgba(232,201,122,.14);box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 24px 48px -16px rgba(0,0,0,.85);}
.ts-root:not([data-theme="light"]) .ts-dock-btn.active{box-shadow:0 8px 20px -8px rgba(232,201,122,.55);}
.ts-root:not([data-theme="light"]) .streak .n{background:linear-gradient(180deg,#f6e0a2,#c99f48);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;}
.ts-root:not([data-theme="light"]) .goalcard.hit{box-shadow:var(--shadow-card),0 0 30px 2px rgba(52,224,161,.18);}

/* light-theme dock (navy pill, like the reference) */
.ts-root[data-theme="light"] .ts-dock-btn{color:#b9cbec;}
.ts-root[data-theme="light"] .ts-dock-btn:hover{color:#fff;}
.ts-root[data-theme="light"] .ts-dock-btn.active{color:var(--on-accent);}

/* ---------- news alert popup ---------- */
.ts-alert-backdrop{align-items:center;padding:20px;z-index:110;}
.ts-alert{border-radius:28px;text-align:center;max-width:380px;padding:28px 24px 22px;animation:ts-alert-pop .28s cubic-bezier(.2,1.2,.4,1);}
@keyframes ts-alert-pop{from{transform:scale(.92) translateY(10px);opacity:0;}to{transform:scale(1) translateY(0);opacity:1;}}
.ts-alert-icon{width:58px;height:58px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--surface-2);animation:ts-alert-ring 1.6s ease-in-out infinite;}
@keyframes ts-alert-ring{0%,100%{transform:rotate(0);}10%{transform:rotate(14deg);}20%{transform:rotate(-12deg);}30%{transform:rotate(8deg);}40%{transform:rotate(0);}}
.ts-alert.high .ts-alert-icon{background:var(--rose-dim);box-shadow:0 0 0 6px var(--rose-dim);}
.ts-alert.med .ts-alert-icon{background:var(--warn-dim);box-shadow:0 0 0 6px var(--warn-dim);}
.ts-alert.low .ts-alert-icon{background:var(--teal-dim);box-shadow:0 0 0 6px var(--teal-dim);}
.ts-alert-kicker{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.ts-alert.high .ts-alert-kicker{color:var(--rose);}
.ts-alert.med .ts-alert-kicker{color:var(--warn);}
.ts-alert.low .ts-alert-kicker{color:var(--teal);}
.ts-alert-title{font-size:22px;font-weight:800;letter-spacing:-.025em;margin-bottom:8px;}
.ts-alert-event{font-size:15px;font-weight:600;overflow-wrap:anywhere;}
.ts-alert-time{font-size:12.5px;color:var(--muted);margin-top:4px;font-variant-numeric:tabular-nums;}
.ts-alert-rule{display:inline-block;margin:14px 0 18px;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:var(--surface-2);border:1px solid var(--border);}
.ts-alert-btn{width:100%;}
@media (prefers-reduced-motion:reduce){.ts-alert,.ts-alert-icon{animation:none;}}

/* ---------- daily goal card ---------- */
.ts-root .goalcard{margin-top:12px;margin-bottom:8px;}
.ts-root .goalcard .num{font-size:34px;}
.ts-root .goalcard.hit{border-color:var(--teal);box-shadow:var(--shadow-card),0 0 26px 2px var(--teal-dim);}
.ts-root .goalpct{font-size:13px;font-weight:800;color:var(--muted);font-variant-numeric:tabular-nums;}
.ts-root .goalcard.hit .goalpct{color:var(--teal);}
.ts-root .pnl-meter-fill.goalfill{background:var(--meter);}
.ts-root .pnl-meter-fill.goalfill.hit{background:linear-gradient(90deg,#3fdc8c,#8dffc0);}

/* ---------- goal popup ---------- */
.ts-goal-backdrop{align-items:center;padding:20px;z-index:120;}
.ts-goal{border-radius:28px;text-align:center;max-width:380px;padding:28px 24px 22px;animation:ts-alert-pop .3s cubic-bezier(.2,1.2,.4,1);}
.ts-goal-emoji{font-size:54px;line-height:1;margin-bottom:10px;animation:ts-goal-bounce 1.2s ease-in-out infinite;}
@keyframes ts-goal-bounce{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-8px) scale(1.12);}}
.ts-goal-kicker{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.ts-goal-title{font-size:24px;font-weight:800;letter-spacing:-.025em;margin-bottom:10px;}
.ts-goal-figure{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;}
.ts-goal-sub{font-size:12.5px;color:var(--muted);margin-top:6px;}
.ts-goal-msg{font-size:14px;line-height:1.5;margin:16px 0 20px;}
.ts-goal.hit{border-color:var(--teal);box-shadow:0 0 0 1px var(--teal) inset,0 0 44px 4px var(--teal-dim);}
.ts-goal.hit .ts-goal-kicker,.ts-goal.hit .ts-goal-figure{color:var(--teal);}
.ts-goal.half .ts-goal-figure{color:var(--warn);}
.ts-goal.low .ts-goal-figure{color:var(--text);}
.ts-goal.red .ts-goal-figure{color:var(--rose);}
.ts-goal-btn{width:100%;}

/* ---------- confetti ---------- */
.ts-confetti{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:130;}
.ts-confetti span{position:absolute;top:-24px;opacity:0;animation-name:ts-confetti-fall;animation-timing-function:cubic-bezier(.25,.6,.4,1);animation-fill-mode:forwards;}
@keyframes ts-confetti-fall{
  0%{opacity:1;transform:translate3d(0,0,0) rotate(0deg);}
  85%{opacity:1;}
  100%{opacity:0;transform:translate3d(var(--dx),108vh,0) rotate(720deg);}
}
@media (prefers-reduced-motion:reduce){.ts-confetti{display:none;}.ts-goal,.ts-goal-emoji{animation:none;}}

/* ---------- floating hologram clock ---------- */
.ts-root{--holo-glow:rgba(232,201,122,.60);}
.ts-root[data-theme="light"]{--holo-glow:rgba(47,111,196,.50);}

.ts-root .ts-holo{
  position:fixed;
  right:max(18px,calc(50% - 236px));
  bottom:calc(90px + env(safe-area-inset-bottom,0px));
  z-index:44;
  display:flex;align-items:flex-end;gap:3px;
  color:var(--accent-text);
  pointer-events:none;
  filter:drop-shadow(0 0 3px var(--holo-glow)) drop-shadow(0 0 10px var(--holo-glow));
  animation:ts-holo-flicker 7s infinite;
}
.ts-root .ts-holo-digit{display:block;flex-shrink:0;transform:skewX(-6deg);}
.ts-root .ts-holo-digit polygon{fill:currentColor;}
.ts-root .ts-holo-digit polygon.off{opacity:.11;}
.ts-root .ts-holo-digit polygon.on{opacity:1;}
.ts-root .ts-holo-colon{display:block;flex-shrink:0;transform:skewX(-6deg);transition:opacity .25s ease;margin:0 1px;}
.ts-root .ts-holo-colon rect{fill:currentColor;}
.ts-root .ts-holo-meridiem{font-size:11px;font-weight:800;letter-spacing:.08em;line-height:1;opacity:.9;margin:0 0 3px 4px;}
.ts-root .ts-holo-side{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:0 0 3px 4px;}
.ts-root .ts-holo-side .ts-holo-meridiem{margin:0;}
.ts-root .ts-holo-session{font-size:11px;font-weight:800;letter-spacing:.08em;line-height:1;opacity:.9;white-space:nowrap;}

@keyframes ts-holo-flicker{
  0%,92%,100%{opacity:1;}
  93%{opacity:.82;}
  94%{opacity:1;}
  96%{opacity:.9;}
}
@media (prefers-reduced-motion:reduce){.ts-root .ts-holo{animation:none;}}

/* ---------- auto news: focus picker ---------- */
.ts-root .nf-label{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.ts-root .nf-chips{display:flex;flex-wrap:wrap;gap:6px;}
.ts-root .nf-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:12px;font-weight:700;cursor:pointer;transition:all .18s ease;}
.ts-root .nf-chip:hover{color:var(--text);}
.ts-root .nf-chip[aria-pressed="true"]{border-color:var(--amber);background:var(--amber-dim);color:var(--text);}
.ts-root .nf-chip img{width:16px;height:16px;border-radius:50%;object-fit:cover;}
.ts-root .nf-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;}
.ts-root .nf-seg{display:inline-flex;gap:4px;padding:3px;border-radius:var(--r-pill);background:var(--surface-2);border:1px solid var(--border);}
.ts-root .nf-seg button{border:none;background:none;color:var(--muted);padding:6px 12px;border-radius:var(--r-pill);font-size:11.5px;font-weight:700;cursor:pointer;}
.ts-root .nf-seg button[aria-pressed="true"]{background:var(--btn);color:var(--on-accent);}
.ts-root .nf-status{font-size:12px;color:var(--muted);margin:12px 2px 4px;line-height:1.4;}
.ts-root .nf-list{margin-top:6px;}
.ts-root .ts-flag{border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 0 0 1.5px var(--border);}

/* ---------- floating news + P&L ticker ---------- */
.ts-root{overflow-x:clip;max-width:100vw;}

.ts-root .ts-ticker{
  position:fixed;top:0;left:0;right:0;z-index:60;
  width:100%;max-width:100vw;
  padding-top:env(safe-area-inset-top,0px);
  background:var(--dock-bg);
  -webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border-bottom:1px solid var(--border);
  box-shadow:0 10px 24px -14px rgba(2,10,30,.6);
  overflow:hidden;
  contain:paint;
}
.ts-root .ts-ticker-viewport{height:36px;width:100%;overflow:hidden;display:flex;align-items:center;}
.ts-root .ts-ticker-track{
  display:flex;flex-wrap:nowrap;width:max-content;flex-shrink:0;
  will-change:transform;
  backface-visibility:hidden;
  animation-name:ts-ticker-scroll;
  animation-timing-function:linear;
  animation-iteration-count:infinite;
  animation-direction:normal;
  animation-play-state:running;
  animation-duration:40s; /* overridden inline by the component based on text length */
}
@media (hover:hover) and (pointer:fine){
  .ts-root .ts-ticker:hover .ts-ticker-track{animation-play-state:paused;}
}
.ts-root .ts-ticker-group{display:flex;align-items:center;flex-shrink:0;min-width:100vw;}
.ts-root .ts-tk-item{display:inline-flex;align-items:center;gap:8px;padding:0 18px;white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--text);}
.ts-root .ts-tk-item.past{opacity:.45;}
.ts-root .ts-tk-item .impact{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ts-root .ts-tk-time{color:var(--accent-text);font-weight:800;font-variant-numeric:tabular-nums;}
.ts-root .ts-tk-rule{color:var(--muted);font-weight:500;font-size:11.5px;}
.ts-root .ts-tk-label{color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:10.5px;}
.ts-root .ts-tk-val{font-weight:800;font-variant-numeric:tabular-nums;}
.ts-root .ts-tk-val.pos{color:var(--teal);}
.ts-root .ts-tk-val.neg{color:var(--rose);}
.ts-root .ts-tk-sep{color:var(--amber);opacity:.7;font-size:9px;padding:0 18px;flex-shrink:0;}
@keyframes ts-ticker-scroll{
  from{transform:translate3d(0,0,0);}
  to{transform:translate3d(-50%,0,0);}
}

/* make room for the fixed ticker */
.ts-root .wrap{padding-top:62px;}
.ts-root [id^="ts-"]{scroll-margin-top:52px;}

/* ---------- light theme: make the ticker readable (navy bar, bright text) ---------- */
.ts-root[data-theme="light"] .ts-ticker{
background:linear-gradient(180deg,rgba(18,44,96,.96),rgba(12,32,74,.96));
border-bottom:1px solid rgba(255,255,255,.14);
box-shadow:0 10px 24px -14px rgba(10,30,80,.7);
}
.ts-root[data-theme="light"] .ts-tk-item{color:#f4f7ff;}
.ts-root[data-theme="light"] .ts-tk-time{color:#f6e0a2;}
.ts-root[data-theme="light"] .ts-tk-rule{color:#b9cbec;}
.ts-root[data-theme="light"] .ts-tk-label{color:#b9cbec;}
.ts-root[data-theme="light"] .ts-tk-val.pos{color:#6dffb8;}
.ts-root[data-theme="light"] .ts-tk-val.neg{color:#ff9a8f;}
.ts-root[data-theme="light"] .ts-tk-sep{color:#f6e0a2;opacity:.8;}
.ts-root[data-theme="light"] .ts-tk-item.past{opacity:.5;}

/* brighter impact dots on the navy bar */
.ts-root[data-theme="light"] .ts-ticker .impact.high{background:#ff6b7d;box-shadow:0 0 0 3px rgba(255,107,125,.28);}
.ts-root[data-theme="light"] .ts-ticker .impact.med{background:#ffc15a;box-shadow:0 0 0 3px rgba(255,193,90,.28);}
.ts-root[data-theme="light"] .ts-ticker .impact.low{background:#4de8a8;box-shadow:0 0 0 3px rgba(77,232,168,.26);}

`;