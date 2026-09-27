import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Login from "./Login";

/**
 * <Session />
 *
 * A self-contained daily-routine + risk-limit tracker for a trader.
 * Port of a standalone HTML/CSS/JS build into a single React component.
 *
 * Notes on this port:
 * - All persistence uses localStorage, scoped under keys prefixed "td_",
 *   exactly like the original. Drop this into any React app (CRA, Vite,
 *   Next "use client" page, etc.) and it will just work in the browser.
 *   If you render it server-side, wrap usage in a client-only boundary,
 *   since it reads `window`/`localStorage` on mount.
 * - Styles are scoped under a single `.ts-root` wrapper class (instead of
 *   the original's `:root`/`body` rules) so dropping this into an existing
 *   app won't leak styles onto the rest of the page.
 * - Behavior additions vs. the original: the "back to now" button visibility
 *   is driven by an IntersectionObserver instead of manual scroll-position
 *   math, and the Google Fonts <link> is injected once on mount instead of
 *   requiring it in your document <head>.
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
  morning: [
    { id: "wake", t: "06:00", label: "Wake up", desc: "Same time every day — irregular sleep is where afternoon burnout starts.", type: "prep", start: M(6, 0), end: M(6, 0) },
    { id: "noscreen", t: "06:00–06:45", label: "No phone, no charts", desc: "Let the brain wake up before it starts problem-solving.", type: "prep", start: M(6, 0), end: M(6, 45) },
    { id: "move", t: "06:45–07:15", label: "Light movement", desc: "Stretch or walk. Raises baseline energy for the whole day.", type: "prep", start: M(6, 45), end: M(7, 15) },
    { id: "eat1", t: "07:15–07:45", label: "Breakfast", desc: "Protein + slow carbs — avoids the mid-morning crash right as trading starts.", type: "prep", start: M(7, 15), end: M(7, 45) },
    { id: "off", t: "07:45–10:00", label: "Personal time", desc: "Mind stays off markets completely.", type: "rest", start: M(7, 45), end: M(10, 0) },
    { id: "review", t: "10:00–10:30", label: "Review yesterday's log", desc: "What worked, what didn't, what to not repeat.", type: "prep", start: M(10, 0), end: M(10, 30) },
    { id: "prepsetups", t: "10:30–11:00", label: "Mark levels & set limits", desc: "Set today's loss limit and trade cap now — while calm.", type: "prep", start: M(10, 30), end: M(11, 0) },
  ],
  trading: [
    { id: "p1", t: "11:00–13:00", label: "Primary session", desc: "Best focus of the day. Take your best setups.", type: "trade", start: M(11, 0), end: M(13, 0) },
    { id: "mb", t: "13:00–13:10", label: "Micro-break", desc: "Stand, water, eyes fully off the screen.", type: "rest", start: M(13, 0), end: M(13, 10) },
    { id: "p1b", t: "13:10–14:00", label: "Continue or watch only", desc: "Only keep going if setups are genuinely strong.", type: "trade", start: M(13, 10), end: M(14, 0) },
    { id: "lunch", t: "14:00–15:00", label: "Full break", desc: "Lunch away from the desk. Zero charts, zero market talk.", type: "rest", start: M(14, 0), end: M(15, 0) },
    { id: "p2", t: "15:00–16:30", label: "Secondary session", desc: "Moderate focus. Second wind, not first.", type: "trade", start: M(15, 0), end: M(16, 30) },
    { id: "checkin", t: "16:30–16:40", label: "Energy check-in", desc: "Score it below — it decides the next block.", type: "trade", start: M(16, 30), end: M(16, 40) },
    { id: "aplus", t: "16:40–17:00", label: "A+ setups only", desc: "Or just manage what's already open. No new analysis.", type: "trade", start: M(16, 40), end: M(17, 0) },
    { id: "hardstop", t: "17:00", label: "Hard stop", desc: 'No exceptions. No "one more trade."', type: "stop", start: M(17, 0), end: M(17, 0) },
  ],
  evening: [
    { id: "logtime", t: "17:00–17:15", label: "Log the day", desc: "Fill in the log below while it's fresh.", type: "prep", start: M(17, 0), end: M(17, 15) },
    { id: "disconnect", t: "17:15–18:00", label: "Total disconnect", desc: 'No checking charts "just to see."', type: "rest", start: M(17, 15), end: M(18, 0) },
    { id: "personal", t: "18:00–21:30", label: "Real recovery", desc: "Hobby, people, movement — whatever actually refills you.", type: "rest", start: M(18, 0), end: M(21, 30) },
    { id: "screensoff", t: "21:30", label: "Screens off", desc: "Protects sleep, which protects tomorrow's focus.", type: "prep", start: M(21, 30), end: M(21, 30) },
    { id: "bed", t: "22:00", label: "Fixed bedtime", desc: "Same time nightly. Consistency compounds.", type: "prep", start: M(22, 0), end: M(22, 0) },
  ],
};

const ALL_BLOCKS = [...SCHEDULE.morning, ...SCHEDULE.trading, ...SCHEDULE.evening];
const IMPACT_RULE = { high: "Stand aside", med: "Half size", low: "Trade as normal" };

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

// ---------- standalone focus card component ----------
function FocusCard({
  block, done, onToggle, isTrade, isEnergy, energy, onEnergy,
  pnlInputRef, pnlInput, setPnlInput, addResult,
  netPnl, maxLoss, fmt, money, usedFraction,
}) {
  return (
    <div className="ts-focus-enter" style={{
      border: "1px solid var(--border)",
      background: "var(--surface)",
      borderRadius: "14px",
      padding: "16px",
      marginBottom: "10px",
    }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.02em" }}>
        {block.t}
      </div>
      <h3
        className="text-xl sm:text-2xl font-semibold mb-1"
        style={{ fontFamily: "'Fraunces',serif", fontSize: "24px", fontWeight: "600", marginBottom: "8px", marginTop: "0" }}
      >
        {block.label}
      </h3>
      <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: "1.4", marginBottom: "12px" }}>
        {block.desc}
      </div>

      <button
        onClick={onToggle}
        style={{
          width: "100%",
          borderRadius: "8px",
          border: done ? "1px solid var(--amber)" : "1px solid var(--border)",
          padding: "12px 14px",
          fontSize: "14px",
          fontWeight: "600",
          transition: "all 0.2s ease",
          background: done ? "var(--amber)" : "var(--surface-2)",
          color: done ? "#1a1408" : "var(--text)",
          cursor: "pointer",
          marginBottom: "10px",
        }}
      >
        {done ? "Marked done ✓" : "Mark as done"}
      </button>

      {isTrade && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>Log a result</div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
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
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                padding: "8px 10px",
                fontSize: "13px",
                color: "var(--text)",
              }}
            />
            <button
              onClick={addResult}
              style={{
                borderRadius: "8px",
                background: "var(--amber)",
                color: "#1a1408",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: "600",
                whiteSpace: "nowrap",
                border: "none",
                cursor: "pointer",
              }}
            >
              Log
            </button>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "var(--surface-2)", overflow: "hidden", marginBottom: "8px" }}>
            <div
              style={{
                height: "100%",
                background: usedFraction >= 0.66 ? "var(--rose)" : "var(--amber)",
                width: `${Math.min(100, usedFraction * 100)}%`,
                transition: "width 0.25s ease",
              }}
            />
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            Net {fmt(netPnl)} — {money(Math.max(0, maxLoss + Math.min(0, netPnl)))} of room left.
          </div>
        </div>
      )}

      {isEnergy && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>Energy check-in</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => onEnergy(i)}
                style={{
                  flex: 1,
                  height: "36px",
                  borderRadius: "10px",
                  border: energy === i ? "1px solid var(--amber)" : "1px solid var(--border)",
                  background: energy === i ? "var(--amber)" : "var(--surface-2)",
                  color: energy === i ? "#1a1408" : "var(--muted)",
                  fontSize: "13px",
                  fontWeight: "600",
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
      <div style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        borderRadius: "14px",
        padding: "16px",
        marginBottom: "10px",
        textAlign: "center",
        color: "var(--muted)",
      }}>
        Nothing scheduled for the rest of today. Good work.
      </div>
    );
  }
  return (
    <div style={{
      border: "1px solid var(--border)",
      background: "var(--surface)",
      borderRadius: "14px",
      padding: "16px",
      marginBottom: "10px",
    }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.02em" }}>
        Next up in {formatCountdown(minsUntil)}
      </div>
      <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: "18px", fontWeight: "600", color: "var(--text)", marginTop: "0", marginBottom: "4px" }}>
        {nextBlock.label}
      </h3>
      <div style={{ fontSize: "12px", color: "var(--muted)" }}>{nextBlock.t}</div>
    </div>
  );
}

function EditLimitModal({ mode, maxLoss, currency, tradeLimit, onClose, onSaveLoss, onSaveCap }) {
  const [lossVal, setLossVal] = useState(String(maxLoss));
  const [curVal, setCurVal] = useState(currency);
  const [capVal, setCapVal] = useState(String(tradeLimit));

  useEffect(() => {
    setLossVal(String(maxLoss));
    setCurVal(currency);
    setCapVal(String(tradeLimit));
  }, [mode, maxLoss, currency, tradeLimit]);

  if (!mode) return null;

  const handleSave = () => {
    if (mode === "loss") {
      const n = parseFloat(lossVal);
      if (!isNaN(n) && n > 0) {
        onSaveLoss(Math.abs(n), curVal.trim() ? curVal.trim().slice(0, 4) : currency);
      }
    } else {
      const n = parseInt(capVal, 10);
      if (!isNaN(n)) onSaveCap(Math.max(1, n));
    }
    onClose();
  };

  return (
    <div className="ts-modal-backdrop" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modal-title">
          {mode === "loss" ? "Set today's loss floor" : "Set today's trade cap"}
        </div>
        <div className="ts-modal-sub">
          {mode === "loss"
            ? "The most you're willing to be down today, set now while calm."
            : "The most trades you'll take today, set now while calm."}
        </div>

        {mode === "loss" ? (
          <div className="ts-modal-row">
            <div className="ts-modal-field" style={{ flex: 2 }}>
              <label>Max loss</label>
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={lossVal}
                onChange={(e) => setLossVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
            <div className="ts-modal-field" style={{ flex: 1 }}>
              <label>Currency</label>
              <input
                type="text"
                maxLength={4}
                value={curVal}
                onChange={(e) => setCurVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
          </div>
        ) : (
          <div className="ts-modal-field">
            <label>Trade cap</label>
            <input
              type="number"
              min="1"
              step="1"
              autoFocus
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

// ---------- component ----------
export default function Session() {
  const AUTH_KEY = "mms_session_unlocked";
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(AUTH_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncAuth = () => {
      try {
        setIsAuthenticated(window.sessionStorage.getItem(AUTH_KEY) === "true");
      } catch {
        setIsAuthenticated(false);
      }
    };

    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  const dayKey = "td_day_" + todayKey();

  const [theme, setTheme] = useLocalStorageState("td_theme", "dark");
  const [follow, setFollow] = useLocalStorageState("td_follow", true);
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
  const [logForm, setLogForm] = useState({ wins: "", losses: "", missed: "", note: "" });
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

  const pnlInputRef = useRef(null);
  const newsTitleRef = useRef(null);
  const blockRefs = useRef({});
  const lastAutoScroll = useRef(0);
  const prevNowId = useRef(null);
  const fontLinkAdded = useRef(false);

  // inject Google Fonts once
  useEffect(() => {
    if (fontLinkAdded.current || typeof document === "undefined") return;
    fontLinkAdded.current = true;
    if (!document.getElementById("ts-font-link")) {
      const link = document.createElement("link");
      link.id = "ts-font-link";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap";
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
      day.news
        .filter((n) => n.impact === "high" && toMin(n.time) !== null)
        .map((n) => ({ title: n.title, time: n.time, m: toMin(n.time) }))
        .filter((n) => nowMin >= n.m - 30 && nowMin <= n.m + 15)
        .sort((a, b) => a.m - b.m)[0] || null
    );
  }, [day.news, nowMin]);

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
        sub: `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m until hard stop. Net ${fmt(netPnl)}, ${money(
          maxLoss + Math.min(0, netPnl)
        )} of room left.`,
      };
    }
    return { limit: false, head: "Session closed for today", sub: `Closed at ${fmt(netPnl)}. Log the day and step away.` };
  }, [netPnl, maxLoss, liveHighImpact, nowMin, fmt, money]);

  const wins = day.pnl.filter((v) => v > 0).length;
  const losses = day.pnl.filter((v) => v < 0).length;
  const usedFraction = Math.min(1, Math.max(0, -netPnl) / maxLoss);

  const sortedNews = useMemo(
    () => day.news.slice().sort((a, b) => (toMin(a.time) ?? 1e9) - (toMin(b.time) ?? 1e9)),
    [day.news]
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

  const handleLogout = () => {
    try {
      window.sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {
      /* sessionStorage unavailable — still log out in memory */
    }
    setIsAuthenticated(false);
  };

  const addResult = () => {
    const v = parseFloat(pnlInput);
    if (isNaN(v) || v === 0) { pnlInputRef.current?.focus(); return; }
    setDay((d) => ({ ...d, pnl: [...d.pnl, v] }));
    setPnlInput("");
    if (!scrollToNow(true)) pnlInputRef.current?.focus();
    else setTimeout(() => pnlInputRef.current?.blur(), 60);
  };
  const removeResult = (idx) => {
    setDay((d) => ({ ...d, pnl: d.pnl.filter((_, i) => i !== idx) }));
  };

  const openLossEdit = () => setEditModal("loss");
  const openCapEdit = () => setEditModal("cap");

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

  const buildEntry = () => ({
    date: todayKey(),
    wins: logForm.wins !== "" ? Number(logForm.wins) : wins,
    losses: logForm.losses !== "" ? Number(logForm.losses) : losses,
    missed: Number(logForm.missed) || 0,
    net: netPnl,
    maxLoss,
    energy: day.energy,
    news: day.news.map((n) => ({ time: n.time, title: n.title, impact: n.impact })),
    note: logForm.note.trim(),
    stoppedOnTime: !!day.checks["hardstop"],
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
    setSavedMsg("Saved.");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const dayHasData = () =>
    day.pnl.length > 0 || day.news.length > 0 || day.energy !== null || Object.values(day.checks).some(Boolean);

  const resetToday = () => {
    if (!window.confirm("Reset today's checklist, energy and counters?")) return;
    if (dayHasData()) {
      const already = history.some((h) => h.date === todayKey());
      if (!already) commitEntry(buildEntry());
    }
    setDay({ checks: {}, energy: null, pnl: [], news: [] });
    setLogForm({ wins: "", losses: "", missed: "", note: "" });
  };

  const activeHistEntry = activeHistDate ? historyByDate[activeHistDate] || null : null;

  // All hooks have run by this point — safe to branch on auth state now.
  if (!isAuthenticated) {
    return <Login onSuccess={() => setIsAuthenticated(true)} storageKey={AUTH_KEY} />;
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

  return (
    <div className="ts-root" data-theme={theme}>
      <style>{CSS}</style>
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <h1>The Session</h1>
            <button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Switch to dark" : "Switch to light"}
            </button>
            <button className="theme-toggle lg-logout-btn" onClick={handleLogout}>
              Log out
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
              <div className="ts-target-nums">
                <span className={`ts-target-current${monthProgress > 0 ? " pos" : monthProgress < 0 ? " neg" : ""}`}>
                  {fmt(monthProgress)}
                </span>
                <span className="ts-target-of">/ {money(monthlyTarget)}</span>
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
                <span className={`num${netPnl > 0 ? " pos" : netPnl < 0 ? " neg" : ""}`}>{fmt(netPnl)}</span>{" "}
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
              <div><span className="num">{wins}{"\u2013"}{losses}</span></div>
            </div>
            <div className="pnl-trades">
              {day.pnl.length === 0 ? (
                <span className="pnl-meterlbl">No closed trades yet.</span>
              ) : (
                day.pnl.map((v, i) => (
                  <span className={`chip ${v >= 0 ? "win" : "loss"}`} key={i}>
                    <span>{fmt(v)}</span>
                    <button aria-label={"Remove result " + fmt(v)} onClick={() => removeResult(i)}>&times;</button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <h2 className="section">Today's news<span className="sub">fill this in before 11:00, not after a bad trade</span></h2>
        <div className="newscard">
          <div className="newsform">
            <input ref={newsTitleRef} type="text" placeholder="Event or headline" value={newsTitle}
              onChange={(e) => setNewsTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNews(); } }} />
            <input type="time" value={newsTime} onChange={(e) => setNewsTime(e.target.value)} />
            <select value={newsImpact} onChange={(e) => setNewsImpact(e.target.value)}>
              <option value="high">Red — high impact</option>
              <option value="med">Orange — medium</option>
              <option value="low">Yellow — low</option>
            </select>
            <button onClick={addNews}>Add event</button>
          </div>

          <div>
            {sortedNews.length === 0 ? (
              <div className="newsempty" />
            ) : (
              sortedNews.map((n) => (
                <div className="newsitem" key={n.id}>
                  <span className={`impact ${n.impact}`} />
                  <span className="ntime">{n.time || "--:--"}</span>
                  <span className="ntitle">{n.title}</span>
                  <span className="nrule">{IMPACT_RULE[n.impact]}</span>
                  <button className="ndel" aria-label={"Remove " + n.title} onClick={() => removeNews(n.id)}>&times;</button>
                </div>
              ))
            )}
          </div>

          {highNews.length > 0 && (
            <div className="newsflag" style={{ display: "block" }}>
              {highNews.length === 1
                ? `One red event today at ${highNews[0].time || "an unset time"}. Plan to be flat 30 minutes either side of it.`
                : `${highNews.length} red events today. The gaps between them are the only real trading windows — size down and expect fewer setups.`}
            </div>
          )}
        </div>

        <h2 className="section">Right now<span className="sub">auto-updates as the day moves</span></h2>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            onClick={() => setViewMode("focus")}
            style={{
              padding: "8px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: "600",
              border: `1px solid ${viewMode === "focus" ? "var(--amber)" : "var(--border)"}`,
              background: viewMode === "focus" ? "var(--amber)" : "transparent",
              color: viewMode === "focus" ? "#1a1408" : "var(--muted)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Focus
          </button>
          <button
            onClick={() => setViewMode("full")}
            style={{
              padding: "8px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: "600",
              border: `1px solid ${viewMode === "full" ? "var(--amber)" : "var(--border)"}`,
              background: viewMode === "full" ? "var(--amber)" : "transparent",
              color: viewMode === "full" ? "#1a1408" : "var(--muted)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Full day
          </button>
        </div>

        {viewMode === "focus" ? (
          currentBlock ? (
            <FocusCard
              key={currentBlock.id}
              block={currentBlock}
              done={!!day.checks[currentBlock.id]}
              onToggle={() => toggleCheck(currentBlock.id)}
              isTrade={currentBlock.type === "trade" && currentBlock.id !== "checkin"}
              isEnergy={currentBlock.id === "checkin"}
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
            <h2 className="section">Morning<span className="sub">before the market exists</span></h2>
            <div>{SCHEDULE.morning.map(renderBlock)}</div>

            <h2 className="section">The window<span className="sub">11:00 – 17:00 EAT</span></h2>
            <div>{SCHEDULE.trading.map(renderBlock)}</div>

            <div className="energybar">
              <div className="lbl">Energy check-in (16:30) — be honest, it decides your last block</div>
              <div className="energyrow">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} className={day.energy === i ? "sel" : ""} onClick={() => setDay((d) => ({ ...d, energy: i }))}>
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <h2 className="section">Evening<span className="sub">this is where tomorrow gets built</span></h2>
            <div>{SCHEDULE.evening.map(renderBlock)}</div>
          </>
        )}

        <h2 className="section">End-of-day log</h2>
        <div className="logcard">
          <div className="logrow">
            <div>
              <label>Wins</label>
              <input type="number" min="0" placeholder="0" value={logForm.wins}
                onChange={(e) => setLogForm((f) => ({ ...f, wins: e.target.value }))} />
            </div>
            <div>
              <label>Losses</label>
              <input type="number" min="0" placeholder="0" value={logForm.losses}
                onChange={(e) => setLogForm((f) => ({ ...f, losses: e.target.value }))} />
            </div>
            <div>
              <label>Missed</label>
              <input type="number" min="0" placeholder="0" value={logForm.missed}
                onChange={(e) => setLogForm((f) => ({ ...f, missed: e.target.value }))} />
            </div>
          </div>
          <label>What actually happened (one line, be blunt)</label>
          <textarea
            placeholder="e.g. good until 2pm, forced two trades after the break"
            value={logForm.note}
            onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
          />
          <button className="savebtn" onClick={saveLog}>Save today's log</button>
          <div className="savedmsg">{savedMsg}</div>
        </div>

        <div className="history">
          <h2 className="section" style={{ marginTop: 0 }}>History<span className="sub">tap a day to see what happened</span></h2>
          <div style={{ marginBottom: "16px" }}>
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
              <button onClick={goPrevMonth} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", padding: "4px 8px" }}>‹</button>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>{monthLabel}</div>
              <button onClick={goNextMonth} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", padding: "4px 8px" }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", fontSize: "10px", color: "var(--muted)", marginBottom: "8px", textAlign: "center" }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
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
                      borderRadius: "8px",
                      fontSize: "11px",
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
                      outline: isToday ? "1px solid var(--amber)" : "none",
                    }}
                    onMouseEnter={(e) => { if (entry) e.target.style.filter = "brightness(1.1)"; }}
                    onMouseLeave={(e) => { if (entry) e.target.style.filter = "brightness(1)"; }}
                  >
                    <span>{Number(date.slice(-2))}</span>
                    {entry?.stoppedOnTime === false && <span style={{ height: "4px", width: "4px", borderRadius: "50%", background: "var(--rose)" }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {activeHistEntry && (
            <div className="daydetail show">
              <div className="ddhead">
                <strong>{new Date(activeHistEntry.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</strong>
                <span>{activeHistEntry.stoppedOnTime ? "Stopped on time" : "Ran past the stop"}</span>
              </div>
              <div className="ddgrid">
                <div className="ddstat">
                  <div className={`v${(activeHistEntry.net ?? 0) > 0 ? " pos" : (activeHistEntry.net ?? 0) < 0 ? " neg" : ""}`}>{fmt(activeHistEntry.net ?? 0)}</div>
                  <div className="l">net</div>
                </div>
                <div className="ddstat"><div className="v">{activeHistEntry.wins ?? 0}</div><div className="l">wins</div></div>
                <div className="ddstat"><div className="v">{activeHistEntry.losses ?? 0}</div><div className="l">losses</div></div>
                <div className="ddstat"><div className="v">{activeHistEntry.missed ?? 0}</div><div className="l">missed</div></div>
              </div>
              {activeHistEntry.note && <div className="ddnote">"{activeHistEntry.note}"</div>}
              <div className="ddnews">
                {activeHistEntry.news && activeHistEntry.news.length
                  ? activeHistEntry.news.map((n) => `${n.time || "--:--"} \u00b7 ${n.title}`).join(" \u00b7 ")
                  : "No news logged that day."}
              </div>
              <button className="ddclose" onClick={() => setActiveHistDate(null)}>Close</button>
            </div>
          )}

          <div className="streak">
            <div className="n">{streak}</div>
            <div className="t">day streak stopping on time, without blowing the loss limit</div>
          </div>
        </div>

        <footer>
          Everything here stays on this device, for you only. <button className="resetlink" onClick={resetToday}>Reset today</button>
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

      <EditLimitModal
        mode={editModal}
        maxLoss={maxLoss}
        currency={currency}
        tradeLimit={tradeLimit}
        onClose={() => setEditModal(null)}
        onSaveLoss={(v, c) => { setMaxLoss(v); setCurrency(c); }}
        onSaveCap={(v) => setTradeLimit(v)}
      />
    </div>
  );
}

// ---------- scoped styles ----------
const CSS = `
.ts-root{
  --bg:#10151c; --bg-2:#0b0f14; --surface:#1a232f; --surface-2:#212c39;
  --border:#2b3644; --text:#e9eef3; --muted:#8b96a3; --amber:#e8a33d;
  --amber-dim:#4a3a22; --teal:#59b7ab; --teal-dim:#1f3936; --rose:#e2665b;
  --rose-dim:#432624; --focus-ring:#e8a33d;

  /* NEW: elevation + glow tokens */
  --shadow-card: 0 1px 2px rgba(0,0,0,.4), 0 12px 28px -12px rgba(0,0,0,.55);
  --shadow-card-hover: 0 1px 2px rgba(0,0,0,.4), 0 18px 36px -14px rgba(0,0,0,.6);
  --glow-amber: rgba(232,163,61,.32);
  --glow-rose: rgba(226,102,91,.32);

  /* NEW: radius tokens by role */
  --r-card: 18px;
  --r-input: 10px;
  --r-pill: 999px;

  padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
  box-sizing:border-box; min-height:100vh;
  background:
    radial-gradient(1100px 560px at 12% -12%, rgba(232,163,61,.06), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(89,183,171,.05), transparent 55%),
    radial-gradient(1200px 600px at 15% -10%, var(--bg-2), transparent), var(--bg);
  color:var(--text); font-family:'Inter',system-ui,-apple-system,sans-serif;
  -webkit-font-smoothing:antialiased; position:relative;
}

/* NEW: faint grain texture — sits above the gradient, below content */
.ts-root::before{
  content:"";
  position:fixed; inset:0; pointer-events:none; z-index:0;
  opacity:.035; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
.ts-root .wrap{position:relative; z-index:1;}
.ts-root[data-theme="light"]{
  --bg:#f3f0e9; --bg-2:#eae5da; --surface:#ffffff; --surface-2:#f6f3ec;
  --border:#ddd5c4; --text:#20241f; --muted:#6b6558; --amber-dim:#f3dcb0;
  --teal-dim:#d7ede8; --rose-dim:#f7dad7;
}
.ts-root *{box-sizing:border-box;}
.ts-root ::selection{background:var(--amber);color:#1a1408;}
.ts-root a{color:inherit;}
.ts-root button{font-family:inherit;}
.ts-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.ts-root .wrap{max-width:760px;margin:0 auto;padding:28px 20px 80px;}
.ts-root header.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:6px;}
.ts-root .brand h1{font-family:'Fraunces',serif;font-weight:500;font-size:clamp(28px,6vw,38px);margin:0 0 4px;letter-spacing:-0.01em;line-height:1.05;}
.ts-root .brand p{margin:0;color:var(--muted);font-size:14.5px;max-width:46ch;}
.ts-root .clockbox{text-align:right;flex-shrink:0;}
.ts-root .clockbox .time{font-variant-numeric:tabular-nums;font-size:22px;font-weight:600;}
.ts-root .clockbox .date{font-size:12.5px;color:var(--muted);}
.ts-root .theme-toggle{margin-top:8px;background:none;border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:4px 10px;font-size:12px;cursor:pointer;transition:border-color .15s ease, color .15s ease;}
.ts-root .theme-toggle:hover{border-color:var(--amber); color:var(--text);}
.ts-root .lg-logout-btn{margin-left:8px;}
.ts-root .stopband{margin:22px 0 26px;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card); box-shadow:var(--shadow-card);padding:14px 16px;display:flex;gap:14px;align-items:center;}
.ts-root .stopband .dot{width:10px;height:10px;border-radius:50%;background:var(--amber);flex-shrink:0;box-shadow:0 0 0 4px var(--amber-dim);}
.ts-root .stopband.limit .dot{background:var(--rose);box-shadow:0 0 0 4px var(--rose-dim);}
.ts-root .stopband.limit{animation:ts-breathe 2.6s ease-in-out infinite;}
.ts-root .stopband strong{display:block;font-size:16.5px;letter-spacing:-0.01em;margin-bottom:2px;}
.ts-root .stopband span{font-size:13px;color:var(--muted);}
.ts-root .counters{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:26px;}
.ts-root .counter{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card); box-shadow:var(--shadow-card);padding:14px 16px;}
.ts-root .counter .label{font-size:12.5px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;}
.ts-root .counter .row{display:flex;align-items:center;justify-content:space-between;}
.ts-root .counter .num{font-family:'Fraunces',serif;font-size:42px;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1;}
.ts-root .counter .maxof{font-size:13px;color:var(--muted);}
.ts-root .stepbtns{display:flex;gap:6px;}
.ts-root .limitset{border:none;background:none;color:var(--muted);font-size:12px;text-decoration:underline;cursor:pointer;padding:0;}
.ts-root .counter.over{border-color:var(--rose);}
.ts-root .counter.over .num{color:var(--rose);}
.ts-root h2.section{font-family:'Fraunces',serif;font-weight:500;font-size:22px;letter-spacing:-0.01em;margin:42px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:10px;}
.ts-root h2.section .sub{font-family:'Inter';font-weight:400;font-size:12px;color:var(--muted);opacity:.75;letter-spacing:.01em;}
.ts-root .block{display:flex;gap:14px;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card);box-shadow:var(--shadow-card);padding:14px 16px;margin-bottom:10px;position:relative;transition:border-color .2s ease, background .2s ease, box-shadow .2s ease, transform .2s ease;scroll-margin-top:calc(84px + env(safe-area-inset-top,0px));}
.ts-root .block:hover{box-shadow:var(--shadow-card-hover); transform:translateY(-1px);}
.ts-root .block .time{flex-shrink:0;width:92px;font-size:12.5px;color:var(--muted);padding-top:2px;font-variant-numeric:tabular-nums;line-height:1.4;}
.ts-root .block .main{flex:1;min-width:0;}
.ts-root .block .label{font-size:15px;font-weight:600;margin-bottom:2px;}
.ts-root .block .desc{font-size:13px;color:var(--muted);line-height:1.4;}
.ts-root .block .check{flex-shrink:0;width:26px;height:26px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:transparent;font-size:15px;align-self:flex-start;margin-top:2px;}
.ts-root .block .check:hover{border-color:var(--amber);}
.ts-root .block.done .check{background:var(--amber);border-color:var(--amber);color:#1a1408;}
.ts-root .block.done .label{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--border);}
.ts-root .block.prep{border-left:3px solid var(--teal);}
.ts-root .block.trade{border-left:3px solid var(--amber);}
.ts-root .block.rest{border-left:3px solid var(--teal);}
.ts-root .block.stop{border-left:3px solid var(--rose);}
.ts-root .block.now{background:var(--surface-2);box-shadow:0 0 0 1px var(--amber) inset, 0 0 20px 2px var(--glow-amber);}
.ts-root .block.now .time::before{content:"now";display:block;color:var(--amber);font-weight:600;font-size:11px;letter-spacing:.02em;margin-bottom:2px;}
.ts-root .block.just-scrolled{animation:ts-nudge .9s ease-out;}
@keyframes ts-nudge{0%{box-shadow:0 0 0 1px var(--amber) inset, 0 0 0 0 var(--amber-dim);}35%{box-shadow:0 0 0 1px var(--amber) inset, 0 0 0 7px var(--amber-dim);}100%{box-shadow:0 0 0 1px var(--amber) inset, 0 0 0 0 transparent;}}
@keyframes ts-breathe{
  0%, 100%{ box-shadow: var(--shadow-card), 0 0 0 0 var(--glow-rose); }
  50%{ box-shadow: var(--shadow-card), 0 0 26px 4px var(--glow-rose); }
}
.ts-root .energybar{margin:18px 0 0;}
.ts-root .energybar .lbl{font-size:13px;color:var(--muted);margin-bottom:8px;}
.ts-root .energyrow{display:flex;gap:6px;}
.ts-root .energyrow button{flex:1;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;font-size:13px;}
.ts-root .energyrow button.sel{background:var(--amber);border-color:var(--amber);color:#1a1408;font-weight:700;}
.ts-root .logcard{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card); box-shadow:var(--shadow-card);padding:18px;margin-top:8px;}
.ts-root .logcard label{display:block;font-size:12.5px;color:var(--muted);margin:12px 0 5px;}
.ts-root .logcard label:first-child{margin-top:0;}
.ts-root .logrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.ts-root .logcard input[type=number], .ts-root .logcard textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:9px 10px;font-size:14px;font-family:inherit;}
.ts-root .logcard textarea{resize:vertical;min-height:56px;}
.ts-root .savebtn{margin-top:16px;width:100%;padding:12px;border-radius:10px;border:none;background:var(--amber);color:#1a1408;font-weight:700;font-size:14.5px;cursor:pointer;}
.ts-root .savebtn:active{transform:scale(.99);}
.ts-root .savedmsg{font-size:12.5px;color:var(--teal);margin-top:8px;height:14px;}
.ts-root .history{margin-top:34px;}
.ts-root .histrow{display:flex;align-items:flex-end;gap:6px;height:70px;margin-top:10px;}
.ts-root .histday{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px;cursor:pointer;}
.ts-root .histday:hover .histbar{filter:brightness(1.15);}
.ts-root .histday.active .histbar{outline:2px solid var(--text);outline-offset:1px;}
.ts-root .histbar{width:100%;border-radius:4px 4px 0 0;background:var(--amber);min-height:3px;}
.ts-root .histbar.stopped-late{background:var(--rose);}
.ts-root .histlbl{font-size:10px;color:var(--muted);}
.ts-root .histempty{font-size:13px;color:var(--muted);}
.ts-root .streak{display:flex;gap:10px;align-items:center;margin-top:16px;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:12px 14px;}
.ts-root .streak .n{font-family:'Fraunces',serif;font-size:36px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;}
.ts-root .streak .t{font-size:13px;color:var(--muted);}
.ts-root footer{margin-top:40px;text-align:center;font-size:12px;color:var(--muted);}
.ts-root .resetlink{background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;font-size:12px;}
.ts-root #pnlCounter{grid-column:1 / -1;}
.ts-root .num.pos{color:var(--teal);}
.ts-root .num.neg{color:var(--rose);}
.ts-root .pnl-entry{display:flex;gap:6px;}
.ts-root .pnl-entry input{width:118px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:7px 9px;font-size:14px;font-family:inherit;font-variant-numeric:tabular-nums;}
.ts-root .pnl-entry button{border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;white-space:nowrap;}
.ts-root .pnl-entry button:hover{border-color:var(--amber);}
.ts-root .pnl-meter{height:6px;border-radius:3px;background:var(--surface-2);margin-top:16px;overflow:hidden;}
.ts-root .pnl-meter-fill{height:100%;width:0%;background:var(--amber);transition:width .25s ease;}
.ts-root .pnl-meter-fill.danger{background:var(--rose);}
.ts-root .pnl-meterlbl{font-size:11.5px;color:var(--muted);margin-top:7px;}
.ts-root .pnl-trades{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}
.ts-root .chip{font-size:12px;font-variant-numeric:tabular-nums;border:1px solid var(--border);background:var(--surface-2);border-radius:20px;padding:3px 7px 3px 10px;display:flex;align-items:center;gap:6px;}
.ts-root .chip.win{border-color:var(--teal);color:var(--teal);}
.ts-root .chip.loss{border-color:var(--rose);color:var(--rose);}
.ts-root .chip button{background:none;border:none;color:inherit;opacity:.55;cursor:pointer;font-size:14px;padding:0;line-height:1;}
.ts-root .chip button:hover{opacity:1;}
.ts-root .newscard{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card); box-shadow:var(--shadow-card);padding:16px;}
.ts-root .newsform{display:grid;grid-template-columns:1fr 110px 168px auto;gap:8px;}
.ts-root .newsform input,.ts-root .newsform select{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:9px 10px;font-size:13.5px;font-family:inherit;width:100%;}
.ts-root .newsform button{border:none;background:var(--amber);color:#1a1408;font-weight:600;border-radius:8px;padding:9px 14px;font-size:13.5px;cursor:pointer;white-space:nowrap;}
.ts-root .newsitem{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);}
.ts-root .newsitem:last-child{border-bottom:none;}
.ts-root .newsitem .impact{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ts-root .impact.high{background:var(--rose);box-shadow:0 0 0 3px var(--rose-dim);}
.ts-root .impact.med{background:var(--amber);box-shadow:0 0 0 3px var(--amber-dim);}
.ts-root .impact.low{background:var(--teal);box-shadow:0 0 0 3px var(--teal-dim);}
.ts-root .newsitem .ntime{font-size:12.5px;color:var(--muted);width:46px;flex-shrink:0;font-variant-numeric:tabular-nums;}
.ts-root .newsitem .ntitle{flex:1;font-size:14px;min-width:0;overflow-wrap:anywhere;}
.ts-root .newsitem .nrule{font-size:12px;color:var(--muted);flex-shrink:0;}
.ts-root .newsitem .ndel{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;line-height:1;}
.ts-root .newsitem .ndel:hover{color:var(--text);}
.ts-root .newsempty{font-size:13px;color:var(--muted);padding-top:14px;line-height:1.45;}
.ts-root .newsflag{margin-top:14px;border-radius:10px;padding:11px 13px;font-size:13px;background:var(--rose-dim);color:var(--text);}
.ts-root .followrow{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin-top:10px;font-size:12px;color:var(--muted);cursor:pointer;user-select:none;}
.ts-root .followrow input{accent-color:var(--amber);width:14px;height:14px;cursor:pointer;margin:0;}
.ts-root .nowbtn{position:fixed;left:50%;transform:translate(-50%, 16px);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:22px;padding:9px 16px;font-size:13px;font-family:inherit;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .2s ease, transform .2s ease;}
.ts-root .nowbtn.show{opacity:1;pointer-events:auto;transform:translate(-50%,0);}
.ts-root .nowbtn:hover{border-color:var(--amber);}
.ts-root .nowbtn .pulse{width:7px;height:7px;border-radius:50%;background:var(--amber);flex-shrink:0;box-shadow:0 0 0 3px var(--amber-dim);}
.ts-root .nowbtn .what{color:var(--muted);}
.ts-root .daydetail{margin-top:14px;border:1px solid var(--border);background:var(--surface-2);border-radius:12px;padding:14px 16px;}
.ts-root .daydetail .ddhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);}
.ts-root .daydetail .ddhead strong{font-size:14.5px;}
.ts-root .daydetail .ddhead span{font-size:12px;color:var(--muted);}
.ts-root .ddgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}
.ts-root .ddstat{text-align:center;}
.ts-root .ddstat .v{font-family:'Fraunces',serif;font-size:18px;}
.ts-root .ddstat .v.pos{color:var(--teal);}
.ts-root .ddstat .v.neg{color:var(--rose);}
.ts-root .ddstat .l{font-size:10.5px;color:var(--muted);margin-top:2px;}
.ts-root .ddnote{font-size:13px;color:var(--text);line-height:1.5;font-style:italic;}
.ts-root .ddnews{margin-top:8px;font-size:12px;color:var(--muted);}
.ts-root .ddclose{margin-top:12px;background:none;border:none;color:var(--muted);text-decoration:underline;font-size:12px;cursor:pointer;padding:0;}
@media (max-width:420px){ .ts-root .nowbtn .what{display:none;} }
@media (max-width:600px){
  .ts-root .newsform{grid-template-columns:1fr 1fr;}
  .ts-root .newsform input:first-of-type{grid-column:1 / -1;}
  .ts-root .newsform button{grid-column:1 / -1;}
  .ts-root .newsitem .nrule{display:none;}
  .ts-root .pnl-entry input{width:96px;}
}
@media (max-width:480px){
  .ts-root .block{gap:10px;padding:12px;}
  .ts-root .block .time{width:70px;font-size:11.5px;}
  .ts-root .logrow{grid-template-columns:1fr 1fr;}
}
@media (prefers-reduced-motion:reduce){
  .ts-root .block.just-scrolled{animation:none;}
}
.ts-focus-enter{animation:ts-focus-fade .35s ease;}
@keyframes ts-focus-fade{
  from{opacity:0;transform:translateY(6px);}
  to{opacity:1;transform:translateY(0);}
}
@media (prefers-reduced-motion:reduce){
  .ts-focus-enter{animation:none;}
}

.ts-modal-backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,0.55);
  display:flex; align-items:flex-end; justify-content:center;
  z-index:100; animation:ts-modal-fade .2s ease;
}
@media (min-width:640px){
  .ts-modal-backdrop{ align-items:center; padding:20px; }
}
@keyframes ts-modal-fade{ from{opacity:0;} to{opacity:1;} }

.ts-modal{
  width:100%; max-width:420px;
  background:var(--surface); border:1px solid var(--border);
  border-radius:20px 20px 0 0;
  padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));
  box-shadow:0 -8px 30px rgba(0,0,0,.35);
  animation:ts-modal-up .25s ease;
}
@media (min-width:640px){
  .ts-modal{ border-radius:16px; padding:22px 24px; box-shadow:0 12px 40px rgba(0,0,0,.4); }
}
@keyframes ts-modal-up{ from{transform:translateY(24px); opacity:0;} to{transform:translateY(0); opacity:1;} }
@media (prefers-reduced-motion:reduce){
  .ts-modal-backdrop, .ts-modal{ animation:none; }
}

.ts-modal-title{
  font-family:'Fraunces',serif; font-size:18px; font-weight:600; color:var(--text); margin-bottom:4px;
}
.ts-modal-sub{ font-size:13px; color:var(--muted); margin-bottom:18px; line-height:1.4; }
.ts-modal-row{ display:flex; gap:10px; }
.ts-modal-field{ margin-bottom:16px; flex:1; }
.ts-modal-field label{ display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
.ts-modal-field input{
  width:100%; background:var(--surface-2); border:1px solid var(--border);
  border-radius:10px; color:var(--text); padding:11px 12px; font-size:15px; font-family:inherit;
}
.ts-modal-field input:focus{ border-color:var(--amber); outline:none; }
.ts-modal-actions{ display:flex; gap:10px; margin-top:4px; }
.ts-modal-btn{
  flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid transparent;
}
.ts-modal-btn.ghost{ background:var(--surface-2); border-color:var(--border); color:var(--text); }
.ts-modal-btn.primary{ background:var(--amber); color:#1a1408; }

.ts-target-card{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-card); box-shadow:var(--shadow-card);padding:14px 16px;margin:20px 0 26px;}
.ts-target-head{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:var(--muted);margin-bottom:10px;}
.ts-target-nums{display:flex;align-items:baseline;gap:6px;margin-bottom:10px;}
.ts-target-current{font-family:'Fraunces',serif;font-size:26px;font-weight:500;color:var(--text);}
.ts-target-current.pos{color:var(--teal);}
.ts-target-current.neg{color:var(--rose);}
.ts-target-of{font-size:13px;color:var(--muted);}
.ts-target-bar{height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden;}
.ts-target-fill{height:100%;background:var(--amber);transition:width .3s ease;}
.ts-target-fill.met{background:var(--teal);}
.ts-target-fill.neg{background:var(--rose);}
.ts-target-sub{font-size:11.5px;color:var(--muted);margin-top:8px;}
.ts-target-edit{display:flex;gap:8px;align-items:center;}
.ts-target-edit input{flex:1;min-width:0;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:8px 10px;font-size:14px;font-family:inherit;}
.ts-target-save{border:none;background:var(--amber);color:#1a1408;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;}
.ts-target-cancel{border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;white-space:nowrap;}

.ts-cal-jump{display:flex;gap:6px;margin-bottom:10px;}
.ts-cal-jump select{flex:1;min-width:0;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:7px 8px;font-size:12.5px;font-family:inherit;}
.ts-cal-today{border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:8px;padding:7px 12px;font-size:12.5px;cursor:pointer;white-space:nowrap;}
.ts-cal-today:hover{border-color:var(--amber);color:var(--text);}
`;