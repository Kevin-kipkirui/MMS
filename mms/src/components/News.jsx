import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

/**
 * <News />
 * Market news + economic events, grouped by time and sorted by impact.
 *
 * Frontend-first: renders static MOCK_NEWS until you pass real data.
 *
 *   <News />                                   // static demo data
 *   <News items={apiItems} loading={isLoading} error={err} onRefresh={refetch} />
 *
 * Item shape (everything except title + time is optional):
 *   {
 *     id, title, summary, source, category,
 *     time,                       // ISO string (also accepts publishedAt / date)
 *     impact,                     // "high" | "medium" | "low" (see normalizeImpact for accepted API values)
 *     symbols: ["USD", "XAU"],    // also accepts currencies
 *     actual, forecast, previous, // strings, shown as a data row when present
 *     url,
 *   }
 *
 * Theme: follows the app's "td_theme" localStorage key, or pass theme="light" | "dark".
 * Set embedded to drop the page background when you mount it inside another screen.
 */

// ---------- impact ----------
const IMPACT = {
  high: { label: "High", rule: "Stand aside" },
  medium: { label: "Medium", rule: "Half size" },
  low: { label: "Low", rule: "Trade as normal" },
};
const IMPACT_ORDER = ["high", "medium", "low"];

/** Map whatever your API sends ("High", 3, "red", "med"...) to high | medium | low. */
export function normalizeImpact(raw) {
  if (raw == null) return "low";
  const v = String(raw).trim().toLowerCase();
  if (["high", "h", "3", "red", "high impact"].includes(v)) return "high";
  if (["medium", "med", "m", "2", "orange", "moderate", "medium impact"].includes(v)) return "medium";
  return "low";
}

/** Normalise one API record into the shape the UI uses. */
function normalizeItem(raw, idx) {
  const time = raw.time || raw.publishedAt || raw.date || null;
  return {
    id: raw.id != null ? String(raw.id) : "item-" + idx,
    title: raw.title || raw.headline || "Untitled",
    summary: raw.summary || raw.description || "",
    source: raw.source || "",
    category: raw.category || "General",
    time,
    impact: normalizeImpact(raw.impact),
    symbols: raw.symbols || raw.currencies || [],
    country: raw.country || raw.countryCode || null,
    actual: raw.actual != null ? String(raw.actual) : null,
    forecast: raw.forecast != null ? String(raw.forecast) : null,
    previous: raw.previous != null ? String(raw.previous) : null,
    url: raw.url || null,
  };
}

// ---------- static demo data (times are relative to page load so it always looks fresh) ----------
const at = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

const MOCK_NEWS = [
  {
    id: "m1",
    title: "US Non-Farm Payrolls",
    summary:
      "Monthly change in US jobs outside of farming. A large beat or miss against forecast usually moves the dollar and gold within seconds, then retraces.",
    source: "Economic calendar",
    category: "Economy",
    time: at(42),
    impact: "high",
    symbols: ["USD", "XAU", "US500"],
    forecast: "185K",
    previous: "142K",
  },
  {
    id: "m2",
    title: "Fed's Waller speaks on the policy outlook",
    summary: "Prepared remarks followed by Q&A. Tone on the rate path matters more than the headline.",
    source: "Economic calendar",
    category: "Central banks",
    time: at(135),
    impact: "medium",
    symbols: ["USD"],
  },
  {
    id: "m3",
    title: "ECB President Lagarde speaks",
    summary: "Press conference after the policy meeting. Expect volatility on any change in language about inflation.",
    source: "Economic calendar",
    category: "Central banks",
    time: at(185),
    impact: "medium",
    symbols: ["EUR"],
  },
  {
    id: "m4",
    title: "EIA crude oil inventories",
    summary: "Weekly change in US crude stockpiles. A draw larger than forecast is read as supportive for oil.",
    source: "Economic calendar",
    category: "Commodities",
    time: at(300),
    impact: "medium",
    symbols: ["USOIL"],
    forecast: "-1.2M",
    previous: "3.9M",
  },
  {
    id: "m5",
    title: "UK CPI y/y",
    summary: "Inflation came in above forecast, keeping pressure on the Bank of England to hold rates higher for longer.",
    source: "Economic calendar",
    category: "Economy",
    time: at(-28),
    impact: "high",
    symbols: ["GBP"],
    actual: "3.4%",
    forecast: "3.2%",
    previous: "3.1%",
  },
  {
    id: "m6",
    title: "Gold steadies near highs ahead of jobs data",
    summary: "Traders are keeping positions light before payrolls. Thin liquidity into the release.",
    source: "Market wire",
    category: "Commodities",
    time: at(-14),
    impact: "low",
    symbols: ["XAU"],
    url: "#",
  },
  {
    id: "m7",
    title: "Bitcoin ETF flows turn positive after three days of outflows",
    summary: "Net inflows returned on Tuesday, led by the largest spot funds.",
    source: "Market wire",
    category: "Crypto",
    time: at(-55),
    impact: "low",
    symbols: ["BTC"],
    url: "#",
  },
  {
    id: "m8",
    title: "Bank of Japan holds rates, keeps guidance unchanged",
    summary: "The decision was in line with expectations. Yen moved little in the first minutes after the statement.",
    source: "Market wire",
    category: "Central banks",
    time: at(-190),
    impact: "high",
    symbols: ["JPY"],
    url: "#",
  },
  {
    id: "m9",
    title: "Eurozone retail sales m/m",
    summary: "Spending grew modestly, in line with the slow-recovery story.",
    source: "Economic calendar",
    category: "Economy",
    time: at(-260),
    impact: "medium",
    symbols: ["EUR"],
    actual: "0.3%",
    forecast: "0.2%",
    previous: "-0.1%",
  },
  {
    id: "m10",
    title: "Tesla earnings preview: what options markets are pricing",
    summary: "Implied move sits near seven percent. Deliveries and margin guidance are the focus.",
    source: "Market wire",
    category: "Earnings",
    time: at(-330),
    impact: "low",
    symbols: ["TSLA"],
    url: "#",
  },
  {
    id: "m11",
    title: "Australia employment change",
    summary: "Jobs added beat forecast and the unemployment rate held, lifting the Australian dollar.",
    source: "Economic calendar",
    category: "Economy",
    time: at(-1600),
    impact: "high",
    symbols: ["AUD"],
    actual: "32K",
    forecast: "25K",
    previous: "18K",
  },
  {
    id: "m12",
    title: "US ISM services PMI",
    summary: "Activity stayed in expansion territory. Prices paid ticked up.",
    source: "Economic calendar",
    category: "Economy",
    time: at(-1700),
    impact: "medium",
    symbols: ["USD"],
    actual: "52.4",
    forecast: "52.0",
    previous: "51.6",
  },
];

// ---------- time helpers ----------
const ts = (iso) => new Date(iso).getTime();

function clockTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function relTime(iso, nowMs) {
  const diff = Math.round((ts(iso) - nowMs) / 60000);
  const abs = Math.abs(diff);
  if (abs < 1) return "Now";
  let txt;
  if (abs < 60) txt = abs + "m";
  else if (abs < 1440) txt = Math.floor(abs / 60) + "h" + (abs % 60 ? " " + (abs % 60) + "m" : "");
  else txt = Math.floor(abs / 1440) + "d";
  return diff > 0 ? "in " + txt : txt + " ago";
}

function groupOf(iso, nowMs) {
  const t = ts(iso);
  if (t > nowMs) return "Upcoming";
  const startToday = new Date(nowMs);
  startToday.setHours(0, 0, 0, 0);
  if (t >= startToday.getTime()) return "Earlier today";
  if (t >= startToday.getTime() - 86400000) return "Yesterday";
  return "Older";
}
const GROUP_ORDER = ["Upcoming", "Earlier today", "Yesterday", "Older"];

// ---------- calendar helpers ----------
const SYMBOL_PRIORITY = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY", "XAU", "USOIL", "US500", "BTC"];

// ---------- flags + header helpers ----------
export const FLAG_CODE = {
USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", AUD: "au", NZD: "nz", CAD: "ca",
CHF: "ch", CNY: "cn", INR: "in", ZAR: "za", MXN: "mx", SEK: "se", NOK: "no",
SGD: "sg", HKD: "hk", KES: "ke", TRY: "tr", BRL: "br", KRW: "kr",
};
export const flagUrl = (code) => "https://flagcdn.com/w80/" + code + ".png";

/** item.country (e.g. "de") wins, otherwise the first currency we know a flag for. */
export function flagCodeFor(item) {
if (item.country) return String(item.country).toLowerCase();
for (const s of item.symbols) if (FLAG_CODE[s]) return FLAG_CODE[s];
return null;
}

function weekRange(nowMs) {
const d = new Date(nowMs);
const mon = new Date(d);
mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
const fri = new Date(mon);
fri.setDate(mon.getDate() + 4);
return (
mon.toLocaleDateString("en-GB", { day: "numeric" }) + " – " +
fri.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
);
}

function tzLabel() {
const off = -new Date().getTimezoneOffset() / 60;
return "UTC" + (off >= 0 ? "+" : "") + off;
}

function dayKey(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dayLabel(iso, nowMs) {
  const base = new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const k = dayKey(iso);
  const t = new Date(nowMs);
  const tm = new Date(nowMs); tm.setDate(tm.getDate() + 1);
  const yd = new Date(nowMs); yd.setDate(yd.getDate() - 1);
  if (k === dayKey(t.toISOString())) return "Today · " + base;
  if (k === dayKey(tm.toISOString())) return "Tomorrow · " + base;
  if (k === dayKey(yd.toISOString())) return "Yesterday · " + base;
  return base;
}

/** Fetches one endpoint, refreshes on an interval, only runs while `enabled`. */
export function useFeed(endpoint, enabled, intervalMs) {
  const [state, setState] = useState({ items: null, loading: true, error: null, updatedAt: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.items === null, error: null }));
    try {
      const res = await fetch(endpoint);
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON response */ }
      if (!res.ok) throw new Error((data && data.error) || "Request failed (" + res.status + ")");
      setState({
        items: Array.isArray(data.items) ? data.items : [],
        loading: false,
        error: null,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Network error" }));
    }
  }, [endpoint]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [enabled, load, intervalMs]);

  return { ...state, reload: load };
}

function readTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    const v = JSON.parse(window.localStorage.getItem("td_theme"));
    return v === "light" || v === "dark" ? v : "dark";
  } catch (e) {
    return "dark";
  }
}

// ---------- small presentational pieces ----------
function Chevron({ open }) {
  return (
    <svg
      className={"nw-chev" + (open ? " open" : "")}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Flag({ code, label, size = 30 }) {
  const [bad, setBad] = useState(false);
  if (!code || bad) {
    return (
      <span className="nw-flag nw-flag-fb" style={{ width: size, height: size }}>
        {(label || "•").slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      className="nw-flag"
      src={flagUrl(code)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBad(true)}
    />
  );
}

/** options: [{ value, label, flag?, symbol?, dot?, count? }] */
function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];
  const body = (o) => (
    <>
      {o.dot && <i className={"nw-dot nw-i-" + o.dot} />}
      {o.flag && <Flag code={o.flag} label={o.label} size={18} />}
      {o.symbol && <span className="nw-dd-symbol">{o.symbol}</span>}
      {o.label}
      {o.count != null && <span className="nw-dd-count">{o.count}</span>}
    </>
  );

  return (
    <div className={"nw-dd" + (open ? " open" : "")} ref={ref}>
      {label && <span className="nw-dd-label">{label}</span>}
      <button type="button" className="nw-dd-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {body({ ...current, count: null })}
      </button>

      {open && (
        <div className="nw-dd-menu" role="listbox" aria-label={label || "Options"}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className="nw-dd-opt"
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {body(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCard({ item, open, onToggle, now, past }) {
  const meta = IMPACT[item.impact];
  const level = item.impact === "high" ? 3 : item.impact === "medium" ? 2 : 1;
  const minsAway = Math.round((ts(item.time) - now) / 60000);
  const soon = minsAway > 0 && minsAway <= 30 && item.impact === "high";
  const hasData = item.actual || item.forecast || item.previous;
  const code = flagCodeFor(item);

  return (
    <article className={`nw-item nw-i-${item.impact}${open ? " open" : ""}${soon ? " soon" : ""}${past ? " past" : ""}`}>
      <button
        type="button"
        className="nw-item-head"
        aria-expanded={open}
        aria-controls={"nw-detail-" + item.id}
        onClick={onToggle}
      >
        <span className="nw-time">
          <strong>{clockTime(item.time)}</strong>
          <span>{relTime(item.time, now)}</span>
        </span>

        <Flag code={code} label={item.symbols[0]} />

        <span className="nw-main">
          <span className="nw-title">{item.title}</span>
          <span className="nw-meta">
            {item.symbols[0] && <span className="nw-ccy">{item.symbols[0]}</span>}
            <span className="nw-cat">{item.category}</span>
            {item.source && <span>{item.source}</span>}
          </span>
        </span>

        <span className="nw-nums">
          <span className={item.actual ? "has-actual" : ""}>{item.actual || "–"}</span>
          <span>{item.forecast || "–"}</span>
          <span>{item.previous || "–"}</span>
        </span>

        <span className="nw-side">
          <span className="nw-imp" title={meta.label + " impact"}>
            <span className="nw-bars" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <b key={n} className={n <= level ? "on" : ""} />
              ))}
            </span>
            <span className="nw-imp-label">{meta.label}</span>
          </span>
          <Chevron open={open} />
        </span>
      </button>

      <div className={"nw-detail" + (open ? " open" : "")} id={"nw-detail-" + item.id} aria-hidden={!open}>
        <div className="nw-detail-inner">
          <div className="nw-body">
            {item.summary && <p className="nw-summary">{item.summary}</p>}

            {hasData && (
              <dl className="nw-data">
                <div className={item.actual ? "has-actual" : ""}>
                  <dt>Actual</dt>
                  <dd>{item.actual || (past ? "n/a" : "Pending")}</dd>
                </div>
                <div>
                  <dt>Forecast</dt>
                  <dd>{item.forecast || "n/a"}</dd>
                </div>
                <div>
                  <dt>Previous</dt>
                  <dd>{item.previous || "n/a"}</dd>
                </div>
              </dl>
            )}

            <div className="nw-foot">
              <div className="nw-syms">
                {item.symbols.map((s) => (
                  <span className="nw-sym" key={s}>{s}</span>
                ))}
              </div>
              <div className="nw-rule">
                Playbook: <strong>{meta.rule}</strong>
              </div>
            </div>

            {item.url && (
              <a className="nw-link" href={item.url} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
                Read the full story
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Skeleton() {
  return (
    <div className="nw-list" aria-busy="true" aria-label="Loading news">
      {[0, 1, 2, 3].map((i) => (
        <div className="nw-skel" key={i} />
      ))}
    </div>
  );
}

// ---------- component ----------
export default function News({
  items: itemsProp,
  loading: loadingProp = false,
  error: errorProp = null,
  onRefresh: onRefreshProp,
  onSelect,
  updatedAt: updatedAtProp,
  theme: themeProp,
  embedded = false,
  onBack,
}) {
  const [storedTheme, setStoredTheme] = useState(readTheme);
  const [impactFilter, setImpactFilter] = useState("all");
  const [category, setCategory] = useState("All");
  const [openId, setOpenId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());

  // ---- live data (used when the parent doesn't pass `items`) ----
  const useRemote = itemsProp === undefined;
  const [view, setView] = useState("calendar"); // "calendar" | "news"
  const [symbol, setSymbol] = useState("All");
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  // Each feed only loads while its tab is open (saves your Marketaux quota)
  const cal = useFeed("/api/economic-calendar", useRemote && view === "calendar", 15 * 60 * 1000);
  const news = useFeed("/api/economic-data", useRemote && view === "news", 30 * 60 * 1000);
  const feed = view === "calendar" ? cal : news;
  const isCalendar = useRemote && view === "calendar";

  const items = useRemote ? feed.items || [] : itemsProp;
  const loading = useRemote ? feed.loading && feed.items === null : loadingProp;
  const error = useRemote ? (feed.items && feed.items.length ? null : feed.error) : errorProp;
  const updatedAt = useRemote ? feed.updatedAt : updatedAtProp;
  const onRefresh = useRemote ? feed.reload : onRefreshProp;

  const switchView = (v) => {
    setView(v);
    setSymbol("All");
    setCategory("All");
    setImpactFilter("all");
    setOpenId(null);
  };

  useEffect(() => {
    const sync = () => setStoredTheme(readTheme());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const theme = themeProp || storedTheme;

  const list = useMemo(() => {
    const source = items || [];
    return source.map(normalizeItem).filter((i) => i.time && !isNaN(ts(i.time)));
  }, [items]);

  // currency / market chips, majors first, then by frequency
  const symbolChips = useMemo(() => {
    const freq = {};
    list.forEach((i) => i.symbols.forEach((s) => { if (s !== "ALL") freq[s] = (freq[s] || 0) + 1; }));
    const rank = (s) => { const p = SYMBOL_PRIORITY.indexOf(s); return p === -1 ? 999 : p; };
    const sorted = Object.keys(freq).sort((a, b) => rank(a) - rank(b) || freq[b] - freq[a] || a.localeCompare(b));
    return ["All", ...sorted.slice(0, 14)];
  }, [list]);

  // currency filter + "hide past events" (events from the last 15 min stay visible)
  const inScope = useMemo(
    () =>
      list.filter((i) => {
        if (symbol !== "All" && !(i.symbols.includes(symbol) || i.symbols.includes("ALL"))) return false;
        if (isCalendar && upcomingOnly && ts(i.time) < now - 15 * 60000) return false;
        return true;
      }),
    [list, symbol, isCalendar, upcomingOnly, now]
  );

  const categories = useMemo(() => ["All", ...Array.from(new Set(inScope.map((i) => i.category)))], [inScope]);
  const activeCategory = categories.includes(category) ? category : "All";

  const inCategory = useMemo(
    () => (activeCategory === "All" ? inScope : inScope.filter((i) => i.category === activeCategory)),
    [inScope, activeCategory]
  );

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    inCategory.forEach((i) => { c[i.impact] += 1; });
    return c;
  }, [inCategory]);

  const totals = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    inScope.forEach((i) => { c[i.impact] += 1; });
    return c;
  }, [inScope]);

  const visible = useMemo(
    () => inCategory.filter((i) => impactFilter === "all" || i.impact === impactFilter),
    [inCategory, impactFilter]
  );

  // next red event for the selected currency
  const nextHigh = useMemo(() => {
    return (
      inScope
        .filter((i) => i.impact === "high" && ts(i.time) > now)
        .sort((a, b) => ts(a.time) - ts(b.time))[0] || null
    );
  }, [inScope, now]);

  const groups = useMemo(() => {
    if (isCalendar) {
      // Forex Factory style: one section per day, earliest first
      const byDay = {};
      visible.forEach((i) => {
        const k = dayKey(i.time);
        (byDay[k] = byDay[k] || []).push(i);
      });
      return Object.keys(byDay)
        .sort()
        .map((k) => ({
          name: dayLabel(byDay[k][0].time, now),
          rows: byDay[k].slice().sort((a, b) => ts(a.time) - ts(b.time)),
        }));
    }
    const map = {};
    visible.forEach((i) => {
      const g = groupOf(i.time, now);
      if (!map[g]) map[g] = [];
      map[g].push(i);
    });
    return GROUP_ORDER.filter((g) => map[g]).map((g) => ({
      name: g,
      rows: map[g].slice().sort((a, b) => (g === "Upcoming" ? ts(a.time) - ts(b.time) : ts(b.time) - ts(a.time))),
    }));
  }, [visible, now, isCalendar]);

  const nextHighSoon = nextHigh && ts(nextHigh.time) - now <= 30 * 60000;
  const stamp = clockTime(updatedAt || new Date(mountedAt).toISOString());
  const totalCount = totals.high + totals.medium + totals.low;
  const impactOptions = [
    { value: "all", label: "All impact", count: inCategory.length },
    ...IMPACT_ORDER.map((k) => ({ value: k, label: IMPACT[k].label, dot: k, count: counts[k] })),
  ];
  const currencyOptions = symbolChips.map((s) => ({
    value: s,
    label: s === "All" ? "All currencies" : s,
    flag: s === "All" ? null : FLAG_CODE[s] || null,
    symbol: s,
  }));
  const categoryOptions = categories.map((c) => ({ value: c, label: c === "All" ? "All categories" : c }));
  const pageTitle = useRemote && view === "news" ? "Market Headlines" : "Weekly Economic Calendar";

  const toggle = (item) => {
    setOpenId((cur) => (cur === item.id ? null : item.id));
    if (openId !== item.id && typeof onSelect === "function") onSelect(item);
  };

  const clearFilters = () => {
    setImpactFilter("all");
    setCategory("All");
    setSymbol("All");
    setUpcomingOnly(false);
  };

  return (
    <div className={"nw-root" + (embedded ? " nw-embedded" : "")} data-theme={theme}>
      <style>{CSS}</style>
      <div className="nw-wrap">
        {typeof onBack === "function" && (
          <button type="button" className="nw-back" onClick={onBack}>
            ← Back to session
          </button>
        )}
        <header className="nw-head">
          <div>
            <h2>{pageTitle}</h2>
            <div className="nw-updated">
              {weekRange(now)} ({tzLabel()})
              <span> · Updated {stamp}</span>
            </div>
          </div>
          <button type="button" className="nw-refresh" onClick={() => typeof onRefresh === "function" && onRefresh()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
            </svg>
            Refresh
          </button>
        </header>

        {useRemote && (
          <div className="nw-seg" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }} role="group" aria-label="Feed">
            <button type="button" className="nw-pill" aria-pressed={view === "calendar"} onClick={() => switchView("calendar")}>
              Calendar
            </button>
            <button type="button" className="nw-pill" aria-pressed={view === "news"} onClick={() => switchView("news")}>
              Headlines
            </button>
          </div>
        )}

        <section className={"nw-pulse nw-hero" + (nextHighSoon ? " live" : "")} aria-label="Next high-impact event">
          <div className="nw-pulse-top">
            <span className="nw-hero-label">Next high-impact event</span>
            {nextHigh && <span className="nw-hero-meta">{relTime(nextHigh.time, now)}</span>}
          </div>

          {nextHigh ? (
            <div className="nw-hero-ev">
              <Flag code={flagCodeFor(nextHigh)} label={nextHigh.symbols[0]} size={46} />
              <div>
                <div className="nw-pulse-title">{nextHigh.title}</div>
                <div className="nw-pulse-sub">
                  {dayLabel(nextHigh.time, now)} · {clockTime(nextHigh.time)} · Plan to be flat 30 minutes either side.
                </div>
              </div>
            </div>
          ) : (
            <div className="nw-pulse-sub" style={{ marginTop: 10 }}>
              No high-impact events ahead. The rest of the schedule is clear of red events.
            </div>
          )}

          {totalCount > 0 && (
            <>
              <div className="nw-bar" role="img" aria-label={`${totals.high} high, ${totals.medium} medium, ${totals.low} low impact items`}>
                {IMPACT_ORDER.map((k) =>
                  totals[k] > 0 ? <span key={k} className={`nw-i-${k}`} style={{ flexGrow: totals[k] }} /> : null
                )}
              </div>
              <div className="nw-legend">
                {IMPACT_ORDER.map((k) => (
                  <span key={k} className={`nw-i-${k}`}>
                    <i />
                    {totals[k]} {IMPACT[k].label.toLowerCase()}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="nw-filters">
          <div className="nw-dd-row">
            <Dropdown label="Impact" value={impactFilter} options={impactOptions} onChange={setImpactFilter} />
            <Dropdown label="Currency" value={symbol} options={currencyOptions} onChange={setSymbol} />
            {categoryOptions.length > 1 && (
              <Dropdown label="Category" value={activeCategory} options={categoryOptions} onChange={setCategory} />
            )}
          </div>

          {isCalendar && (
            <button
              type="button"
              className="nw-toggle"
              role="switch"
              aria-checked={upcomingOnly}
              onClick={() => setUpcomingOnly((v) => !v)}
            >
              <span>Hide past events</span>
              <span className="nw-switch" />
            </button>
          )}
        </div>

        {/* states + feed */}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="nw-state">
            <strong>Couldn't load the news</strong>
            <p>{typeof error === "string" ? error : "Check your connection and try again."}</p>
            <button type="button" className="nw-btn" onClick={() => typeof onRefresh === "function" && onRefresh()}>
              Try again
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="nw-state">
            <strong>{list.length === 0 ? "No news yet" : "Nothing matches these filters"}</strong>
            <p>
              {list.length === 0
                ? "New events and headlines will appear here as they come in."
                : "Try a different impact level or category."}
            </p>
            {list.length > 0 && (
              <button type="button" className="nw-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.name} className="nw-group">
              <div className="nw-table-head">
                <h3>{g.name}</h3>
                <span>
                  {g.rows.length} {g.rows.length === 1 ? "event" : "events"}
                </span>
              </div>

              <div className="nw-table">
                <div className="nw-table-header" aria-hidden="true">
                  <span>Time</span>
                  <span>Event</span>
                  <span>Actual</span>
                  <span>Forecast</span>
                  <span>Previous</span>
                  <span>Impact</span>
                </div>

                {g.rows.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    now={now}
                    past={isCalendar && ts(item.time) < now}
                    open={openId === item.id}
                    onToggle={() => toggle(item)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- scoped styles (tokens match Session.jsx so both themes line up) ----------
const CSS = `
.nw-root{
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
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--glow-rose:rgba(255,107,125,.38);
--r-card:26px; --r-input:14px; --r-pill:999px;
box-sizing:border-box;
color:var(--text);
font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.nw-root[data-theme="light"]{
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
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--glow-rose:rgba(214,60,51,.28);
}
.nw-root *{box-sizing:border-box;}
.nw-root:not(.nw-embedded){
  min-height:100vh;background:var(--bg-grad);background-attachment:fixed;
  padding:calc(26px + env(safe-area-inset-top,0px)) 18px calc(40px + env(safe-area-inset-bottom,0px));
}
.nw-root .nw-wrap{max-width:520px;margin:0 auto;}
.nw-root button{font-family:inherit;}
.nw-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}

/* impact colour hooks */
.nw-root .nw-i-high{--ic:var(--rose);--ic-dim:var(--rose-dim);}
.nw-root .nw-i-medium{--ic:var(--warn);--ic-dim:var(--warn-dim);}
.nw-root .nw-i-low{--ic:var(--teal);--ic-dim:var(--teal-dim);}

.nw-root .nw-back{display:inline-flex;align-items:center;gap:4px;margin-bottom:14px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.nw-root .nw-back:hover{border-color:var(--amber);color:var(--text);}

.nw-root .nw-item.past .nw-item-head{opacity:.55;}

/* header */
.nw-root .nw-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:16px;}
.nw-root .nw-head h2{margin:0;font-weight:800;font-size:clamp(26px,6vw,32px);letter-spacing:-.03em;line-height:1.05;}
.nw-root .nw-updated{font-size:12px;color:var(--muted);margin-top:6px;font-variant-numeric:tabular-nums;}
.nw-root .nw-refresh{display:inline-flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.nw-root .nw-refresh:hover{border-color:var(--amber);color:var(--text);}

/* glass surfaces */
.nw-root .nw-pulse,.nw-root .nw-item,.nw-root .nw-state{
  background:var(--surface);
  -webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border:1px solid var(--border);
  box-shadow:var(--shadow-card);
}

/* what's next + day weight */
.nw-root .nw-pulse{border-radius:var(--r-card);padding:18px;}
.nw-root .nw-pulse.live{border-color:var(--rose);animation:nw-breathe 2.6s ease-in-out infinite;}
.nw-root .nw-pulse-row{display:flex;gap:14px;align-items:flex-start;}
.nw-root .nw-ping{flex-shrink:0;width:10px;height:10px;margin-top:6px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 4px var(--teal-dim);}
.nw-root .nw-pulse.live .nw-ping{background:var(--rose);box-shadow:0 0 0 4px var(--rose-dim);}
.nw-root .nw-pulse-title{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.3;}
.nw-root .nw-pulse-sub{font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.4;}
.nw-root .nw-bar{display:flex;gap:3px;height:8px;margin-top:16px;}
.nw-root .nw-bar span{display:block;height:100%;min-width:8px;border-radius:var(--r-pill);background:var(--ic);}
.nw-root .nw-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
.nw-root .nw-legend span{display:inline-flex;align-items:center;gap:6px;}
.nw-root .nw-legend i,.nw-root .nw-pill i,.nw-root .nw-badge i{display:block;width:7px;height:7px;border-radius:50%;background:var(--ic);flex-shrink:0;}

/* filters */
.nw-root .nw-filters{margin:18px 0 6px;}
.nw-root .nw-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
.nw-root .nw-pill{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 6px;border-radius:var(--r-input);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:12px;font-weight:700;cursor:pointer;transition:all .18s ease;}
.nw-root .nw-pill em{font-style:normal;font-weight:600;opacity:.7;font-variant-numeric:tabular-nums;}
.nw-root .nw-pill:hover{color:var(--text);}
.nw-root .nw-pill[aria-pressed="true"]{background:var(--btn);color:var(--on-accent);border-color:transparent;}
.nw-root .nw-pill[aria-pressed="true"] i{box-shadow:0 0 0 2px rgba(255,255,255,.55);}
.nw-root .nw-chips{display:flex;gap:6px;margin-top:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
.nw-root .nw-chips::-webkit-scrollbar{display:none;}
.nw-root .nw-chip{flex-shrink:0;padding:7px 13px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s ease;}
.nw-root .nw-chip:hover{color:var(--text);}
.nw-root .nw-chip[aria-pressed="true"]{border-color:var(--amber);background:var(--amber-dim);color:var(--text);}

/* groups */
.nw-root .nw-group h3{display:flex;align-items:baseline;justify-content:space-between;margin:26px 4px 12px;font-size:16px;font-weight:700;letter-spacing:-.02em;}
.nw-root .nw-group h3 span{font-size:11.5px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums;}
.nw-root .nw-list{display:grid;gap:10px;}

/* card */
.nw-root .nw-item{border-radius:22px;box-shadow:inset 3px 0 0 var(--ic),var(--shadow-card);transition:border-color .2s ease,box-shadow .2s ease;}
.nw-root .nw-item.open{border-color:var(--ic);}
.nw-root .nw-item.soon{border-color:var(--ic);box-shadow:inset 3px 0 0 var(--ic),0 0 28px 1px var(--ic-dim),var(--shadow-card);}
.nw-root .nw-item-head{width:100%;display:grid;grid-template-columns:62px 1fr auto;gap:12px;align-items:start;padding:14px 14px 14px 16px;background:none;border:none;color:inherit;text-align:left;cursor:pointer;border-radius:22px;}
.nw-root .nw-time strong{display:block;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}
.nw-root .nw-time span{display:block;font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;}
.nw-root .nw-main{min-width:0;}
.nw-root .nw-title{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:1.32;overflow-wrap:anywhere;}
.nw-root .nw-meta{display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:5px;font-size:11.5px;color:var(--muted);}
.nw-root .nw-cat{color:var(--accent-text);font-weight:600;}
.nw-root .nw-side{display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
.nw-root .nw-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r-pill);background:var(--ic-dim);color:var(--ic);font-size:11.5px;font-weight:700;}
.nw-root .nw-chev{color:var(--muted);transition:transform .25s ease;}
.nw-root .nw-chev.open{transform:rotate(180deg);}

/* expandable detail */
.nw-root .nw-detail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .26s ease;}
.nw-root .nw-detail.open{grid-template-rows:1fr;}
.nw-root .nw-detail-inner{overflow:hidden;min-height:0;}
.nw-root .nw-body{padding:0 16px 16px;border-top:1px solid var(--border);margin:0 16px;padding:14px 0 2px;}
.nw-root .nw-summary{margin:0 0 12px;font-size:13px;line-height:1.55;color:var(--muted);max-width:62ch;}
.nw-root .nw-data{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px;}
.nw-root .nw-data div{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:10px 12px;}
.nw-root .nw-data dt{font-size:11px;color:var(--muted);font-weight:600;}
.nw-root .nw-data dd{margin:3px 0 0;font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}
.nw-root .nw-data .has-actual{border-color:var(--ic);background:var(--ic-dim);}
.nw-root .nw-data .has-actual dd{color:var(--text);}
.nw-root .nw-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
.nw-root .nw-syms{display:flex;flex-wrap:wrap;gap:6px;}
.nw-root .nw-sym{padding:3px 9px;border-radius:9px;background:var(--surface-2);border:1px solid var(--border);font-size:11px;font-weight:700;letter-spacing:.02em;}
.nw-root .nw-rule{font-size:12px;color:var(--muted);}
.nw-root .nw-rule strong{color:var(--ic);font-weight:700;}
.nw-root .nw-link{display:inline-block;margin-bottom:12px;font-size:12px;font-weight:600;color:var(--muted);text-decoration:underline;text-underline-offset:3px;}
.nw-root .nw-link:hover{color:var(--text);}

/* loading / empty / error */
.nw-root .nw-skel{height:76px;border-radius:22px;background:linear-gradient(100deg,var(--surface-2) 30%,rgba(255,255,255,.12) 50%,var(--surface-2) 70%);background-size:220% 100%;border:1px solid var(--border);animation:nw-shimmer 1.4s linear infinite;}
.nw-root .nw-state{margin-top:26px;border-radius:var(--r-card);padding:28px 22px;text-align:center;}
.nw-root .nw-state strong{display:block;font-size:16px;font-weight:700;}
.nw-root .nw-state p{margin:6px 0 16px;font-size:13px;color:var(--muted);line-height:1.5;}
.nw-root .nw-btn{border:none;background:var(--btn);color:var(--on-accent);font-weight:700;font-size:13px;border-radius:var(--r-input);padding:10px 18px;cursor:pointer;}

@keyframes nw-shimmer{from{background-position:120% 0;}to{background-position:-120% 0;}}
@keyframes nw-breathe{0%,100%{box-shadow:var(--shadow-card),0 0 0 0 var(--glow-rose);}50%{box-shadow:var(--shadow-card),0 0 28px 4px var(--glow-rose);}}

@media (max-width:380px){
  .nw-root .nw-item-head{grid-template-columns:52px 1fr auto;gap:10px;}
  .nw-root .nw-pill{font-size:11.5px;padding:10px 4px;}
  .nw-root .nw-pill i{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .nw-root .nw-pulse.live,.nw-root .nw-skel{animation:none;}
  .nw-root .nw-detail,.nw-root .nw-chev{transition:none;}
}

/* ===== v2: official table layout, dropdowns, flags ===== */
.nw-root{--menu-bg:#10172c;--cols:58px 32px minmax(0,1fr) auto;}
.nw-root[data-theme="light"]{--menu-bg:#f5f9ff;}
.nw-root .nw-wrap{max-width:680px;}

/* header */
.nw-root .nw-ttl{margin:0;font-weight:800;font-size:clamp(24px,6vw,32px);letter-spacing:-.03em;line-height:1.1;
background:linear-gradient(90deg,var(--accent-text),var(--amber));-webkit-background-clip:text;background-clip:text;color:transparent;}
.nw-root .nw-range{margin-top:6px;font-size:13.5px;font-weight:600;color:var(--text);opacity:.85;}

/* hero card */
.nw-root .nw-hero{padding:20px;}
.nw-root .nw-hero-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.nw-root .nw-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.nw-root .nw-eyebrow .nw-ping{margin-top:0;width:8px;height:8px;}
.nw-root .nw-count{padding:5px 12px;border-radius:var(--r-pill);background:var(--rose-dim);color:var(--rose);font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;}
.nw-root .nw-hero-ev{display:flex;align-items:center;gap:14px;margin-top:16px;}
.nw-root .nw-hero .nw-pulse-title{font-size:19px;}

/* flags */
.nw-root .nw-flag{border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--surface-2);box-shadow:0 0 0 1.5px var(--border),0 4px 10px -4px rgba(0,0,0,.5);}
.nw-root .nw-flag-fb{display:inline-grid;place-items:center;font-size:9px;font-weight:800;letter-spacing:.02em;color:var(--accent-text);}
.nw-root .nw-item-head .nw-flag{margin-top:1px;}

/* dropdowns */
.nw-root .nw-filters{position:relative;z-index:30;margin:18px 0 4px;}
.nw-root .nw-fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
.nw-root .nw-dd{position:relative;min-width:0;}
.nw-root .nw-dd-label{display:block;margin:0 0 6px 4px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.nw-root .nw-dd-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px;border-radius:var(--r-input);border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:12.5px;font-weight:700;cursor:pointer;transition:border-color .18s ease;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);}
.nw-root .nw-dd-btn:hover,.nw-root .nw-dd.open .nw-dd-btn{border-color:var(--amber);}
.nw-root .nw-dd-cur{display:inline-flex;align-items:center;gap:8px;min-width:0;}
.nw-root .nw-dd-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nw-root .nw-dd-btn .nw-chev{flex-shrink:0;}
.nw-root .nw-dd-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:100%;width:max-content;max-width:260px;max-height:300px;overflow-y:auto;padding:6px;border-radius:16px;background:var(--menu-bg);border:1px solid var(--border);box-shadow:0 24px 48px -16px rgba(0,0,0,.7);z-index:60;animation:nw-pop .16s ease;}
.nw-root .nw-fgrid .nw-dd:nth-child(3) .nw-dd-menu{left:auto;right:0;}
.nw-root .nw-dd-opt{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border:none;border-radius:10px;background:none;color:var(--text);font-size:12.5px;font-weight:600;text-align:left;cursor:pointer;}
.nw-root .nw-dd-opt:hover{background:var(--surface-2);}
.nw-root .nw-dd-opt[aria-selected="true"]{background:var(--amber-dim);}
.nw-root .nw-dd-opt .nw-dd-text{flex:1;}
.nw-root .nw-dd-opt em{font-style:normal;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
.nw-root .nw-dot{display:block;width:8px;height:8px;border-radius:50%;background:var(--ic);flex-shrink:0;}

/* hide-past switch */
.nw-root .nw-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:11px 14px;border-radius:var(--r-input);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;}
.nw-root .nw-switch{position:relative;width:38px;height:22px;border-radius:var(--r-pill);background:var(--border);transition:background .2s ease;}
.nw-root .nw-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--text);transition:transform .2s ease;}
.nw-root .nw-toggle[aria-checked="true"]{color:var(--text);}
.nw-root .nw-toggle[aria-checked="true"] .nw-switch{background:var(--btn);}
.nw-root .nw-toggle[aria-checked="true"] .nw-switch::after{transform:translateX(16px);background:var(--on-accent);}

/* day bar + column header */
.nw-root .nw-group h3.nw-day{display:flex;align-items:center;justify-content:space-between;margin:28px 0 10px;padding:10px 14px;border-radius:14px;background:var(--amber-dim);border:1px solid var(--border);font-size:14px;font-weight:800;letter-spacing:-.01em;}
.nw-root .nw-day-count{font-size:11.5px;font-weight:600;color:var(--muted);}
.nw-root .nw-cols{display:grid;grid-template-columns:var(--cols);gap:12px;padding:0 14px 8px 19px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.nw-root .nw-cols-nums,.nw-root .nw-cols-imp{display:none;}

/* rows */
.nw-root .nw-list{gap:8px;}
.nw-root .nw-item-head{grid-template-columns:var(--cols);align-items:start;}
.nw-root .nw-ccy{font-weight:800;color:var(--text);letter-spacing:.03em;}
.nw-root .nw-nums{display:none;}
.nw-root .nw-side{flex-direction:row;align-items:center;gap:8px;}
.nw-root .nw-imp{display:inline-flex;align-items:center;gap:8px;}
.nw-root .nw-bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px;}
.nw-root .nw-bars b{display:block;width:4px;border-radius:2px;background:var(--border);}
.nw-root .nw-bars b:nth-child(1){height:6px;}
.nw-root .nw-bars b:nth-child(2){height:10px;}
.nw-root .nw-bars b:nth-child(3){height:14px;}
.nw-root .nw-bars b.on{background:var(--ic);}
.nw-root .nw-imp-label{display:none;font-size:11.5px;font-weight:700;color:var(--ic);}

@media (min-width:600px){
.nw-root{--cols:62px 32px minmax(0,1fr) 168px 96px;}
.nw-root .nw-nums,.nw-root .nw-cols-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.nw-root .nw-cols-imp{display:block;}
.nw-root .nw-nums span,.nw-root .nw-cols-nums span{text-align:right;}
.nw-root .nw-nums span{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--muted);}
.nw-root .nw-nums .has-actual{color:var(--ic);font-weight:800;}
.nw-root .nw-imp-label{display:inline;}
.nw-root .nw-side{justify-content:space-between;}
}
@media (max-width:520px){
.nw-root .nw-fgrid{grid-template-columns:1fr 1fr;}
.nw-root .nw-fgrid .nw-dd:nth-child(3){grid-column:1/-1;}
.nw-root .nw-fgrid .nw-dd:nth-child(2) .nw-dd-menu{left:auto;right:0;}
.nw-root .nw-fgrid .nw-dd:nth-child(3) .nw-dd-menu{left:0;right:auto;}
}
@keyframes nw-pop{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
`;