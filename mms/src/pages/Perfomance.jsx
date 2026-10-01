import React, { useState, useEffect, useMemo } from "react";

/**
 * <Performance />
 * Monthly performance log: win rate, profit factor, consistency, drawdown,
 * plus a trading-block and time-of-day breakdown to find your best and worst windows.
 * Reads the same localStorage keys as Session.jsx (td_history, td_day_*, td_currency, td_monthlyTarget).
 * Visual layer: the light blue-glass theme from Session.
 */

// ---------- utilities ----------
const pad = (n) => String(n).padStart(2, "0");
const todayKey = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const M = (h, m) => h * 60 + m;
const hm = (min) => pad(Math.floor(min / 60)) + ":" + pad(min % 60);
const EMPTY = [];

function readLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

// Must match Session.jsx
const BE_LIMIT = 10;
const isBE = (v) => Math.abs(v) < BE_LIMIT;

// Must match the trading blocks in Session.jsx SCHEDULE.session
const TRADE_BLOCKS = [
  { id: "t1", short: "Block 1", t: "11:00–12:15", start: M(11, 0), end: M(12, 15) },
  { id: "t2", short: "Block 2", t: "12:30–13:30", start: M(12, 30), end: M(13, 30) },
  { id: "t3", short: "Block 3", t: "14:00–15:00", start: M(14, 0), end: M(15, 0) },
  { id: "t4", short: "Block 4", t: "15:15–16:15", start: M(15, 15), end: M(16, 15) },
  { id: "tfinal", short: "Final block", t: "16:30–16:50", start: M(16, 30), end: M(16, 50) },
];

// A trade logged inside a block belongs to it. One logged during a break
// belongs to the block that just ended (you log after the trade closes).
function blockForMinute(m) {
  const inside = TRADE_BLOCKS.find((b) => m >= b.start && m < b.end);
  if (inside) return inside.id;
  const before = TRADE_BLOCKS.filter((b) => b.end <= m);
  return before.length ? before[before.length - 1].id : TRADE_BLOCKS[0].id;
}

function isWeekday(dateStr) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow !== 0 && dow !== 6;
}
const isActive = (e) => (e.wins || 0) + (e.losses || 0) + (e.breakeven || 0) > 0 || (e.net || 0) !== 0;

function monthLabel(key, short) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1;
  return new Date(y, m, 1).toLocaleDateString(undefined, short ? { month: "short", year: "numeric" } : { month: "long", year: "numeric" });
}

// ---------- data ----------
function loadData() {
  const today = todayKey();
  const map = {};
  readLS("td_history", []).forEach((h) => { if (h && h.date) map[h.date] = h; });

  // Today's live session overrides the saved entry, so numbers move as you log trades.
  const live = readLS("td_day_" + today, null);
  if (live && Array.isArray(live.pnl) && live.pnl.length > 0 && isWeekday(today)) {
    const times = Array.isArray(live.times) ? live.times : [];
    const saved = map[today] || {};
    map[today] = {
      ...saved,
      date: today,
      wins: live.pnl.filter((v) => v >= BE_LIMIT).length,
      losses: live.pnl.filter((v) => v <= -BE_LIMIT).length,
      breakeven: live.pnl.filter(isBE).length,
      net: live.pnl.reduce((a, b) => a + b, 0),
      maxLoss: saved.maxLoss != null ? saved.maxLoss : readLS("td_maxLoss", 160),
      stoppedOnTime: !!(live.checks && live.checks.eod),
      trades: live.pnl.map((v, i) => ({ v, m: times[i] != null ? times[i] : null })),
    };
  }

  const entries = Object.values(map)
    .filter(isActive)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    entries,
    currency: readLS("td_currency", "$"),
    target: Number(readLS("td_monthlyTarget", 2000)) || 0,
  };
}

// ---------- stats ----------
function computeStats(days) {
  const n = days.length;
  let net = 0, wins = 0, losses = 0, be = 0, green = 0, onTime = 0, floorHeld = 0;
  let dayGain = 0, dayLoss = 0, cum = 0, peak = 0, maxDD = 0, streak = 0, bestStreak = 0;
  let bestDay = null, worstDay = null, tradeDays = 0;
  const tradeVals = [];
  const curve = [];

  days.forEach((d) => {
    const dn = d.net || 0;
    net += dn;
    wins += d.wins || 0;
    losses += d.losses || 0;
    be += d.breakeven || 0;

    if (dn > 0) { green++; dayGain += dn; streak++; bestStreak = Math.max(bestStreak, streak); }
    else { if (dn < 0) dayLoss += -dn; streak = 0; }

    if (d.stoppedOnTime) onTime++;
    if (d.maxLoss == null || dn > -d.maxLoss) floorHeld++;

    cum += dn;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
    curve.push({ date: d.date, cum, net: dn });

    if (!bestDay || dn > bestDay.net) bestDay = { date: d.date, net: dn };
    if (!worstDay || dn < worstDay.net) worstDay = { date: d.date, net: dn };

    if (Array.isArray(d.trades) && d.trades.length) {
      tradeDays++;
      d.trades.forEach((t) => tradeVals.push(t.v));
    }
  });

  const trades = wins + losses + be;

  // Profit factor: trade-level when every day has trade detail, otherwise day-level.
  let pf = null, pfBasis = "days";
  if (n > 0 && tradeDays === n) {
    const gp = tradeVals.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const gl = tradeVals.filter((v) => v < 0).reduce((a, b) => a - b, 0);
    pf = gl > 0 ? gp / gl : gp > 0 ? Infinity : null;
    pfBasis = "trades";
  } else if (n > 0) {
    pf = dayLoss > 0 ? dayGain / dayLoss : dayGain > 0 ? Infinity : null;
  }

  const winVals = tradeVals.filter((v) => v >= BE_LIMIT);
  const lossVals = tradeVals.filter((v) => v <= -BE_LIMIT);
  const avgWin = winVals.length ? winVals.reduce((a, b) => a + b, 0) / winVals.length : null;
  const avgLoss = lossVals.length ? Math.abs(lossVals.reduce((a, b) => a + b, 0) / lossVals.length) : null;

  return {
    n, net, wins, losses, be, trades, green, curve, maxDD, bestDay, worstDay, bestStreak, pf, pfBasis,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    expectancy: trades > 0 ? net / trades : null,
    avgWin, avgLoss,
    payoff: avgWin != null && avgLoss ? avgWin / avgLoss : null,
    greenRate: n ? (green / n) * 100 : null,
    bestDayShare: net > 0 && bestDay && bestDay.net > 0 ? (bestDay.net / net) * 100 : null,
    onTimeRate: n ? (onTime / n) * 100 : null,
    floorRate: n ? (floorHeld / n) * 100 : null,
    tradesPerDay: n ? trades / n : null,
    tradeDays,
  };
}

function analyseTimes(days) {
  const blocks = TRADE_BLOCKS.map((b) => ({ ...b, net: 0, trades: 0, wins: 0, losses: 0 }));
  const slots = [];
  for (let m = M(11, 0); m < M(17, 0); m += 30) slots.push({ start: m, net: 0, trades: 0 });
  let counted = 0;

  days.forEach((d) => {
    if (!Array.isArray(d.trades)) return;
    d.trades.forEach((t) => {
      if (t.m == null) return;
      counted++;
      const b = blocks.find((x) => x.id === blockForMinute(t.m));
      b.net += t.v;
      b.trades++;
      if (t.v >= BE_LIMIT) b.wins++;
      else if (t.v <= -BE_LIMIT) b.losses++;
      const s = slots.find((x) => t.m >= x.start && t.m < x.start + 30) || (t.m < M(11, 0) ? slots[0] : slots[slots.length - 1]);
      s.net += t.v;
      s.trades++;
    });
  });
  return { blocks, slots, counted };
}

function buildInsights(t, fmt) {
  const out = [];
  if (!t.counted) return out;
  const plural = (n) => (n === 1 ? "trade" : "trades");
  const wr = (b) => (b.wins + b.losses > 0 ? Math.round((b.wins / (b.wins + b.losses)) * 100) : 0);

  const withTrades = t.blocks.filter((b) => b.trades > 0);
  const best = withTrades.filter((b) => b.net > 0).sort((a, b) => b.net - a.net)[0];
  const worst = withTrades.filter((b) => b.net < 0).sort((a, b) => a.net - b.net)[0];
  if (best) out.push({ tone: "pos", text: `${best.short} (${best.t}) is your strongest window: ${fmt(best.net)} over ${best.trades} ${plural(best.trades)}, ${wr(best)}% win rate.` });
  if (worst) out.push({ tone: "neg", text: `${worst.short} (${worst.t}) costs you the most: ${fmt(worst.net)} over ${worst.trades} ${plural(worst.trades)}. Worth sizing down or sitting it out until the data says otherwise.` });

  const slotsWith = t.slots.filter((s) => s.trades > 0);
  const bs = slotsWith.filter((s) => s.net > 0).sort((a, b) => b.net - a.net)[0];
  const ws = slotsWith.filter((s) => s.net < 0).sort((a, b) => a.net - b.net)[0];
  if (bs) out.push({ tone: "pos", text: `Best half-hour: ${hm(bs.start)}–${hm(bs.start + 30)} (${fmt(bs.net)}).` });
  if (ws) out.push({ tone: "neg", text: `Weakest half-hour: ${hm(ws.start)}–${hm(ws.start + 30)} (${fmt(ws.net)}).` });

  if (t.counted < 20) out.push({ tone: "note", text: `Small sample: ${t.counted} timed ${plural(t.counted)} so far. Treat this as a hint, not a rule.` });
  return out;
}

// ---------- presentational pieces ----------
function DimMoney({ text }) {
  if (text == null) return null;
  const s = String(text);
  const i = s.lastIndexOf(".");
  if (i < 0) return <>{s}</>;
  return (<>{s.slice(0, i)}<span className="pf-dim">{s.slice(i)}</span></>);
}

function Ring({ pct, met, neg }) {
  const size = 84, r = 34, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg className="pf-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={met ? "#8dffc0" : neg ? "#ffb0a8" : "#ffffff"}
        strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .5s ease" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">{Math.round(pct)}%</text>
    </svg>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="pf-kpi">
      <div className="pf-kpi-l">{label}</div>
      <div className={"pf-kpi-v" + (tone ? " " + tone : "")}>{value}</div>
      {hint ? <div className="pf-kpi-h">{hint}</div> : null}
    </div>
  );
}

function EquityChart({ curve }) {
  const W = 480, H = 170, PX = 14, PT = 16, PB = 18;
  const pts = [{ cum: 0 }, ...curve];
  const vals = pts.map((p) => p.cum);
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const range = max - min || 1;
  const x = (i) => PX + (i / (pts.length - 1)) * (W - 2 * PX);
  const y = (v) => PT + (1 - (v - min) / range) * (H - PT - PB);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const up = pts[pts.length - 1].cum >= 0;
  const color = up ? "var(--teal)" : "var(--rose)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative profit and loss for the month" style={{ display: "block" }}>
      <defs>
        <linearGradient id="pf-eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <line x1={PX} x2={W - PX} y1={y(0)} y2={y(0)} style={{ stroke: "var(--border)" }} strokeDasharray="3 4" />
      <path d={area} fill="url(#pf-eq-grad)" />
      <path d={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
      {pts.slice(1).map((p, i) => (
        <circle key={i} cx={x(i + 1)} cy={y(p.cum)} r="3.2" style={{ fill: color, stroke: "var(--modal-bg)" }} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function DailyBars({ days, monthKey, fmt }) {
  const W = 480, H = 150, PX = 10, PT = 10, PB = 22;
  const y0 = Number(monthKey.slice(0, 4)), m0 = Number(monthKey.slice(5, 7));
  const total = new Date(y0, m0, 0).getDate();
  const byDay = {};
  days.forEach((d) => { byDay[Number(d.date.slice(8, 10))] = d.net || 0; });
  const nets = Object.values(byDay);
  const maxPos = Math.max(0, ...nets), maxNeg = Math.max(0, ...nets.map((v) => -v));
  const range = maxPos + maxNeg || 1;
  const plotH = H - PT - PB, k = plotH / range, zeroY = PT + plotH * (maxPos / range);
  const slot = (W - 2 * PX) / total, bw = Math.max(3, slot * 0.62);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Daily profit and loss" style={{ display: "block" }}>
      <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} style={{ stroke: "var(--border)" }} strokeDasharray="3 4" />
      {Array.from({ length: total }, (_, i) => {
        const day = i + 1, v = byDay[day];
        const cx = PX + i * slot + slot / 2;
        const showLabel = day === 1 || day % 5 === 0;
        return (
          <g key={day}>
            {v !== undefined && (
              <rect x={cx - bw / 2} y={v >= 0 ? zeroY - Math.max(2, v * k) : zeroY} width={bw} height={Math.max(2, Math.abs(v) * k)} rx="3"
                style={{ fill: v >= 0 ? "var(--teal)" : "var(--rose)" }}>
                <title>{`Day ${day}: ${fmt(v)}`}</title>
              </rect>
            )}
            {showLabel && (
              <text x={cx} y={H - 7} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: "9px", fontWeight: 600 }}>{day}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SlotChart({ slots, fmt }) {
  const W = 480, H = 190, PX = 10, PT = 12, PB = 26;
  const maxPos = Math.max(0, ...slots.map((s) => s.net));
  const maxNeg = Math.max(0, ...slots.map((s) => -s.net));
  const range = maxPos + maxNeg || 1, maxAbs = Math.max(maxPos, maxNeg) || 1;
  const plotH = H - PT - PB, k = plotH / range, zeroY = PT + plotH * (maxPos / range);
  const slot = (W - 2 * PX) / slots.length, bw = slot * 0.64;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit and loss by half-hour of the session" style={{ display: "block" }}>
      <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} style={{ stroke: "var(--border)" }} strokeDasharray="3 4" />
      {slots.map((s, i) => {
        const x = PX + i * slot + (slot - bw) / 2;
        const up = s.net >= 0;
        const h = Math.max(s.trades ? 2.5 : 0, Math.abs(s.net) * k);
        return (
          <g key={s.start}>
            <title>{`${hm(s.start)} · ${s.trades} trade${s.trades === 1 ? "" : "s"} · ${fmt(s.net)}`}</title>
            {s.trades > 0 ? (
              <rect x={x} y={up ? zeroY - h : zeroY} width={bw} height={h} rx="4"
                style={{ fill: up ? "var(--teal)" : "var(--rose)", opacity: 0.35 + 0.65 * (Math.abs(s.net) / maxAbs) }} />
            ) : (
              <circle cx={x + bw / 2} cy={zeroY} r="2" style={{ fill: "var(--muted)", opacity: 0.4 }} />
            )}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: "8.5px", fontWeight: 600 }}>{hm(s.start)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- component ----------
export default function Performance({ onBack } = {}) {
  const [tick, setTick] = useState(0);
  const [monthKey, setMonthKey] = useState(() => todayKey().slice(0, 7));
  const [scope, setScope] = useState("all"); // "all" | "month" (for the time analysis)

  // refresh when the tab regains focus or another tab writes to storage
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("ts-font-link")) return;
    const link = document.createElement("link");
    link.id = "ts-font-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const { entries, currency, target } = useMemo(() => loadData(), [tick]);

  const money = (n) => currency + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmt = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + money(n);
  const pct = (v) => (v == null ? "\u2014" : Math.round(v) + "%");
  const pfText = (v) => (v == null ? "\u2014" : v === Infinity ? "\u221E" : v.toFixed(2));

  const byMonth = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      const k = e.date.slice(0, 7);
      if (!m[k]) m[k] = [];
      m[k].push(e);
    });
    return m;
  }, [entries]);

  const months = useMemo(() => {
    const set = new Set(Object.keys(byMonth));
    set.add(todayKey().slice(0, 7));
    return Array.from(set).sort().reverse(); // newest first
  }, [byMonth]);

  const monthRows = useMemo(() => months.map((k) => ({ key: k, s: computeStats(byMonth[k] || EMPTY) })), [months, byMonth]);

  const monthDays = byMonth[monthKey] || EMPTY;
  const stats = useMemo(() => computeStats(monthDays), [monthDays]);
  const timeData = useMemo(() => analyseTimes(scope === "month" ? monthDays : entries), [scope, monthDays, entries]);
  const insights = useMemo(() => buildInsights(timeData, fmt), [timeData, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = months.indexOf(monthKey);
  const olderMonth = idx >= 0 ? months[idx + 1] : undefined;
  const newerMonth = idx > 0 ? months[idx - 1] : undefined;

  const targetPct = target > 0 ? Math.max(0, Math.min(100, (stats.net / target) * 100)) : 0;
  const targetMet = target > 0 && stats.net >= target;

  const goBack = () => {
    if (typeof onBack === "function") onBack();
    else if (typeof window !== "undefined") {
      if (window.history.length > 1) window.history.back();
      else window.location.hash = "";
    }
  };

  const pickMonth = (k) => {
    setMonthKey(k);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const blockMax = Math.max(1, ...timeData.blocks.map((b) => Math.abs(b.net)));
  const bestBlockId = (() => {
    const c = timeData.blocks.filter((b) => b.trades > 0 && b.net > 0).sort((a, b) => b.net - a.net)[0];
    return c ? c.id : null;
  })();
  const worstBlockId = (() => {
    const c = timeData.blocks.filter((b) => b.trades > 0 && b.net < 0).sort((a, b) => a.net - b.net)[0];
    return c ? c.id : null;
  })();

  const dailyRows = useMemo(() => monthDays.slice().reverse(), [monthDays]);
  const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

  return (
    <div className="pf-root">
      <style>{CSS}</style>
      <div className="pf-wrap">
        {/* header */}
        <header className="pf-top">
          <button className="pf-back" onClick={goBack} aria-label="Back to The Session">{"\u2039"} Session</button>
          <h1>Performance</h1>
        </header>

        {/* month chips */}
        <div className="pf-months" role="tablist" aria-label="Months">
          {months.map((k) => (
            <button key={k} role="tab" aria-selected={k === monthKey} className={"pf-mchip" + (k === monthKey ? " on" : "")} onClick={() => setMonthKey(k)}>
              {monthLabel(k, true)}
            </button>
          ))}
        </div>

        {/* hero */}
        <div className="pf-hero">
          <div className="pf-hero-nav">
            <button className="pf-nav" onClick={() => olderMonth && setMonthKey(olderMonth)} disabled={!olderMonth} aria-label="Older month">{"\u2039"}</button>
            <span>{monthLabel(monthKey)}</span>
            <button className="pf-nav" onClick={() => newerMonth && setMonthKey(newerMonth)} disabled={!newerMonth} aria-label="Newer month">{"\u203A"}</button>
          </div>
          <div className="pf-hero-top">
            <div className="pf-hero-nums">
              <span className={"pf-hero-net" + (stats.net < 0 ? " neg" : "")}><DimMoney text={fmt(stats.net)} /></span>
              {target > 0 && <span className="pf-hero-of">/ {money(target)}</span>}
            </div>
            {target > 0 && <Ring pct={targetPct} met={targetMet} neg={stats.net < 0} />}
          </div>
          <div className="pf-chips">
            <span className="pf-chip">{stats.n} trading {stats.n === 1 ? "day" : "days"}</span>
            <span className="pf-chip">{pct(stats.winRate)} win rate</span>
            <span className="pf-chip">PF {pfText(stats.pf)}</span>
          </div>
          {target > 0 && (
            <div className="pf-hero-sub">
              {targetMet ? "Target reached. Anything from here is a bonus." : stats.net < 0 ? `${money(Math.abs(stats.net))} in the hole \u2014 ${money(target - stats.net)} to reach target.` : `${money(target - stats.net)} to go this month.`}
            </div>
          )}
        </div>

        {stats.n === 0 ? (
          <div className="pf-card pf-empty">No trading days logged for {monthLabel(monthKey)} yet. Save a day in The Session and it appears here.</div>
        ) : (
          <>
            {/* KPIs */}
            <h2 className="pf-section">Key metrics<span className="pf-sub">{monthLabel(monthKey, true)}</span></h2>
            <div className="pf-kpis">
              <Kpi label="Win rate" value={pct(stats.winRate)} hint={`${stats.wins}W \u00B7 ${stats.losses}L \u00B7 ${stats.be}BE`} />
              <Kpi label="Profit factor" value={pfText(stats.pf)} tone={stats.pf == null ? "" : stats.pf >= 1 ? "pos" : "neg"} hint={stats.pfBasis === "trades" ? "gross win \u00F7 gross loss" : "based on daily results"} />
              <Kpi label="Expectancy" value={stats.expectancy == null ? "\u2014" : fmt(stats.expectancy)} tone={stats.expectancy == null ? "" : tone(stats.expectancy)} hint="average per trade" />
              <Kpi label="Payoff ratio" value={stats.payoff == null ? "\u2014" : stats.payoff.toFixed(2)} hint={stats.avgWin != null && stats.avgLoss != null ? `avg win ${money(stats.avgWin)} \u00B7 avg loss ${money(stats.avgLoss)}` : "needs trade-level data"} />
              <Kpi label="Green days" value={pct(stats.greenRate)} hint={`${stats.green} of ${stats.n} days`} />
              <Kpi label="Best-day share" value={pct(stats.bestDayShare)} hint="of profit \u00B7 under 30% is well spread" />
              <Kpi label="Max drawdown" value={stats.maxDD > 0 ? "\u2212" + money(stats.maxDD) : money(0)} tone={stats.maxDD > 0 ? "neg" : ""} hint="peak to trough, daily" />
              <Kpi label="Trades per day" value={stats.tradesPerDay == null ? "\u2014" : stats.tradesPerDay.toFixed(1)} hint={`${stats.trades} trades total`} />
              <Kpi label="Stopped on time" value={pct(stats.onTimeRate)} hint="end-of-day review done" />
              <Kpi label="Loss floor held" value={pct(stats.floorRate)} hint="days above your max loss" />
              <Kpi label="Best day" value={stats.bestDay ? fmt(stats.bestDay.net) : "\u2014"} tone={stats.bestDay ? tone(stats.bestDay.net) : ""} hint={stats.bestDay ? new Date(stats.bestDay.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""} />
              <Kpi label="Worst day" value={stats.worstDay ? fmt(stats.worstDay.net) : "\u2014"} tone={stats.worstDay ? tone(stats.worstDay.net) : ""} hint={`longest green streak: ${stats.bestStreak}`} />
            </div>

            {/* charts */}
            <h2 className="pf-section">Equity curve<span className="pf-sub">cumulative, day by day</span></h2>
            <div className="pf-card"><EquityChart curve={stats.curve} /></div>

            <h2 className="pf-section">Daily P&amp;L<span className="pf-sub">each trading day</span></h2>
            <div className="pf-card"><DailyBars days={monthDays} monthKey={monthKey} fmt={fmt} /></div>
          </>
        )}

        {/* time analysis */}
        <h2 className="pf-section">Best &amp; worst times<span className="pf-sub">by trading block</span></h2>
        <div className="pf-seg" role="group" aria-label="Time analysis range">
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All time</button>
          <button className={scope === "month" ? "on" : ""} onClick={() => setScope("month")}>{monthLabel(monthKey, true)}</button>
        </div>

        {timeData.counted === 0 ? (
          <div className="pf-card pf-empty">
            Time-of-day insights start with your next logged trade. Trades are time-stamped from now on; older days only feed the daily metrics.
          </div>
        ) : (
          <>
            <div className="pf-card">
              {timeData.blocks.map((b) => {
                const w = (Math.abs(b.net) / blockMax) * 50;
                const wr = b.wins + b.losses > 0 ? Math.round((b.wins / (b.wins + b.losses)) * 100) : null;
                return (
                  <div className="pf-brow" key={b.id}>
                    <div className="pf-bname">
                      <b>{b.short}</b>
                      <span>{b.t}</span>
                    </div>
                    <div className="pf-bbar" aria-hidden="true">
                      <div className="pf-baxis" />
                      {b.trades > 0 && (
                        <div className={"pf-bfill " + (b.net >= 0 ? "pos" : "neg")}
                          style={b.net >= 0 ? { left: "50%", width: w + "%" } : { right: "50%", width: w + "%" }} />
                      )}
                    </div>
                    <div className="pf-bnum">
                      <div className={"pf-bval " + tone(b.net)}>{b.trades ? fmt(b.net) : "\u2014"}</div>
                      <div className="pf-bmeta">
                        {b.trades ? `${b.trades} \u00B7 ${wr == null ? "\u2014" : wr + "%"}` : "no trades"}
                      </div>
                    </div>
                    {b.id === bestBlockId && <span className="pf-tag pos">Best</span>}
                    {b.id === worstBlockId && <span className="pf-tag neg">Weakest</span>}
                  </div>
                );
              })}
              <div className="pf-legend">net P&amp;L &middot; trades &middot; win rate</div>
            </div>

            <h2 className="pf-section" style={{ marginTop: 22 }}>Half-hour heat<span className="pf-sub">11:00 &ndash; 17:00</span></h2>
            <div className="pf-card"><SlotChart slots={timeData.slots} fmt={fmt} /></div>

            {insights.length > 0 && (
              <div className="pf-insights">
                {insights.map((it, i) => (
                  <div key={i} className={"pf-insight " + it.tone}>{it.text}</div>
                ))}
              </div>
            )}
          </>
        )}

        {/* monthly log */}
        <h2 className="pf-section">Monthly log<span className="pf-sub">tap a month to open it</span></h2>
        <div className="pf-card pf-table">
          <div className="pf-trow head">
            <span>Month</span><span>Days</span><span>Net</span><span>Win</span><span>PF</span>
          </div>
          {monthRows.map(({ key, s }) => (
            <button key={key} className={"pf-trow" + (key === monthKey ? " on" : "")} onClick={() => pickMonth(key)}>
              <span className="pf-tm">{monthLabel(key, true)}</span>
              <span>{s.n}</span>
              <span className={"pf-tn " + tone(s.net)}>{s.n ? fmt(s.net) : "\u2014"}</span>
              <span>{pct(s.winRate)}</span>
              <span>{pfText(s.pf)}</span>
            </button>
          ))}
        </div>

        {/* daily log */}
        {dailyRows.length > 0 && (
          <>
            <h2 className="pf-section">Daily log<span className="pf-sub">{monthLabel(monthKey, true)}</span></h2>
            <div className="pf-card pf-days">
              {dailyRows.map((d) => (
                <div className="pf-day" key={d.date}>
                  <div className="pf-day-d">{new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
                  <div className="pf-day-m">
                    {(d.wins || 0)}{"\u2013"}{(d.losses || 0)}{"\u2013"}{(d.breakeven || 0)} &middot; {(d.wins || 0) + (d.losses || 0) + (d.breakeven || 0)} trades
                    {d.note ? <div className="pf-day-note">{"\u201C"}{d.note}{"\u201D"}</div> : null}
                  </div>
                  <div className={"pf-day-n " + tone(d.net || 0)}>{fmt(d.net || 0)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <footer className="pf-foot">Win rate counts wins &divide; (wins + losses). Trades inside &plusmn;{money(BE_LIMIT)} count as break-even.</footer>
      </div>
    </div>
  );
}

// ---------- scoped styles (light blue glass, matches Session light mode) ----------
const CSS = `
.pf-root{
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
--modal-bg:#eef4ff;
--blur:blur(18px) saturate(120%);
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--glow-amber:rgba(233,169,42,.42);
--r-card:26px; --r-input:14px; --r-pill:999px;

padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
box-sizing:border-box; min-height:100vh; position:relative;
background:var(--bg-grad); background-attachment:fixed;
color:var(--text); font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.pf-root::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
    radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
    radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);}
.pf-root *{box-sizing:border-box;}
.pf-root button{font-family:inherit;}
.pf-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.pf-wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:24px 18px 60px;}
.pf-dim{opacity:.5;}

/* header */
.pf-top{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.pf-top h1{margin:0;font-size:clamp(26px,6vw,32px);font-weight:800;letter-spacing:-.03em;line-height:1.05;}
.pf-back{background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.pf-back:hover{border-color:var(--amber);color:var(--text);}

/* month chips */
.pf-months{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;margin:0 -2px;scrollbar-width:none;}
.pf-months::-webkit-scrollbar{display:none;}
.pf-mchip{flex-shrink:0;padding:8px 14px;border-radius:var(--r-pill);font-size:12px;font-weight:700;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;transition:all .2s ease;}
.pf-mchip.on{background:var(--btn);color:var(--on-accent);border-color:transparent;}

/* hero */
.pf-hero{position:relative;overflow:hidden;margin:4px 0 14px;padding:18px 20px;border-radius:30px;border:1px solid rgba(255,255,255,.3);background:var(--hero);color:#fff;box-shadow:var(--hero-shadow);}
.pf-hero::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(420px 220px at 100% -10%,rgba(255,255,255,.3),transparent 65%);}
.pf-hero>*{position:relative;z-index:1;}
.pf-hero-nav{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;font-weight:600;color:rgba(255,255,255,.9);margin-bottom:10px;}
.pf-nav{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.16);color:#fff;font-size:18px;line-height:1;cursor:pointer;}
.pf-nav:disabled{opacity:.35;cursor:default;}
.pf-hero-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.pf-hero-nums{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0;}
.pf-hero-net{font-size:clamp(34px,10vw,46px);font-weight:700;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums;}
.pf-hero-net.neg{color:#ffd0ca;}
.pf-hero-of{font-size:14px;color:rgba(255,255,255,.75);font-weight:500;}
.pf-ring{flex-shrink:0;filter:drop-shadow(0 6px 14px rgba(5,20,60,.35));}
.pf-chips{display:flex;flex-wrap:wrap;gap:8px;}
.pf-chip{font-size:12px;font-weight:600;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);border-radius:var(--r-pill);padding:5px 11px;font-variant-numeric:tabular-nums;}
.pf-hero-sub{font-size:12px;color:rgba(255,255,255,.85);margin-top:12px;}

/* shared */
.pf-card{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card);border-radius:var(--r-card);padding:16px;}
.pf-empty{font-size:13px;color:var(--muted);line-height:1.5;text-align:center;padding:22px 18px;}
.pf-section{font-weight:700;font-size:19px;letter-spacing:-.02em;margin:30px 0 12px;padding:0 4px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.pf-sub{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0;text-align:right;}
.pos{color:var(--teal);}
.neg{color:var(--rose);}

/* kpis */
.pf-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pf-kpi{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card);border-radius:22px;padding:14px 16px;min-width:0;}
.pf-kpi-l{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;}
.pf-kpi-v{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;}
.pf-kpi-v.pos{color:var(--teal);} .pf-kpi-v.neg{color:var(--rose);}
.pf-kpi-h{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.35;}

/* segmented control */
.pf-seg{display:inline-flex;gap:4px;padding:4px;border-radius:var(--r-pill);background:var(--surface-2);border:1px solid var(--border);margin-bottom:12px;}
.pf-seg button{border:none;background:none;color:var(--muted);font-size:12px;font-weight:700;padding:7px 14px;border-radius:var(--r-pill);cursor:pointer;transition:all .2s ease;}
.pf-seg button.on{background:var(--btn);color:var(--on-accent);}

/* block rows */
.pf-brow{display:grid;grid-template-columns:92px 1fr 78px;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);position:relative;}
.pf-brow:last-of-type{border-bottom:none;}
.pf-bname b{display:block;font-size:13.5px;font-weight:700;}
.pf-bname span{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
.pf-bbar{position:relative;height:16px;border-radius:var(--r-pill);background:var(--surface-2);overflow:hidden;}
.pf-baxis{position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);}
.pf-bfill{position:absolute;top:0;bottom:0;border-radius:var(--r-pill);transition:width .4s ease;}
.pf-bfill.pos{background:linear-gradient(90deg,rgba(11,143,80,.55),var(--teal));}
.pf-bfill.neg{background:linear-gradient(270deg,rgba(214,60,51,.55),var(--rose));}
.pf-bnum{text-align:right;}
.pf-bval{font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums;}
.pf-bmeta{font-size:10.5px;color:var(--muted);margin-top:2px;}
.pf-tag{position:absolute;right:0;top:-2px;font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:var(--r-pill);}
.pf-tag.pos{background:var(--teal-dim);color:var(--teal);}
.pf-tag.neg{background:var(--rose-dim);color:var(--rose);}
.pf-legend{font-size:11px;color:var(--muted);text-align:right;margin-top:8px;}

/* insights */
.pf-insights{display:grid;gap:8px;margin-top:12px;}
.pf-insight{border-radius:18px;padding:12px 14px;font-size:13px;line-height:1.45;border:1px solid var(--border);background:var(--surface-2);}
.pf-insight.pos{background:var(--teal-dim);border-color:transparent;}
.pf-insight.neg{background:var(--rose-dim);border-color:transparent;}
.pf-insight.note{color:var(--muted);font-size:12px;}

/* tables + lists */
.pf-table{padding:8px 10px;}
.pf-trow{display:grid;grid-template-columns:1.5fr .6fr 1.2fr .8fr .8fr;gap:6px;align-items:center;width:100%;text-align:left;padding:11px 8px;border:none;border-radius:14px;background:none;color:var(--text);font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer;}
.pf-trow.head{cursor:default;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);}
.pf-trow:not(.head):hover{background:var(--surface-2);}
.pf-trow.on{background:var(--surface-2);box-shadow:inset 3px 0 0 var(--amber);}
.pf-tm{font-weight:700;}
.pf-tn{font-weight:800;}
.pf-days{padding:6px 16px;}
.pf-day{display:grid;grid-template-columns:62px 1fr auto;gap:10px;align-items:start;padding:12px 0;border-bottom:1px solid var(--border);}
.pf-day:last-child{border-bottom:none;}
.pf-day-d{font-size:13px;font-weight:700;}
.pf-day-m{font-size:12px;color:var(--muted);min-width:0;}
.pf-day-note{margin-top:4px;font-style:italic;color:var(--text);opacity:.8;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.pf-day-n{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;}
.pf-foot{margin-top:34px;text-align:center;font-size:11.5px;color:var(--muted);line-height:1.5;}

@media (max-width:420px){
  .pf-brow{grid-template-columns:78px 1fr 70px;}
  .pf-kpi-v{font-size:23px;}
}
`;