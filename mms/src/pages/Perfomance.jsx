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

// Shared with Session.jsx: it stores the theme under "td_theme" as "dark" | "light"
function readTheme() {
  return readLS("td_theme", "dark") === "light" ? "light" : "dark";
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

// ---------- week-of-month helpers ----------
// A month is split into 4 buckets by calendar date: 1–7, 8–14, 15–21, 22–end.
const WEEK_BUCKETS = [
  { id: "w1", label: "Week 1", span: "1\u20137" },
  { id: "w2", label: "Week 2", span: "8\u201314" },
  { id: "w3", label: "Week 3", span: "15\u201321" },
  { id: "w4", label: "Week 4", span: "22\u2013end" },
];
const weekOfMonth = (dateStr) => Math.min(4, Math.ceil(Number(dateStr.slice(8, 10)) / 7));

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

// Groups trading days into Week 1–4 of their month and measures each bucket.
function analyseWeeks(days) {
  const buckets = WEEK_BUCKETS.map((b) => ({ ...b, days: [], byMonth: {} }));
  const allMonths = new Set();

  days.forEach((d) => {
    const b = buckets[weekOfMonth(d.date) - 1];
    const mk = d.date.slice(0, 7);
    b.days.push(d);
    b.byMonth[mk] = (b.byMonth[mk] || 0) + (d.net || 0);
    allMonths.add(mk);
  });

  const rows = buckets.map((b) => {
    const s = computeStats(b.days);
    const monthNets = Object.values(b.byMonth);
    return {
      id: b.id,
      label: b.label,
      span: b.span,
      s,
      n: s.n,
      net: s.net,
      avgDay: s.n ? s.net / s.n : null,
      months: monthNets.length,
    };
  });

  const totalNet = rows.reduce((a, r) => a + r.net, 0);
  // Share of total profit. Only meaningful while the overall total is positive.
  rows.forEach((r) => { r.share = totalNet > 0 && r.n ? (r.net / totalNet) * 100 : null; });

  // Best / worst are judged on average per trading day, so the longer Week 4 isn't favoured.
  const active = rows.filter((r) => r.n > 0);
  const byAvg = active.slice().sort((a, b) => b.avgDay - a.avgDay);
  const best = active.length > 1 && byAvg[0].avgDay > 0 ? byAvg[0] : null;
  const last = byAvg[byAvg.length - 1];
  const worst = active.length > 1 && last.avgDay < 0 ? last : null;

  return { rows, totalNet, active: active.length, months: allMonths.size, best, worst };
}

function buildWeekInsights(wd, fmt) {
  const out = [];
  if (!wd.active) return out;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  if (wd.best) {
    const r = wd.best;
    out.push({ tone: "pos", text: `${r.label} (days ${r.span}) is your strongest: ${fmt(r.avgDay)} per day, ${fmt(r.net)} in total over ${plural(r.n, "day")}.` });
  }
  if (wd.worst) {
    const r = wd.worst;
    out.push({ tone: "neg", text: `${r.label} (days ${r.span}) costs you the most: ${fmt(r.avgDay)} per day, ${fmt(r.net)} in total over ${plural(r.n, "day")}. Worth trading smaller or tighter in this part of the month.` });
  }
  if (wd.active > 1) out.push({ tone: "note", text: "Best and Worst compare the average per trading day, so the longer Week 4 isn’t favoured." });
  if (wd.months < 3) out.push({ tone: "note", text: `Small sample: ${plural(wd.months, "month")} of data so far. Treat this as a hint, not a rule.` });
  return out;
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

// ---------- report export (formal investor report) ----------
const TRADER_NAME = "Kevin Kipkirui"; // printed on every page of the report

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtDate = (d, short) =>
  new Date(d + "T00:00:00").toLocaleDateString(
    "en-GB",
    short ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }
  );

// ----- report periods: built from your data, so the list grows as you keep trading -----
function buildPeriodOptions(entries, monthKey) {
  const opts = [{ id: "month", label: "Selected month · " + monthLabel(monthKey, true) }];
  if (entries.length) {
    opts.push(
      { id: "last3", label: "Last 3 months" },
      { id: "last6", label: "Last 6 months" },
      { id: "ytd", label: "Year to date" }
    );
    Array.from(new Set(entries.map((e) => e.date.slice(0, 4))))
      .sort()
      .reverse()
      .forEach((y) => opts.push({ id: "y:" + y, label: "Full year " + y }));
    opts.push({ id: "all", label: "All time" });
  }
  opts.push({ id: "custom", label: "Custom range" });
  return opts;
}

// returns the trading days (sorted, oldest first) that fall inside the chosen period
function resolvePeriod(id, monthKey, entries, custom) {
  const today = todayKey();
  const monthsAgo = (n) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return todayKey(d);
  };
  let from = "0000-01-01", to = "9999-12-31";
  if (id === "month") { from = monthKey + "-01"; to = monthKey + "-31"; }
  else if (id === "last3") { from = monthsAgo(2); to = today; }
  else if (id === "last6") { from = monthsAgo(5); to = today; }
  else if (id === "ytd") { from = today.slice(0, 4) + "-01-01"; to = today; }
  else if (id.indexOf("y:") === 0) { from = id.slice(2) + "-01-01"; to = id.slice(2) + "-12-31"; }
  else if (id === "custom") { from = (custom && custom.from) || from; to = (custom && custom.to) || to; }
  return entries.filter((e) => e.date >= from && e.date <= to);
}

const REPORT_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#cfd3dc}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#10193a;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:24px 0}
.page{width:794px;height:1123px;margin:0 auto 24px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto;margin-bottom:0}
.pos{color:#14925f}.neg{color:#d64545}

.hd{height:96px;flex:none;background:linear-gradient(135deg,#17224d 0%,#0a1028 72%);color:#fff;padding:0 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #c99f48}
.hd .k{font-size:9.5px;letter-spacing:.26em;color:#e8c97a;font-weight:700}
.hd h1{font-size:23px;font-weight:800;letter-spacing:.01em;margin-top:5px}
.hd .r{text-align:right}
.hd .p{font-size:15px;font-weight:700;margin-top:5px;letter-spacing:.01em}

.rh{height:52px;flex:none;background:#0a1028;color:#fff;padding:0 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #c99f48;font-size:10.5px;letter-spacing:.04em}
.rh b{color:#e8c97a;letter-spacing:.2em;text-transform:uppercase;font-size:10px}
.rh span{opacity:.85}

.body{flex:1;padding:16px 36px 0;display:flex;flex-direction:column;gap:12px;min-height:0}
.row{display:grid;gap:12px}
.card{border:1px solid #e0e4ee;border-radius:10px;padding:10px 12px;background:#fff;min-width:0}
.ct{font-size:8.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#6b7694;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.ct b{color:#0a1028;font-weight:800}
.ct span{font-weight:600;letter-spacing:.04em;text-transform:none}
.mt{font-size:10px;color:#8a93ad;padding:34px 0;text-align:center}

.sum{border-left:3px solid #c99f48;background:#f8f9fc;border-radius:0 10px 10px 0;padding:10px 14px}
.sum p{font-size:11px;line-height:1.55;color:#26304f}

.tiles{display:grid;grid-template-columns:1.5fr repeat(5,1fr);gap:10px}
.tile{border:1px solid #e0e4ee;border-radius:10px;padding:9px 10px;background:#f8f9fc;min-width:0}
.tile.big{background:linear-gradient(150deg,#25356a 0%,#0a1028 85%);border-color:#c99f48;color:#fff}
.tl{font-size:8px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#6b7694}
.tile.big .tl{color:#e8c97a}
.tv{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile.big .tv{font-size:22px}
.tile.big .tv.pos{color:#8dffc0}.tile.big .tv.neg{color:#ffb0a8}
.tn{font-size:9px;color:#8a93ad;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile.big .tn{color:rgba(255,255,255,.7)}

.mid{grid-template-columns:1fr 1fr 1fr}
.low{grid-template-columns:1fr 1fr}
.dn{display:flex;flex-direction:column;align-items:center}
.dn svg{margin-top:2px}
.lg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%;margin-top:8px;text-align:center}
.lg div{border-top:2px solid var(--c);padding-top:4px}
.lg b{display:block;font-size:15px;font-weight:800}
.lg span{font-size:8.5px;color:#6b7694;font-weight:700;letter-spacing:.06em;text-transform:uppercase}

.strip{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid #e0e4ee;border-radius:10px;background:#f8f9fc}
.gc{padding:10px 12px;display:flex;align-items:center;gap:9px;border-left:1px solid #e0e4ee;min-width:0}
.gc:first-child{border-left:none}
.gv{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.gl{font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6b7694}
.gs{font-size:9px;color:#8a93ad;margin-top:1px}

.mtab{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.mtab th{font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6b7694;text-align:right;padding:6px 8px;border-bottom:1.5px solid #10193a}
.mtab td{text-align:right;padding:7px 8px;border-bottom:1px solid #eceff5;font-weight:600}
.mtab th:first-child,.mtab td:first-child{text-align:left}
.mtab td:first-child{font-weight:700}
.mtab tfoot td{font-weight:800;border-top:1.5px solid #10193a;border-bottom:none;background:#f8f9fc}

.disc{font-size:8.5px;line-height:1.55;color:#6b7694;border-top:1px solid #e0e4ee;padding-top:8px}
.disc b{color:#10193a}

.ft{flex:none;height:46px;margin:0 36px;border-top:1px solid #e0e4ee;display:flex;align-items:center;justify-content:space-between;font-size:8.5px;color:#8a93ad;letter-spacing:.02em}
.ft b{color:#c99f48;letter-spacing:.12em}

@page{size:A4;margin:0}
@media print{html,body{background:#fff;padding:0}.page{box-shadow:none;margin:0;width:210mm;height:297mm}}
`;

// ---------- the report (page 1 + extra pages when the period spans several months) ----------
function buildReportHTML(o) {
  const { days, stats, weekData, timeData, currency } = o;

  const money = (n) => currency + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmt = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + money(n);
  // compact version for the narrow tiles: drops decimals once a figure reaches 100
  const mS = (n) => currency + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
  const fS = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + mS(n);
  const cmp = (n) => {
    const a = Math.abs(n);
    const s = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : String(Math.round(a));
    return (n < 0 ? "\u2212" : "") + currency + s;
  };
  const sg = (n) => (n > 0 ? "+" : "") + cmp(n);
  const pct = (v) => (v == null ? "\u2014" : Math.round(v) + "%");
  const pfx = (v) => (v == null ? "\u2014" : v === Infinity ? "\u221E" : v.toFixed(2));
  const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

  const first = days.length ? days[0].date : null;
  const last = days.length ? days[days.length - 1].date : null;
  const period = first ? fmtDate(first) + " \u2013 " + fmtDate(last) : "No data";
  const multiYear = !!first && first.slice(0, 4) !== last.slice(0, 4);
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // month-by-month rows (used for the extra pages and for the histogram on long periods)
  const monthMap = {};
  days.forEach((d) => {
    const k = d.date.slice(0, 7);
    (monthMap[k] = monthMap[k] || []).push(d);
  });
  const monthKeys = Object.keys(monthMap).sort();
  const monthRows = monthKeys.map((k) => ({ key: k, s: computeStats(monthMap[k]) }));
  const ROWS_PER_PAGE = 24;
  const tableChunks = [];
  if (monthKeys.length > 1) {
    for (let i = 0; i < monthRows.length; i += ROWS_PER_PAGE) tableChunks.push(monthRows.slice(i, i + ROWS_PER_PAGE));
  }
  const totalPages = 1 + tableChunks.length;

  // ----- executive summary -----
  const dayWord = stats.n === 1 ? "day" : "days";
  const small = stats.trades < 30 ? ` The sample is small (${stats.trades} trades), so these statistics should be read with caution.` : "";
  const summary =
    `Across ${stats.n} trading ${dayWord} (${period}), the account recorded a net ${stats.net >= 0 ? "profit" : "loss"} of ${money(stats.net)} from ${stats.trades} trades. ` +
    `The win rate was ${pct(stats.winRate)} with a profit factor of ${pfx(stats.pf)}, and the maximum peak-to-trough drawdown was ${money(stats.maxDD)}. ` +
    `${stats.green} of ${stats.n} trading ${dayWord} closed in profit.` + small;

  // ----- headline tiles (no comparison arrows) -----
  const tiles = [
    { big: true, l: "Net result", v: fmt(stats.net), c: tone(stats.net), s: stats.n + " trading " + dayWord },
    { l: "Win rate", v: pct(stats.winRate), c: stats.winRate == null ? "" : stats.winRate >= 50 ? "pos" : "neg", s: `${stats.wins}W · ${stats.losses}L · ${stats.be}BE` },
    { l: "Profit factor", v: pfx(stats.pf), c: stats.pf == null ? "" : stats.pf >= 1 ? "pos" : "neg", s: stats.pfBasis === "trades" ? "gross win ÷ loss" : "from daily results" },
    { l: "Expectancy", v: stats.expectancy == null ? "—" : fS(stats.expectancy), c: tone(stats.expectancy || 0), s: "per trade" },
    { l: "Max drawdown", v: stats.maxDD > 0 ? "−" + mS(stats.maxDD) : mS(0), c: stats.maxDD > 0 ? "neg" : "", s: "peak to trough" },
    { l: "Trades", v: String(stats.trades), c: "", s: stats.tradesPerDay == null ? "&nbsp;" : stats.tradesPerDay.toFixed(1) + " per day" },
  ].map((t) => `<div class="tile${t.big ? " big" : ""}"><div class="tl">${t.l}</div><div class="tv ${t.c || ""}">${t.v}</div><div class="tn">${t.s}</div></div>`).join("");

  // ----- equity curve: one line, green above zero, red below zero -----
  const equity = (() => {
    const pts = [{ cum: 0 }, ...stats.curve];
    const W = 706, H = 170, PL = 50, PR = 12, PT = 12, PB = 22;
    let min = Math.min(0, ...pts.map((p) => p.cum)), max = Math.max(0, ...pts.map((p) => p.cum));
    if (max === min) { max += 1; min -= 1; }
    const padV = (max - min) * 0.1;
    min -= padV; max += padV;
    const x = (i) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const y = (v) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);
    const zy = y(0);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)} ${zy.toFixed(1)} L${x(0).toFixed(1)} ${zy.toFixed(1)} Z`;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    s += `<defs><clipPath id="eqUp"><rect x="0" y="0" width="${W}" height="${zy.toFixed(1)}"/></clipPath><clipPath id="eqDn"><rect x="0" y="${zy.toFixed(1)}" width="${W}" height="${Math.max(0, H - zy).toFixed(1)}"/></clipPath></defs>`;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const yy = y(v);
      s += `<line x1="${PL}" x2="${W - PR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#e9ecf3"/><text x="${PL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-weight="600" fill="#8a93ad">${cmp(v)}</text>`;
    }
    s += `<line x1="${PL}" x2="${W - PR}" y1="${zy.toFixed(1)}" y2="${zy.toFixed(1)}" stroke="#9aa4bd" stroke-dasharray="3 3"/>`;
    s += `<path d="${area}" fill="#14925f" opacity=".13" clip-path="url(#eqUp)"/><path d="${area}" fill="#d64545" opacity=".13" clip-path="url(#eqDn)"/>`;
    s += `<path d="${line}" fill="none" stroke="#14925f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#eqUp)"/>`;
    s += `<path d="${line}" fill="none" stroke="#d64545" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#eqDn)"/>`;
    const n = stats.curve.length, ticks = Math.min(6, n);
    for (let t = 0; t < ticks; t++) {
      const i = ticks === 1 ? 1 : 1 + Math.round((t * (n - 1)) / (ticks - 1));
      const d = stats.curve[i - 1].date;
      const lab = multiYear
        ? MON[Number(d.slice(5, 7)) - 1] + " " + d.slice(2, 4)
        : Number(d.slice(8, 10)) + " " + MON[Number(d.slice(5, 7)) - 1];
      s += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${t === ticks - 1 && ticks > 1 ? "end" : "middle"}" font-size="8" font-weight="600" fill="#8a93ad">${lab}</text>`;
    }
    return s + "</svg>";
  })();

  // ----- drawdown (how far below the previous peak the account was) -----
  const drawdown = (() => {
    const W = 330, H = 118, PL = 40, PR = 8, PT = 10, PB = 10;
    let peak = 0;
    const dd = [0, ...stats.curve.map((p) => { peak = Math.max(peak, p.cum); return p.cum - peak; })];
    const min = Math.min(...dd, -1);
    const x = (i) => PL + (i / (dd.length - 1)) * (W - PL - PR);
    const y = (v) => PT + (v / min) * (H - PT - PB);
    const line = dd.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(dd.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    s += `<line x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}" stroke="#9aa4bd"/>`;
    s += `<line x1="${PL}" x2="${W - PR}" y1="${y(min)}" y2="${y(min)}" stroke="#e9ecf3" stroke-dasharray="3 3"/>`;
    s += `<text x="${PL - 6}" y="${y(0) + 3}" text-anchor="end" font-size="8.5" font-weight="600" fill="#8a93ad">${currency}0</text>`;
    s += `<text x="${PL - 6}" y="${y(min) + 3}" text-anchor="end" font-size="8.5" font-weight="600" fill="#d64545">${cmp(min)}</text>`;
    s += `<path d="${area}" fill="#d64545" opacity=".22"/><path d="${line}" fill="none" stroke="#d64545" stroke-width="1.6" stroke-linejoin="round"/>`;
    return s + "</svg>";
  })();

  // ----- P&L histogram: one bar per trading day, or per month once the period is long -----
  const histMonthly = days.length > 40;
  const hist = (() => {
    const W = 208, H = 128, PX = 4, PT = 10, PB = 16;
    const multiMonth = monthKeys.length > 1;
    const bars = histMonthly
      ? monthRows.map((r) => ({ v: r.s.net, label: MON[Number(r.key.slice(5, 7)) - 1] + (multiYear ? " " + r.key.slice(2, 4) : "") }))
      : days.map((d) => ({ v: d.net || 0, label: multiMonth ? Number(d.date.slice(8, 10)) + "/" + Number(d.date.slice(5, 7)) : String(Number(d.date.slice(8, 10))) }));
    const maxPos = Math.max(0, ...bars.map((b) => b.v)), maxNeg = Math.max(0, ...bars.map((b) => -b.v));
    const range = maxPos + maxNeg || 1;
    const plotH = H - PT - PB, k = plotH / range, zeroY = PT + plotH * (maxPos / range);
    const slot = (W - 2 * PX) / bars.length, bw = Math.max(2, Math.min(18, slot * 0.66));
    const step = Math.ceil(bars.length / 6);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    s += `<line x1="${PX}" x2="${W - PX}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#9aa4bd"/>`;
    bars.forEach((b, i) => {
      const cx = PX + i * slot + slot / 2;
      const h = Math.max(2, Math.abs(b.v) * k);
      s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(b.v >= 0 ? zeroY - h : zeroY).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${b.v >= 0 ? "#14925f" : "#d64545"}"/>`;
      if (i % step === 0) s += `<text x="${cx.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="7.5" font-weight="600" fill="#8a93ad">${b.label}</text>`;
    });
    const avg = bars.reduce((a, b) => a + b.v, 0) / bars.length;
    const ay = zeroY - avg * k;
    s += `<line x1="${PX}" x2="${W - PX}" y1="${ay.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#c99f48" stroke-dasharray="4 3" stroke-width="1.3"/><text x="${W - PX}" y="${(ay - 3).toFixed(1)}" text-anchor="end" font-size="7.5" font-weight="800" fill="#b08a2e">avg ${sg(avg)}</text>`;
    return s + "</svg>";
  })();

  // ----- trade outcomes donut -----
  const donut = (() => {
    const w = stats.wins, l = stats.losses, b = stats.be, t = w + l + b;
    const r = 38, c = 2 * Math.PI * r;
    let off = 0;
    let s = `<svg viewBox="0 0 100 100" width="104" height="104"><circle cx="50" cy="50" r="${r}" fill="none" stroke="#eceff5" stroke-width="12"/>`;
    [[w, "#14925f"], [l, "#d64545"], [b, "#e2a93b"]].forEach(([v, col]) => {
      if (!v || !t) return;
      const len = (v / t) * c;
      s += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
      off += len;
    });
    s += `<text x="50" y="49" text-anchor="middle" font-size="17" font-weight="800" fill="#0a1028">${pct(stats.winRate)}</text><text x="50" y="61" text-anchor="middle" font-size="6.5" font-weight="700" fill="#8a93ad" letter-spacing=".8">WIN RATE</text></svg>`;
    return s;
  })();

  // ----- week of the month -----
  const weeksSvg = (() => {
    const rows = weekData.rows;
    const W = 208, H = 122, PT = 16, PB = 26;
    const maxPos = Math.max(0, ...rows.map((r) => r.net)), maxNeg = Math.max(0, ...rows.map((r) => -r.net));
    const range = maxPos + maxNeg || 1;
    const plotTop = PT + (maxPos > 0 ? 8 : 0), plotBottom = H - PB - (maxNeg > 0 ? 8 : 0);
    const k = (plotBottom - plotTop) / range, zeroY = plotTop + (plotBottom - plotTop) * (maxPos / range);
    const slot = W / rows.length, bw = 26;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="4" x2="${W - 4}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#9aa4bd"/>`;
    rows.forEach((r, i) => {
      const cx = i * slot + slot / 2;
      const up = r.net >= 0;
      const isBest = weekData.best && weekData.best.id === r.id;
      if (r.n > 0) {
        const h = Math.max(3, Math.abs(r.net) * k), yy = up ? zeroY - h : zeroY;
        s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="4" fill="${up ? "#14925f" : "#d64545"}"${isBest ? ' stroke="#c99f48" stroke-width="2"' : ""}/>`;
        s += `<text x="${cx.toFixed(1)}" y="${(up ? yy - 4 : yy + h + 10).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800" fill="${up ? "#14925f" : "#d64545"}">${sg(r.net)}</text>`;
      }
      s += `<text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="9" font-weight="800" fill="#10193a">W${i + 1}</text><text x="${cx.toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="7" font-weight="600" fill="#8a93ad">${r.span}</text>`;
    });
    return s + "</svg>";
  })();

  // ----- P&L by trading block -----
  const blocksSvg = (() => {
    if (!timeData.counted) return "<div class='mt'>No timed trades in this period</div>";
    const W = 278, rowH = 22, L = 52, R = 56;
    const cx = L + (W - L - R) / 2, half = (W - L - R) / 2 - 2;
    const mx = Math.max(1, ...timeData.blocks.map((b) => Math.abs(b.net)));
    let s = `<svg viewBox="0 0 ${W} ${timeData.blocks.length * rowH + 4}" width="100%"><line x1="${cx}" x2="${cx}" y1="0" y2="${timeData.blocks.length * rowH + 4}" stroke="#c4cada"/>`;
    timeData.blocks.forEach((b, i) => {
      const y = i * rowH + 3;
      s += `<text x="0" y="${y + 13}" font-size="8.5" font-weight="700" fill="#10193a">${esc(b.short)}</text>`;
      if (b.trades) {
        const w = (Math.abs(b.net) / mx) * half;
        s += `<rect x="${(b.net >= 0 ? cx : cx - w).toFixed(1)}" y="${y + 3}" width="${Math.max(2, w).toFixed(1)}" height="11" rx="3" fill="${b.net >= 0 ? "#14925f" : "#d64545"}"/>`;
        s += `<text x="${W}" y="${y + 13}" text-anchor="end" font-size="9" font-weight="800" fill="${b.net >= 0 ? "#14925f" : "#d64545"}">${sg(b.net)}</text>`;
      } else {
        s += `<text x="${W}" y="${y + 13}" text-anchor="end" font-size="9" fill="#9aa4bd">—</text>`;
      }
    });
    return s + "</svg>";
  })();

  // ----- risk & discipline strip -----
  const gauge = (v, col) => {
    const r = 15, c = 2 * Math.PI * r, f = v == null ? 0 : Math.max(0, Math.min(100, v)) / 100;
    return `<svg viewBox="0 0 40 40" width="38" height="38" style="flex:none"><circle cx="20" cy="20" r="${r}" fill="none" stroke="#e3e7f0" stroke-width="5"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 20 20)"/></svg>`;
  };
  const gcell = (v, col, label) => `<div class="gc">${gauge(v, col)}<div><div class="gv">${pct(v)}</div><div class="gl">${label}</div></div></div>`;
  const tcell = (label, val, c, sub) => `<div class="gc"><div><div class="gl">${label}</div><div class="gv ${c || ""}">${val}</div><div class="gs">${sub || "&nbsp;"}</div></div></div>`;
  const strip =
    gcell(stats.greenRate, "#14925f", "Green days") +
    gcell(stats.onTimeRate, "#25356a", "On-time stops") +
    gcell(stats.floorRate, "#c99f48", "Floor held") +
    tcell("Payoff ratio", stats.payoff == null ? "—" : stats.payoff.toFixed(2), "", stats.avgWin != null && stats.avgLoss != null ? `${cmp(stats.avgWin)} / ${cmp(stats.avgLoss)}` : "") +
    tcell("Best day", stats.bestDay ? sg(stats.bestDay.net) : "—", stats.bestDay ? tone(stats.bestDay.net) : "", stats.bestDay ? fmtDate(stats.bestDay.date, true) : "") +
    tcell("Worst day", stats.worstDay ? sg(stats.worstDay.net) : "—", stats.worstDay ? tone(stats.worstDay.net) : "", stats.worstDay ? fmtDate(stats.worstDay.date, true) : "");

  // ----- shared page furniture -----
  const disclaimer = `<div class="disc"><b>Important notice.</b> Figures are based on ${stats.trades} trades over ${stats.n} trading ${dayWord} and are self-reported and unaudited. Trades within ±${money(BE_LIMIT)} are treated as break-even. Win rate = wins ÷ (wins + losses). Past performance is not indicative of future results, and trading carries a significant risk of loss.</div>`;
  const head = `<div class="hd"><div><div class="k">${esc(TRADER_NAME.toUpperCase())}</div><h1>Trading Performance Report</h1></div><div class="r"><div class="k">REPORTING PERIOD</div><div class="p">${esc(period)}</div></div></div>`;
  const runHead = `<div class="rh"><b>${esc(TRADER_NAME)}</b><span>Trading Performance Report</span><span>${esc(period)}</span></div>`;
  const foot = (i) => `<div class="ft"><span>${esc(TRADER_NAME)} · Confidential</span><span>Generated ${generated}</span><b>PAGE ${i} OF ${totalPages}</b></div>`;

  // ----- page 1 -----
  const page1 = `<div class="page">
  ${head}
  <div class="body">
    <div class="sum"><div class="ct"><b>Executive summary</b></div><p>${esc(summary)}</p></div>
    <div class="tiles">${tiles}</div>
    <div class="card"><div class="ct"><b>Equity curve</b><span>cumulative net result</span></div>${equity}</div>
    <div class="row mid">
      <div class="card"><div class="ct"><b>Trade outcomes</b></div>
        <div class="dn">${donut}<div class="lg"><div style="--c:#14925f"><b>${stats.wins}</b><span>Wins</span></div><div style="--c:#d64545"><b>${stats.losses}</b><span>Losses</span></div><div style="--c:#e2a93b"><b>${stats.be}</b><span>Even</span></div></div></div>
      </div>
      <div class="card"><div class="ct"><b>${histMonthly ? "Monthly" : "Daily"} P&amp;L</b></div>${hist}</div>
      <div class="card"><div class="ct"><b>Week of month</b></div>${weekData.active ? weeksSvg : '<div class="mt">No data yet</div>'}</div>
    </div>
    <div class="row low">
      <div class="card"><div class="ct"><b>Drawdown</b><span>below previous peak</span></div>${drawdown}</div>
      <div class="card"><div class="ct"><b>P&amp;L by trading block</b></div>${blocksSvg}</div>
    </div>
    <div><div class="ct"><b>Risk &amp; discipline</b></div><div class="strip">${strip}</div></div>
    ${totalPages === 1 ? disclaimer : ""}
  </div>
  ${foot(1)}
</div>`;

  // ----- extra pages: monthly returns (only when the period spans more than one month) -----
  const tablePages = tableChunks.map((rows, ci) => {
    const isLast = ci === tableChunks.length - 1;
    const body = rows.map(({ key, s }) =>
      `<tr><td>${MON[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}</td><td>${s.n}</td><td>${s.trades}</td><td class="${tone(s.net)}">${fmt(s.net)}</td><td>${pct(s.winRate)}</td><td>${pfx(s.pf)}</td><td>${s.maxDD > 0 ? "−" + money(s.maxDD) : money(0)}</td></tr>`
    ).join("");
    const totals = isLast
      ? `<tfoot><tr><td>Total</td><td>${stats.n}</td><td>${stats.trades}</td><td class="${tone(stats.net)}">${fmt(stats.net)}</td><td>${pct(stats.winRate)}</td><td>${pfx(stats.pf)}</td><td>${stats.maxDD > 0 ? "−" + money(stats.maxDD) : money(0)}</td></tr></tfoot>`
      : "";
    return `<div class="page">
  ${runHead}
  <div class="body">
    <div class="card">
      <div class="ct"><b>Monthly returns</b><span>${esc(period)}</span></div>
      <table class="mtab">
        <thead><tr><th>Month</th><th>Days</th><th>Trades</th><th>Net result</th><th>Win rate</th><th>Profit factor</th><th>Max drawdown</th></tr></thead>
        <tbody>${body}</tbody>${totals}
      </table>
    </div>
    ${isLast ? disclaimer : ""}
  </div>
  ${foot(ci + 2)}
</div>`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(TRADER_NAME)} – Trading Performance Report</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"><style>${REPORT_CSS}</style></head><body>
${page1}
${tablePages}
</body></html>`;
}

function downloadHTML(html, filename) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// prints on a hidden A4-sized frame so the page lays out as one sheet
function printHTML(html) {
const f = document.createElement("iframe");
f.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
document.body.appendChild(f);
const doc = f.contentWindow.document;
doc.open();
doc.write(html);
doc.close();
setTimeout(() => {
f.contentWindow.focus();
f.contentWindow.print();
setTimeout(() => f.remove(), 2500);
}, 900);
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

function WeekChart({ rows, fmt }) {
  if (!rows.length) return null;

  const W = 480, H = 220, PX = 16;
  const TOP = 12;          // space above the tallest positive value label
  const LABEL = 20;        // room reserved for a value label above/below a bar
  const AXIS_BAND = 40;    // fixed band at the bottom for "Week N / days x–y"

  const maxPos = Math.max(0, ...rows.map((r) => r.net));
  const maxNeg = Math.max(0, ...rows.map((r) => -r.net));
  const range = maxPos + maxNeg || 1;

  // bars live strictly between plotTop and plotBottom; labels get their own padding
  const plotTop = TOP + (maxPos > 0 ? LABEL : 0);
  const plotBottom = H - AXIS_BAND - (maxNeg > 0 ? LABEL : 0);
  const plotH = Math.max(30, plotBottom - plotTop);
  const k = plotH / range;
  const zeroY = plotTop + plotH * (maxPos / range);

  const slot = (W - 2 * PX) / rows.length;
  const bw = Math.min(64, slot * 0.56);
  const axisY = H - AXIS_BAND + 16;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Total profit and loss for each week of the month" style={{ display: "block" }}>
      <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} style={{ stroke: "var(--border)" }} strokeDasharray="3 4" />
      {rows.map((r, i) => {
        const cx = PX + i * slot + slot / 2;
        const up = r.net >= 0;
        const h = r.n ? Math.max(3, Math.abs(r.net) * k) : 0;
        const y = up ? zeroY - h : zeroY;
        const labelY = up ? y - 6 : y + h + 13;

        return (
          <g key={r.id || r.label}>
            <title>{`${r.label} (days ${r.span}) · ${r.n} day${r.n === 1 ? "" : "s"} · ${fmt(r.net)}`}</title>
            {r.n > 0 ? (
              <>
                <rect x={cx - bw / 2} y={y} width={bw} height={h} rx="8" style={{ fill: up ? "var(--teal)" : "var(--rose)", opacity: 0.9 }} />
                <text x={cx} y={labelY} textAnchor="middle" style={{ fill: up ? "var(--teal)" : "var(--rose)", fontSize: "11px", fontWeight: 800 }}>{fmt(r.net)}</text>
              </>
            ) : (
              <circle cx={cx} cy={zeroY} r="2.5" style={{ fill: "var(--muted)", opacity: 0.4 }} />
            )}
            <text x={cx} y={axisY} textAnchor="middle" style={{ fill: "var(--text)", fontSize: "11.5px", fontWeight: 700 }}>{r.label}</text>
            <text x={cx} y={axisY + 14} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: "9.5px", fontWeight: 600 }}>{`days ${r.span}`}</text>
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
  const [weekScope, setWeekScope] = useState("year"); // "year" | "all" (for week-of-month)
  const [theme, setTheme] = useState(readTheme);
  const [reportOpen, setReportOpen] = useState(false);
  const [periodId, setPeriodId] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });

  useEffect(() => {
    if (!reportOpen) return;
    const close = (e) => { if (!e.target.closest(".pf-dl-wrap")) setReportOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [reportOpen]);

  // refresh when the tab regains focus or another tab writes to storage
  // (also re-reads the theme so it stays in sync with Session)
  useEffect(() => {
    const bump = () => {
      setTick((t) => t + 1);
      setTheme(readTheme());
    };
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

  const yearKey = monthKey.slice(0, 4);
  const weekEntries = useMemo(
    () => (weekScope === "year" ? entries.filter((e) => e.date.startsWith(yearKey)) : entries),
    [weekScope, entries, yearKey]
  );
  const weekData = useMemo(() => analyseWeeks(weekEntries), [weekEntries]);
  const weekInsights = useMemo(() => buildWeekInsights(weekData, fmt), [weekData, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareText = (r) =>
    r.share == null ? "\u2014" : (r.share < 0 ? "\u2212" : "") + Math.abs(Math.round(r.share)) + "% of profit";

  const idx = months.indexOf(monthKey);
  const olderMonth = idx >= 0 ? months[idx + 1] : undefined;
  const newerMonth = idx > 0 ? months[idx - 1] : undefined;

  // nearest earlier month that actually has data, for "vs last month" deltas
  const prevStats = useMemo(() => {
    const k = months.slice(idx + 1).find((m) => (byMonth[m] || EMPTY).length > 0);
    return k ? { key: k, s: computeStats(byMonth[k]) } : null;
  }, [months, idx, byMonth]);

  const periodOptions = useMemo(() => buildPeriodOptions(entries, monthKey), [entries, monthKey]);
  const reportDays = useMemo(
    () => resolvePeriod(periodId, monthKey, entries, custom),
    [periodId, monthKey, entries, custom]
  );

  const reportPayload = () => ({
    days: reportDays,
    stats: computeStats(reportDays),
    weekData: analyseWeeks(reportDays),
    timeData: analyseTimes(reportDays),
    currency,
  });

  const reportFileName = () => {
    const f = reportDays[0] ? reportDays[0].date : monthKey;
    const l = reportDays.length ? reportDays[reportDays.length - 1].date : monthKey;
    return `${TRADER_NAME.replace(/\s+/g, "-")}_Trading-Performance-Report_${f}_to_${l}.html`;
  };
  const onDownloadReport = () => {
    downloadHTML(buildReportHTML(reportPayload()), reportFileName());
    setReportOpen(false);
  };
  const onPrintReport = () => {
    printHTML(buildReportHTML(reportPayload()));
    setReportOpen(false);
  };

  const targetPct = target > 0 ? Math.max(0, Math.min(100, (stats.net / target) * 100)) : 0;
  const targetMet = target > 0 && stats.net >= target;

  const goBack = () => {
    if (typeof onBack === "function") onBack();
    else if (typeof window !== "undefined") {
      if (window.history.length > 1) window.history.back();
      else window.location.hash = "";
    }
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      window.localStorage.setItem("td_theme", JSON.stringify(next)); // same key Session uses
    } catch (e) {
      /* ignore privacy-mode errors */
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
    <div className="pf-root" data-theme={theme}>
      <style>{CSS}</style>
      <div className="pf-wrap">
        {/* header */}
        <header className="pf-top">
          <div className="pf-head-left">
            <button className="pf-back" onClick={goBack} aria-label="Back to The Session">{"\u2039"} Session</button>
          </div>

          <div className="pf-head-center">
            <h1>Performance</h1>
          </div>

          <div className="pf-head-right">
            <div className="pf-dl-wrap">
              <button
                className="pf-dl"
                onClick={() => setReportOpen((o) => !o)}
                disabled={entries.length === 0}
                aria-haspopup="menu"
                aria-expanded={reportOpen}
                aria-label="Download report"
              >
                Report
              </button>

              {reportOpen && (
                <div className="pf-dl-menu" role="menu" aria-label="Report actions">
                  <div className="pf-rp">
                    <label className="pf-rp-l" htmlFor="pf-period">Report period</label>
                    <select id="pf-period" className="pf-rp-sel" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                      {periodOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    {periodId === "custom" && (
                      <div className="pf-rp-dates">
                        <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                        <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                      </div>
                    )}
                    <div className="pf-rp-meta">
                      {reportDays.length
                        ? `${reportDays.length} trading ${reportDays.length === 1 ? "day" : "days"} included`
                        : "No trading days in this period"}
                    </div>
                  </div>
                  <button type="button" className="pf-dl-item" onClick={onDownloadReport} disabled={!reportDays.length}>
                    <span className="pf-dl-title">Download report</span>
                    <span className="pf-dl-sub">.html file, opens anywhere</span>
                  </button>
                  <button type="button" className="pf-dl-item" onClick={onPrintReport} disabled={!reportDays.length}>
                    <span className="pf-dl-title">Save as PDF</span>
                    <span className="pf-dl-sub">choose "Save as PDF" in the print window</span>
                  </button>
                </div>
              )}
            </div>

            <button className="pf-theme" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
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
            {prevStats && (
              <span className="pf-chip">
                {stats.net >= prevStats.s.net ? "\u25B2" : "\u25BC"} {money(stats.net - prevStats.s.net)} vs {monthLabel(prevStats.key, true).split(" ")[0]}
              </span>
            )}
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

        {/* week of the month */}
        <h2 className="pf-section">Week of the month<span className="pf-sub">which week pays best</span></h2>
        <div className="pf-seg" role="group" aria-label="Week-of-month range">
          <button className={weekScope === "year" ? "on" : ""} onClick={() => setWeekScope("year")}>{yearKey}</button>
          <button className={weekScope === "all" ? "on" : ""} onClick={() => setWeekScope("all")}>All time</button>
        </div>

        {weekData.active === 0 ? (
          <div className="pf-card pf-empty">
            No trading days logged for {weekScope === "year" ? yearKey : "any period"} yet. Each logged day adds to its week of the month here.
          </div>
        ) : (
          <>
            <div className="pf-card"><WeekChart rows={weekData.rows} fmt={fmt} /></div>

            <div className="pf-wk-grid">
              {weekData.rows.map((r) => {
                const isBest = weekData.best && weekData.best.id === r.id;
                const isWorst = weekData.worst && weekData.worst.id === r.id;
                return (
                  <div key={r.id} className={"pf-wk" + (isBest ? " best" : isWorst ? " worst" : "")}>
                    <div className="pf-wk-top">
                      <b>{r.label}</b>
                      {isBest && <span className="pf-tag pos">Best</span>}
                      {isWorst && <span className="pf-tag neg">Worst</span>}
                    </div>
                    <div className="pf-wk-span">Days {r.span}</div>
                    <div className={"pf-wk-net " + tone(r.net)}>{r.n ? fmt(r.net) : "\u2014"}</div>
                    <span className="pf-wk-share">{shareText(r)}</span>
                    <div className="pf-wk-meta">
                      <div><span>Win rate</span><b>{pct(r.s.winRate)}</b></div>
                      <div><span>Green days</span><b>{r.n ? `${r.s.green} of ${r.n}` : "\u2014"}</b></div>
                      <div><span>Avg / day</span><b className={tone(r.avgDay || 0)}>{r.avgDay == null ? "\u2014" : fmt(r.avgDay)}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {weekInsights.length > 0 && (
              <div className="pf-insights">
                {weekInsights.map((it, i) => (
                  <div key={i} className={"pf-insight " + it.tone}>{it.text}</div>
                ))}
              </div>
            )}
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
/* ===== DARK: obsidian navy / champagne gold (matches Session) ===== */
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
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--glow-amber:rgba(232,201,122,.30);
--r-card:26px; --r-input:14px; --r-pill:999px;

padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
box-sizing:border-box; min-height:100vh; position:relative;
background:var(--bg-grad); background-attachment:fixed;
color:var(--text); font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.pf-root[data-theme="light"]{
/* ===== LIGHT: blue glass (unchanged) ===== */
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

/* week of the month */
.pf-wk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}
.pf-wk{position:relative;min-width:0;background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card);border-radius:22px;padding:14px 16px;}
.pf-wk.best{border-color:rgba(11,143,80,.45);box-shadow:var(--shadow-card),0 0 0 3px var(--teal-dim);}
.pf-wk.worst{border-color:rgba(214,60,51,.4);box-shadow:var(--shadow-card),0 0 0 3px var(--rose-dim);}
.pf-wk-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;}
.pf-wk-top b{font-size:14px;font-weight:800;letter-spacing:-.01em;}
.pf-wk-top .pf-tag{position:static;}
.pf-wk-span{font-size:11px;color:var(--muted);margin-top:2px;}
.pf-wk-net{font-size:24px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-top:12px;font-variant-numeric:tabular-nums;}
.pf-wk-share{display:inline-block;margin-top:9px;font-size:11px;font-weight:700;color:var(--accent-text);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-pill);padding:3px 9px;}
.pf-wk-meta{margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:grid;gap:6px;}
.pf-wk-meta div{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11.5px;color:var(--muted);}
.pf-wk-meta b{color:var(--text);font-weight:700;font-variant-numeric:tabular-nums;}
.pf-wk-meta b.pos{color:var(--teal);}
.pf-wk-meta b.neg{color:var(--rose);}

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
  .pf-wk-net{font-size:21px;}
  .pf-wk{padding:12px 13px;}
}

/* ---------- theme toggle ---------- */
.pf-theme{margin-left:auto;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.pf-theme:hover{border-color:var(--amber);color:var(--text);}

/* ---------- dark-only: obsidian & gold details ---------- */
.pf-root:not([data-theme="light"])::after{
  content:""; position:fixed; left:0; right:0; top:0; height:360px; pointer-events:none; z-index:0;
  background-image:
    radial-gradient(520px 200px at 50% -40px,rgba(232,201,122,.14),transparent 70%),
    linear-gradient(rgba(190,205,255,.028) 1px,transparent 1px),
    linear-gradient(90deg,rgba(190,205,255,.028) 1px,transparent 1px);
  background-size:100% 100%,34px 34px,34px 34px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
}
.pf-root:not([data-theme="light"]) .pf-hero{border-color:rgba(232,201,122,.30);}
.pf-root:not([data-theme="light"]) .pf-hero::after{background:radial-gradient(420px 220px at 100% -10%,rgba(232,201,122,.22),transparent 65%);}
.pf-root:not([data-theme="light"]) .pf-top h1{
  background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
}
.pf-root:not([data-theme="light"]) .pf-bfill.pos{background:linear-gradient(90deg,rgba(52,224,161,.35),var(--teal));}
.pf-root:not([data-theme="light"]) .pf-bfill.neg{background:linear-gradient(270deg,rgba(255,107,125,.35),var(--rose));}
.pf-root:not([data-theme="light"]) .pf-wk.best{border-color:rgba(52,224,161,.45);}
.pf-root:not([data-theme="light"]) .pf-wk.worst{border-color:rgba(255,107,125,.4);}
.pf-root:not([data-theme="light"]) .pf-mchip.on,
.pf-root:not([data-theme="light"]) .pf-seg button.on{box-shadow:0 8px 18px -8px rgba(232,201,122,.5);}

/* ---------- centered header + section titles ---------- */
.pf-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;}
.pf-top h1{text-align:center;white-space:nowrap;font-size:clamp(20px,5.6vw,30px);padding:0 .14em;letter-spacing:-.02em;}
.pf-back{justify-self:start;}
.pf-top-r{justify-self:end;display:flex;align-items:center;gap:6px;}
.pf-theme{margin-left:0;padding:7px 11px;}
.pf-section{flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;}
.pf-sub{text-align:center;}

/* ---------- report button + menu ---------- */
.pf-dl-wrap{position:relative;}
.pf-dl{display:inline-flex;align-items:center;gap:6px;border:none;background:var(--btn);color:var(--on-accent);border-radius:var(--r-pill);padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 8px 18px -8px var(--glow-amber);transition:transform .15s ease,opacity .15s ease;}
.pf-dl:active{transform:scale(.97);}
.pf-dl:disabled{opacity:.4;cursor:default;box-shadow:none;}
.pf-dl-menu{position:absolute;right:0;top:calc(100% + 10px);z-index:50;width:min(260px,calc(100vw - 36px));padding:8px;border-radius:20px;background:var(--modal-bg);border:1px solid var(--border);box-shadow:var(--shadow-card);animation:pf-menu-in .18s cubic-bezier(.2,.9,.3,1);transform-origin:top right;}
.pf-dl-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:var(--text);padding:11px 14px;border-radius:14px;cursor:pointer;}
.pf-dl-menu button:hover,.pf-dl-menu button:focus-visible{background:var(--surface-2);outline:none;}
.pf-dl-menu b{display:block;font-size:13.5px;font-weight:700;}
.pf-dl-menu span{display:block;font-size:11px;color:var(--muted);margin-top:2px;}
@keyframes pf-menu-in{from{opacity:0;transform:translateY(-6px) scale(.97);}to{opacity:1;transform:none;}}

@media (max-width:420px){
  .pf-dl span{display:none;}
  .pf-dl{padding:9px 11px;}
  .pf-back{padding:7px 10px;}
}
.pf-dl-menu{width:min(290px,calc(100vw - 36px));}
.pf-rp{padding:10px 12px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;}
.pf-rp-l{display:block;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.pf-rp-sel,.pf-rp-dates input{width:100%;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:9px 10px;font:inherit;font-size:12.5px;font-weight:600;}
.pf-rp-dates{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;}
.pf-rp-meta{font-size:11px;color:var(--muted);margin-top:8px;}
.pf-dl-menu button:disabled{opacity:.4;cursor:default;}
.pf-dl-menu .pf-dl-title{font-size:13.5px;font-weight:700;color:var(--text);margin-top:0;}
@media (prefers-reduced-motion:reduce){.pf-dl-menu{animation:none;}}
`;