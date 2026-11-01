import { useState, useEffect, useRef, useMemo } from "react";

/* ==========================================================================
   THE SUMMIT CLIMB
   Camps define balance, risk and target. Lot size is never static: the
   position sizer derives it from your risk and your stop-loss distance.
   ========================================================================== */

// [balance threshold, default risk per trade, default target]
const LEVELS = [
  [500, 40, 80],
  [1000, 80, 160],
  [2500, 200, 400],
  [5000, 400, 800],
  [10000, 800, 1600],
  [25000, 1500, 3000],
  [50000, 2500, 5000],
  [100000, 4000, 8000],
  [200000, 6000, 12000],
  [300000, 9000, 18000],
];

const KEY = "summitTracker.v2";
const HISTORY_KEY = "td_history"; // shared with session.jsx, do not rename on either side
const THEME_KEY = "td_theme"; // shared with session.jsx
const RISK_KEY = "summitTracker.risk";
const PIP_KEY = "summitTracker.pipValue";
const INST_KEY = "summitTracker.instrument";
const RR_KEY = "summitTracker.rr";

// pipVal = dollars per pip per 1.0 lot. Gold: 1 pip = $0.10 move, 100 oz contract.
const INSTRUMENTS = [
  {
    id: "xau", name: "Gold", pipVal: 10, pipSize: 0.1, step: 5,
    quick: [10, 15, 20, 30, 40, 50],
    hint: "XAUUSD: 1 pip is a $0.10 move, $10 per lot on a 100 oz contract.",
  },
  {
    id: "fx", name: "Forex", pipVal: 10, pipSize: null, step: 1,
    quick: [3, 5, 8, 10, 15, 20, 30],
    hint: "USD-quoted pairs: $10 per pip per lot.",
  },
  {
    id: "custom", name: "Custom", pipVal: null, pipSize: null, step: 1,
    quick: [3, 5, 8, 10, 15, 20, 30],
    hint: "Set the pip value from your broker's contract specs.",
  },
];
const RR_OPTIONS = [1, 1.5, 2, 3];

// ---------- storage + theme ----------
function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function readTheme() {
  try {
    const t = JSON.parse(window.localStorage.getItem(THEME_KEY));
    return t === "light" ? "light" : "dark";
  } catch (e) {
    return "dark";
  }
}

function useTheme() {
  const [theme, setTheme] = useState(() => (typeof window === "undefined" ? "dark" : readTheme()));
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return theme;
}

function readNum(key) {
  try {
    const n = parseFloat(window.localStorage.getItem(key));
    return n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  try { window.localStorage.setItem(key, String(value)); } catch (e) {}
}

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const money = (n) =>
  "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fm = (n) => "$" + Math.round(n).toLocaleString();
const signed = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + fm(Math.abs(n));
const trim = (n) => String(Math.round(n * 100) / 100);
const levelOf = (b) => LEVELS.reduce((acc, l, k) => (b >= l[0] ? k : acc), 0);
const cleanNum = (v) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// ---------- position-size maths ----------
// lot = risk / (stopPips * pipValuePerLot), floored to 0.01 so you never exceed your risk.
// The 1e-9 nudge stops float noise (0.0799999) from dropping a whole step.
function calcLot(risk, pips, pipVal, rr) {
  if (!(risk > 0 && pips > 0 && pipVal > 0)) return null;
  const perLot = pips * pipVal;
  const lot = Math.floor((risk / perLot) * 100 + 1e-9) / 100;
  const real = lot * perLot;
  return {
    lot,
    real,
    minRisk: 0.01 * perLot,
    tpPips: Math.round(pips * rr * 10) / 10,
    target: real * rr,
  };
}

function useCalc(campRisk) {
  const [riskInput, setRiskInput] = useState(() => {
    const r = readNum(RISK_KEY);
    return r ? String(r) : "";
  });
  const [pipInput, setPipInput] = useState(() => {
    const p = readNum(PIP_KEY);
    return p ? String(p) : "10";
  });
  const [inst, setInstState] = useState(() => {
    try {
      const v = window.localStorage.getItem(INST_KEY);
      return INSTRUMENTS.some((i) => i.id === v) ? v : "xau";
    } catch (e) {
      return "xau";
    }
  });
  const [rr, setRrState] = useState(() => {
    const r = readNum(RR_KEY);
    return RR_OPTIONS.includes(r) ? r : 2;
  });
  const [pips, setPipsState] = useState("");

  const setRisk = (raw) => {
    const v = cleanNum(raw);
    setRiskInput(v);
    const n = parseFloat(v);
    if (n > 0) writeKey(RISK_KEY, n);
    else if (v === "") {
      try { window.localStorage.removeItem(RISK_KEY); } catch (e) {}
    }
  };

  const setPipVal = (raw) => {
    const v = cleanNum(raw);
    setPipInput(v);
    const n = parseFloat(v);
    if (n > 0) writeKey(PIP_KEY, n);
  };

  const setInst = (id) => {
    setInstState(id);
    writeKey(INST_KEY, id);
    const preset = INSTRUMENTS.find((i) => i.id === id);
    if (preset && preset.pipVal) {
      setPipInput(String(preset.pipVal));
      writeKey(PIP_KEY, preset.pipVal);
    }
  };

  const setRr = (r) => {
    setRrState(r);
    writeKey(RR_KEY, r);
  };

  const setPips = (raw) => setPipsState(cleanNum(String(raw)));
  const stepPips = (d) => {
    const cur = parseFloat(pips) || 0;
    const next = Math.max(0, Math.round((cur + d) * 10) / 10);
    setPipsState(next > 0 ? String(next) : "");
  };

  const customRisk = parseFloat(riskInput);
  const isCustom = customRisk > 0;
  const riskNum = isCustom ? customRisk : campRisk;
  const pipVal = parseFloat(pipInput);
  const stop = parseFloat(pips);

  const result = useMemo(() => calcLot(riskNum, stop, pipVal, rr), [riskNum, stop, pipVal, rr]);

  return {
    riskInput, setRisk, pips, setPips, stepPips, pipInput, setPipVal,
    inst, setInst, rr, setRr, riskNum, isCustom, result, stop,
  };
}

const POINTS = LEVELS.map((_, i) => [
  50 + i * 67,
  262 - Math.pow(i / 9, 1.15) * 205 - (i % 2 ? 6 : 0),
]);

// Weeks start on Monday and show Mon–Fri only (5 rows).
function buildContributionWeeks(history, weeks = 26) {
  const byDate = {};
  history.forEach((h) => { byDate[h.date] = h; });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sinceMonday = (today.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - sinceMonday);

  const grid = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let d = 0; d < 5; d++) {
      const dt = new Date(thisMonday);
      dt.setDate(thisMonday.getDate() - w * 7 + d);
      const key = dateKey(dt);
      col.push({ date: key, month: dt.getMonth(), entry: byDate[key] || null, isFuture: dt > today });
    }
    grid.push(col);
  }
  return grid;
}

function cellColor(day) {
  if (!day || day.isFuture) return "var(--cell-future)";
  if (!day.entry) return "var(--cell-empty)";
  const net = day.entry.net || 0;
  if (net > 0) return net > 300 ? "#1e8a3c" : net > 100 ? "#2fa24f" : "#56c46f";
  if (net < 0) return net < -300 ? "#a3201c" : net < -100 ? "#c9342c" : "#e2665f";
  return "var(--cell-flat)";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const prettyDate = (key) =>
  new Date(key + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// ---------- presentational pieces ----------
function DimMoney({ text }) {
  const s = String(text);
  const i = s.lastIndexOf(".");
  if (i < 0) return <>{s}</>;
  return (
    <>
      {s.slice(0, i)}
      <span className="sm-dim">{s.slice(i)}</span>
    </>
  );
}

function Ring({ pct, met }) {
  const size = 84;
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg className="sm-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={met ? "#8dffc0" : "#ffffff"} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .5s ease" }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function Mountain({ balance }) {
  const i = levelOf(balance);
  const ridge = POINTS.map((p) => p.join(",")).join(" ");
  const shadow = POINTS.map((p) => `${p[0] + 10},${p[1] + 22}`).join(" ");
  const climbed = POINTS.slice(0, i + 1).map((p) => p.join(",")).join(" ");

  let f = 0;
  if (i < 9) f = Math.max(0, Math.min(1, (balance - LEVELS[i][0]) / (LEVELS[i + 1][0] - LEVELS[i][0])));
  const a = POINTS[i];
  const c = POINTS[Math.min(i + 1, 9)];
  const x = a[0] + (c[0] - a[0]) * f;
  const y = a[1] + (c[1] - a[1]) * f;
  const top = POINTS[9];

  const stars = useMemo(
    () => Array.from({ length: 26 }, (_, k) => ({
      cx: (k * 97) % 700, cy: (k * 53) % 150, r: k % 3 === 0 ? 1.4 : 0.9, o: 0.25 + (k % 5) * 0.12,
    })),
    []
  );

  return (
    <svg viewBox="0 0 700 300" role="img" aria-label="Mountain with ten camps">
      <defs>
        <linearGradient id="smSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1028" stopOpacity="0" />
          <stop offset="1" stopColor="#2c4f95" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id="smRock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3d78" />
          <stop offset="1" stopColor="#0a1a3a" />
        </linearGradient>
        <linearGradient id="smTrail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c99f48" />
          <stop offset="1" stopColor="#f6e0a2" />
        </linearGradient>
      </defs>

      <rect width="700" height="300" fill="url(#smSky)" />
      {stars.map((s, k) => <circle key={k} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.o} />)}

      <polygon points={`0,300 0,285 ${shadow} 700,70 700,300`} fill="#173f78" opacity=".55" />
      <polygon points={`0,300 0,270 ${ridge} 700,40 700,300`} fill="url(#smRock)" />

      <polyline points={ridge} fill="none" stroke="#6f86b8" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" opacity=".7" />
      <polyline points={climbed} fill="none" stroke="#f6e0a2" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity=".15" />
      <polyline points={climbed} fill="none" stroke="url(#smTrail)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {POINTS.map((p, k) => (
        <g key={k}>
          <circle
            cx={p[0]} cy={p[1]} r={k <= i ? 7 : 5}
            fill={k <= i ? "#f6e0a2" : "#10284f"}
            stroke={k === 9 ? "#f6e0a2" : "#9cc8f8"} strokeWidth="2"
          />
          <text x={p[0]} y={p[1] + 24} textAnchor="middle" fontSize="11" fontWeight="600" fill="#c5d9f5">{k + 1}</text>
        </g>
      ))}

      <line x1={top[0]} y1={top[1] - 30} x2={top[0]} y2={top[1] - 6} stroke="#ffffff" strokeWidth="2" />
      <path d={`M${top[0]} ${top[1] - 30}v-16l14 5-14 5`} fill="#f6e0a2" />

      <g transform={`translate(${x},${y})`}>
        <circle className="sm-pulse" r="13" fill="#5ccf94" opacity=".28" />
        <circle cy="-9" r="4" fill="#eef3f7" />
        <path d="M0-5v10M-4 8L0 4L4 8" stroke="#eef3f7" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ---------- position sizer ----------
function Sizer({ calc, balance, campRisk }) {
  const {
    riskInput, setRisk, pips, setPips, stepPips, pipInput, setPipVal,
    inst, setInst, rr, setRr, riskNum, isCustom, result, stop,
  } = calc;

  const ins = INSTRUMENTS.find((i) => i.id === inst) || INSTRUMENTS[0];
  const isGold = ins.id === "xau";
  const ready = !!(result && result.lot > 0);
  const tooSmall = !!(result && result.lot === 0);
  const lotText = result ? result.lot.toFixed(2) : "0.00";
  const state = ready ? "ready" : tooSmall ? "small" : "idle";
  const rounded = ready && riskNum - result.real > 0.005;
  const riskPct = balance > 0 ? (riskNum / balance) * 100 : 0;
  const move = (p) => "$" + (p * 0.1).toFixed(2) + " move";

  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!ready) return;
    const ok = await copyText(lotText);
    if (ok) {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    }
  };

  const onEnter = (e) => { if (e.key === "Enter") e.currentTarget.blur(); };
  const selectAll = (e) => e.target.select();

  return (
    <section className="sm-calc" aria-label="Position sizer">
      <div className="sm-calc-title">
        <h2>Position sizer</h2>
        <span>Risk stays fixed, lot adapts</span>
      </div>

      <div className="sm-seg" role="group" aria-label="Instrument">
        {INSTRUMENTS.map((i) => (
          <button
            key={i.id} type="button"
            className={i.id === inst ? "on" : ""}
            aria-pressed={i.id === inst}
            onClick={() => setInst(i.id)}
          >
            {i.name}
          </button>
        ))}
      </div>

      {/* risk */}
      <div className="sm-panel">
        <div className="sm-panel-head">
          <label htmlFor="sm-risk">Risk per trade</label>
          {balance > 0 && <span>{trim(riskPct)}% of balance</span>}
        </div>
        <div className="sm-panel-body">
          <div className="sm-big">
            <i>$</i>
            <input
              id="sm-risk" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
              value={riskInput} placeholder={String(campRisk)}
              onChange={(e) => setRisk(e.target.value)}
              onFocus={selectAll} onKeyDown={onEnter}
            />
          </div>
          <button
            type="button"
            className={"sm-tag" + (!isCustom ? " on" : "")}
            onClick={() => setRisk("")}
            aria-pressed={!isCustom}
          >
            Camp {fm(campRisk)}
          </button>
        </div>
      </div>

      {/* stop */}
      <div className="sm-panel">
        <div className="sm-panel-head">
          <label htmlFor="sm-pips">Stop-loss</label>
          {isGold && stop > 0 && <span>{move(stop)}</span>}
        </div>
        <div className="sm-panel-body">
          <button type="button" className="sm-step" aria-label={`Decrease stop by ${ins.step} pips`} onClick={() => stepPips(-ins.step)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
          <div className="sm-big center">
            <input
              id="sm-pips" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
              value={pips} placeholder="0"
              onChange={(e) => setPips(e.target.value)}
              onFocus={selectAll} onKeyDown={onEnter}
            />
            <i>pips</i>
          </div>
          <button type="button" className="sm-step" aria-label={`Increase stop by ${ins.step} pips`} onClick={() => stepPips(ins.step)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="sm-quick" role="group" aria-label="Quick stop distances">
          {ins.quick.map((p) => (
            <button
              key={p} type="button"
              className={"sm-qp" + (String(p) === pips ? " on" : "")}
              onClick={() => setPips(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* reward ratio */}
      <div className="sm-rrsel">
        <span>Reward ratio</span>
        <div className="sm-seg small" role="group" aria-label="Reward ratio">
          {RR_OPTIONS.map((r) => (
            <button
              key={r} type="button"
              className={r === rr ? "on" : ""}
              aria-pressed={r === rr}
              onClick={() => setRr(r)}
            >
              1:{r}
            </button>
          ))}
        </div>
      </div>

      {/* result */}
      <div className={"sm-result " + state} aria-live="polite">
        <div className="sm-result-top">
          <span className="sm-result-label">Suggested lot size</span>
          <button type="button" className={"sm-copy" + (copied ? " done" : "")} onClick={copy} disabled={!ready}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button type="button" className="sm-lot" onClick={copy} disabled={!ready} aria-label={`Lot size ${lotText}. Tap to copy`}>
          <span key={lotText + state} className="sm-lot-num">{lotText}</span>
          <span className="sm-lot-unit">lots</span>
        </button>

        {state === "idle" && <p className="sm-line">Enter your stop-loss to size the trade.</p>}
        {state === "small" && (
          <p className="sm-line warm">0.01 lot needs at least {money(result.minRisk)} at this stop. Raise your risk or tighten the stop.</p>
        )}

        {ready && (
          <>
            <div className="sm-rr" aria-hidden="true">
              <div className="sm-rr-risk" style={{ flexGrow: 1 }}>Stop {"\u2212"}{money(result.real)}</div>
              <div className="sm-rr-reward" style={{ flexGrow: rr }}>Target +{money(result.target)}</div>
            </div>

            <div className="sm-metrics">
              <div>
                <span>Stop-loss</span>
                <b>{trim(stop)} pips</b>
                <em>{isGold ? move(stop) : "\u00A0"}</em>
              </div>
              <div>
                <span>Take-profit</span>
                <b>{trim(result.tpPips)} pips</b>
                <em>{isGold ? move(result.tpPips) : "\u00A0"}</em>
              </div>
              <div>
                <span>Reward</span>
                <b>+{money(result.target)}</b>
                <em>at 1:{rr}</em>
              </div>
            </div>

            <p className="sm-note">
              {rounded
                ? `Rounded down so you risk ${money(result.real)}, not more than ${money(riskNum)}.`
                : `Exact fit. You risk ${money(result.real)}.`}
            </p>
          </>
        )}
      </div>

      {/* contract */}
      <div className="sm-contract">
        <div className="sm-contract-row">
          <label htmlFor="sm-pv">Pip value per 1.0 lot</label>
          <div className="sm-pv">
            <i>$</i>
            <input
              id="sm-pv" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
              value={pipInput} onChange={(e) => setPipVal(e.target.value)}
              onFocus={selectAll} onKeyDown={onEnter}
            />
          </div>
        </div>
        <p>{ins.hint} Confirm against your broker's contract specs.</p>
      </div>
    </section>
  );
}

// ---------- activity ----------
function ContributionGraph() {
  const [weeks, setWeeks] = useState([]);
  const [sel, setSel] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const load = () => setWeeks(buildContributionWeeks(readHistory(), 26));
    load();
    const onStorage = (e) => { if (!e || e.key === HISTORY_KEY) load(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // start scrolled to today (the right edge)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [weeks.length]);

  const stats = useMemo(() => {
    let green = 0, red = 0, best = null, total = 0;
    weeks.forEach((w) => w.forEach((d) => {
      if (!d.entry) return;
      const n = d.entry.net || 0;
      total += n;
      if (n > 0) green++;
      if (n < 0) red++;
      if (best === null || n > best) best = n;
    }));
    return { green, red, best, total };
  }, [weeks]);

  const picked = useMemo(() => {
    if (!sel) return null;
    for (const w of weeks) for (const d of w) if (d.date === sel) return d;
    return null;
  }, [sel, weeks]);

  return (
    <div>
      <div className="sm-gh-stats">
        <div><b className="pos">{stats.green}</b><span>Green days</span></div>
        <div><b className="neg">{stats.red}</b><span>Red days</span></div>
        <div><b>{stats.best === null ? "\u2013" : signed(stats.best)}</b><span>Best day</span></div>
        <div>
          <b className={stats.total > 0 ? "pos" : stats.total < 0 ? "neg" : ""}>{signed(stats.total)}</b>
          <span>6 months</span>
        </div>
      </div>

      <div className="sm-gh-wrap" ref={scrollRef}>
        <div className="sm-gh-body">
          <div className="sm-gh-days" aria-hidden="true">
            {["M", "", "W", "", "F"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div>
            <div className="sm-gh-months" aria-hidden="true">
              {weeks.map((w, wi) => {
                const show = wi === 0 || w[0].month !== weeks[wi - 1][0].month;
                return <span key={wi}>{show ? MONTHS[w[0].month] : ""}</span>;
              })}
            </div>
            <div className="sm-gh-grid">
              {weeks.map((week, wi) => (
                <div key={wi} className="sm-gh-col">
                  {week.map((day) => (
                    <button
                      key={day.date} type="button"
                      className={"sm-gh-cell" + (sel === day.date ? " sel" : "")}
                      disabled={day.isFuture}
                      aria-label={day.entry ? `${prettyDate(day.date)}: ${day.entry.net >= 0 ? "+" : ""}${day.entry.net}` : `${prettyDate(day.date)}: no entry`}
                      title={day.entry ? `${day.date}: ${day.entry.net >= 0 ? "+" : ""}${day.entry.net}` : day.date}
                      style={{ background: cellColor(day) }}
                      onClick={() => setSel(sel === day.date ? null : day.date)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sm-gh-foot">
        <div className="sm-gh-pick" aria-live="polite">
          {picked
            ? picked.entry
              ? <><b>{prettyDate(picked.date)}</b><span className={picked.entry.net > 0 ? "pos" : picked.entry.net < 0 ? "neg" : ""}>{(picked.entry.net > 0 ? "+" : picked.entry.net < 0 ? "\u2212" : "") + money(picked.entry.net || 0)}</span></>
              : <><b>{prettyDate(picked.date)}</b><span>No journal entry</span></>
            : <span>Tap a day for its result</span>}
        </div>
        <div className="sm-gh-legend">
          <span>Loss</span>
          <i style={{ background: "#e2665f" }} />
          <i style={{ background: "var(--cell-empty)" }} />
          <i style={{ background: "#56c46f" }} />
          <i style={{ background: "#1e8a3c" }} />
          <span>Win</span>
        </div>
      </div>
    </div>
  );
}

// ---------- page ----------
export default function Summit({ onBack } = {}) {
  const theme = useTheme();
  const [balance, setBalance] = useState(500);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(KEY));
      if (!isNaN(saved)) setBalance(saved);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const commit = (v) => {
    const next = Math.max(0, v);
    if (levelOf(next) > levelOf(balance)) {
      setToast("Camp " + (levelOf(next) + 1) + " reached");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([120, 60, 240]);
    }
    setBalance(next);
    try { localStorage.setItem(KEY, String(next)); } catch (err) {}
  };

  const startEdit = () => { setInput(String(balance)); setEditing(true); };
  const saveEdit = () => {
    const v = parseFloat(input);
    if (!isNaN(v)) commit(v);
    setEditing(false);
  };

  const current = levelOf(balance);
  const camp = LEVELS[current];
  const calc = useCalc(camp[1]);
  const atTop = current === 9;
  const nextCap = atTop ? null : LEVELS[current + 1][0];
  const pct = atTop
    ? 100
    : Math.max(0, Math.min(100, ((balance - camp[0]) / (nextCap - camp[0])) * 100));

  return (
    <div className="sm" data-theme={theme}>
      <style>{css}</style>

      <div className="sm-wrap">
        <header className="sm-top">
          <div className="sm-top-side">
            {typeof onBack === "function" && (
              <button type="button" onClick={onBack} className="sm-back">{"\u2190"} Back</button>
            )}
          </div>
          <h1>The Summit Climb</h1>
          <div className="sm-top-side" />
        </header>

        <div className="sm-grid">
          {/* balance + mountain */}
          <div className="sm-a-hero">
            <section className="sm-hero">
              <div className="sm-hero-head">
                <span>Account balance</span>
                {!editing && <button type="button" className="sm-pill" onClick={startEdit}>Edit balance</button>}
              </div>

              {editing ? (
                <div className="sm-hero-edit">
                  <input
                    type="number" min="0" step="0.01" autoFocus value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                    aria-label="Current balance"
                  />
                  <button type="button" className="sm-save" onClick={saveEdit}>Save</button>
                  <button type="button" className="sm-cancel" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="sm-hero-top">
                    <div>
                      <div className="sm-hero-num"><DimMoney text={money(balance)} /></div>
                      <div className="sm-hero-of">Camp {current + 1} of 10</div>
                    </div>
                    <Ring pct={pct} met={atTop} />
                  </div>

                  <div className="sm-chips">
                    <span className="sm-chip">{"\u2197"} {Math.round(pct)}% to next camp</span>
                    <span className="sm-chip">{atTop ? "Summit reached" : fm(nextCap - balance) + " to go"}</span>
                  </div>

                  <div className="sm-bar"><div className={`sm-fill${atTop ? " met" : ""}`} style={{ width: pct + "%" }} /></div>
                  <div className="sm-hero-sub">
                    {atTop
                      ? "You are at the summit. Protect it."
                      : `Camp ${current + 2} unlocks at ${fm(nextCap)}.`}
                  </div>
                </>
              )}

              <div className="sm-mount"><Mountain balance={balance} /></div>
            </section>
          </div>

          {/* position sizer */}
          <div className="sm-a-calc">
            <Sizer calc={calc} balance={balance} campRisk={camp[1]} />
          </div>

          {/* camp rules */}
          <div className="sm-a-rules">
            <h2 className="sm-section">Your rules at this camp<span className="sub">Camp {current + 1}</span></h2>
            <div className="sm-rules">
              <div className="sm-rule"><div className="l">Camp risk</div><div className="v neg">{fm(camp[1])}</div></div>
              <div className="sm-rule"><div className="l">Camp target</div><div className="v pos">{fm(camp[2])}</div></div>
              <div className="sm-rule"><div className="l">Active risk</div><div className="v">{fm(calc.riskNum)}</div></div>
            </div>
          </div>

          {/* activity */}
          <div className="sm-a-activity">
            <h2 className="sm-section">Trading activity<span className="sub">Last 6 months, from your journal</span></h2>
            <section className="sm-card">
              <ContributionGraph />
            </section>
          </div>

          {/* all camps */}
          <div className="sm-a-camps">
            <h2 className="sm-section">All camps<span className="sub">Your route to the top</span></h2>
            <div className="sm-camps">
              {LEVELS.map((r, k) => {
                const state = k < current ? "done" : k === current ? "now" : "locked";
                return (
                  <div key={k} className={`sm-camp ${state}`}>
                    <div className="sm-camp-badge">{state === "done" ? "\u2713" : k === 9 ? "🏔️" : k + 1}</div>
                    <div className="sm-camp-main">
                      <div className="sm-camp-title">
                        {fm(r[0])}{k === 9 ? "+" : ""}
                        {state === "now" && <em>You are here</em>}
                      </div>
                      <div className="sm-camp-meta">
                        <span>Risk {fm(r[1])}</span>
                        <span>Target {fm(r[2])}</span>
                      </div>
                    </div>
                    {state === "locked" && k === current + 1 && <div className="sm-camp-next">{fm(r[0] - balance)} away</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="sm-toast" role="status">
          <span>🏔️</span> {toast}
        </div>
      )}
    </div>
  );
}

// ---------- styles ----------
const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.sm{
/* ===== DARK: obsidian navy / champagne gold (same tokens as Session) ===== */
--bg-grad:linear-gradient(180deg,#0c1124 0%,#080b17 42%,#04060d 100%);
--surface:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 42%),linear-gradient(160deg,rgba(26,34,58,.86),rgba(11,15,29,.94));
--surface-2:rgba(255,255,255,.055);
--surface-3:rgba(255,255,255,.09);
--border:rgba(190,205,255,.10);
--border-strong:rgba(190,205,255,.18);
--text:#f5f7fc; --muted:#8b94ad;
--amber:#e8c97a; --amber-dim:rgba(232,201,122,.16);
--accent-text:#f1d98f;
--teal:#34e0a1; --rose:#ff6b7d;
--on-accent:#1b1407;
--focus-ring:#e8c97a;
--orb-1:rgba(232,201,122,.13); --orb-2:rgba(64,104,255,.20); --orb-3:rgba(150,170,255,.07);
--hero:linear-gradient(155deg,#25356a 0%,#16224a 48%,#0a1028 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.16) inset,0 30px 60px -26px rgba(0,0,0,.95),0 0 40px -10px rgba(232,201,122,.12);
--hero-ink:#0a1028;
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--glow-amber:rgba(232,201,122,.30);
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--cell-empty:rgba(190,205,255,.10); --cell-future:rgba(190,205,255,.04); --cell-flat:rgba(190,205,255,.26);
--r-card:26px; --r-input:14px; --r-pill:999px;
--cell:12px;

position:relative;box-sizing:border-box;min-height:100vh;
background:var(--bg-grad);background-attachment:fixed;
color:var(--text);font:15px/1.5 'Plus Jakarta Sans','Inter',system-ui,sans-serif;
padding:calc(18px + env(safe-area-inset-top,0px)) 14px calc(60px + env(safe-area-inset-bottom,0px));
-webkit-font-smoothing:antialiased;overflow-x:clip;
-webkit-tap-highlight-color:transparent;
}
.sm[data-theme="light"]{
--bg-grad:linear-gradient(180deg,#d6e2f7 0%,#bfd0ee 50%,#a9bee4 100%);
--surface:linear-gradient(160deg,rgba(255,255,255,.80),rgba(224,235,252,.58));
--surface-2:rgba(255,255,255,.62);
--surface-3:rgba(255,255,255,.85);
--border:rgba(30,60,120,.13);
--border-strong:rgba(30,60,120,.22);
--text:#10214a; --muted:#5d7099;
--amber:#e9a92a; --amber-dim:rgba(233,169,42,.28);
--accent-text:#1f4a94;
--teal:#0b8f50; --rose:#d63c33;
--on-accent:#2b1d00;
--focus-ring:#2f6fc4;
--orb-1:rgba(255,255,255,.9); --orb-2:rgba(90,140,230,.42); --orb-3:rgba(255,255,255,.55);
--hero:linear-gradient(155deg,#2c5c9c 0%,#1b4180 50%,#10284f 100%);
--hero-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 28px 54px -24px rgba(16,40,90,.7);
--hero-ink:#10284f;
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--glow-amber:rgba(233,169,42,.42);
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--cell-empty:rgba(16,33,74,.11); --cell-future:rgba(16,33,74,.05); --cell-flat:rgba(16,33,74,.22);
}
.sm::before{
content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:
radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);
}
.sm *{box-sizing:border-box;margin:0}
.sm button{font-family:inherit;-webkit-appearance:none;appearance:none}
.sm input{font-family:inherit}
.sm :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.sm ::selection{background:var(--amber);color:var(--on-accent)}
.sm-wrap{position:relative;z-index:1;max-width:560px;margin:0 auto}
.sm-dim{opacity:.5}

/* header: [back] [centered title] [spacer] */
.sm-top{display:grid;grid-template-columns:84px 1fr 84px;align-items:center;gap:8px;margin-bottom:18px}
.sm-top-side{display:flex}
.sm-top h1{text-align:center;font-weight:800;font-size:clamp(20px,5.6vw,30px);letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.sm[data-theme="dark"] .sm-top h1{
background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;padding:0 .14em;
}
.sm-back{background:var(--btn);color:var(--on-accent);border:none;border-radius:var(--r-pill);padding:10px 15px;min-height:40px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px -8px var(--glow-amber);white-space:nowrap}

/* layout: one column on phones, two on tablets */
.sm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:26px;
grid-template-areas:"hero" "calc" "rules" "activity" "camps"}
.sm-a-hero{grid-area:hero;min-width:0}
.sm-a-calc{grid-area:calc;min-width:0}
.sm-a-rules{grid-area:rules;min-width:0}
.sm-a-activity{grid-area:activity;min-width:0}
.sm-a-camps{grid-area:camps;min-width:0}

/* centered section titles */
.sm-section{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;font-weight:700;font-size:19px;letter-spacing:-.02em;margin:0 0 14px}
.sm-section .sub{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0}

/* hero */
.sm-hero{position:relative;overflow:hidden;padding:20px 20px 0;border-radius:30px;border:1px solid rgba(255,255,255,.3);background:var(--hero);color:#fff;box-shadow:var(--hero-shadow)}
.sm[data-theme="dark"] .sm-hero{border-color:rgba(232,201,122,.30)}
.sm-hero::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(420px 220px at 100% -10%,rgba(255,255,255,.28),transparent 65%)}
.sm[data-theme="dark"] .sm-hero::after{background:radial-gradient(420px 220px at 100% -10%,rgba(232,201,122,.22),transparent 65%)}
.sm-hero>*{position:relative;z-index:1}
.sm-hero-head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:500;color:rgba(255,255,255,.85);margin-bottom:10px;min-height:30px}
.sm-pill{color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:var(--r-pill);padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer}
.sm-pill:hover{background:rgba(255,255,255,.26)}
.sm-hero-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.sm-hero-num{font-size:clamp(34px,10vw,46px);font-weight:700;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums}
.sm-hero-of{font-size:14px;color:rgba(255,255,255,.75);font-weight:500;margin-top:6px}
.sm-ring{flex-shrink:0;filter:drop-shadow(0 6px 14px rgba(5,20,60,.35))}
.sm-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.sm-chip{font-size:12px;font-weight:600;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);border-radius:var(--r-pill);padding:5px 11px;font-variant-numeric:tabular-nums}
.sm-bar{height:10px;border-radius:var(--r-pill);background:rgba(255,255,255,.22);overflow:hidden}
.sm-fill{height:100%;border-radius:var(--r-pill);background:#fff;transition:width .35s ease}
.sm-fill.met{background:#8dffc0}
.sm-hero-sub{font-size:12px;color:rgba(255,255,255,.85);margin:10px 0 6px}
.sm-hero-edit{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.sm-hero-edit input{flex:1;min-width:0;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.32);border-radius:12px;color:#fff;padding:11px 12px;font:inherit;font-size:16px;font-variant-numeric:tabular-nums}
.sm-save{border:none;background:#fff;color:var(--hero-ink);border-radius:12px;padding:11px 16px;font-size:13px;font-weight:700;cursor:pointer}
.sm-cancel{border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.14);color:#fff;border-radius:12px;padding:11px 14px;font-size:13px;cursor:pointer}
.sm-mount{margin:8px -20px 0}
.sm-mount svg{display:block;width:100%;height:auto}
.sm-pulse{transform-box:fill-box;transform-origin:center;animation:sm-pulse 2s ease-in-out infinite}
@keyframes sm-pulse{0%,100%{transform:scale(1);opacity:.28}50%{transform:scale(1.5);opacity:.08}}

/* ===== position sizer ===== */
.sm-calc{position:relative;display:flex;flex-direction:column;gap:14px;padding:18px 16px 16px;border-radius:30px;background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card)}
.sm-calc::before{content:"";position:absolute;left:28px;right:28px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,var(--amber),transparent);opacity:.8;pointer-events:none}
.sm-calc-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 4px}
.sm-calc-title h2{font-size:19px;font-weight:800;letter-spacing:-.02em}
.sm-calc-title span{font-size:11.5px;color:var(--muted);font-weight:500;text-align:right}

/* segmented controls */
.sm-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;border-radius:var(--r-pill);background:var(--surface-2);border:1px solid var(--border)}
.sm-seg button{min-height:42px;border:none;border-radius:var(--r-pill);background:transparent;color:var(--muted);font-size:13.5px;font-weight:700;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.sm-seg button:hover{color:var(--text)}
.sm-seg button.on{background:var(--btn);color:var(--on-accent);box-shadow:0 8px 18px -8px var(--glow-amber)}
.sm-seg.small button{min-height:36px;font-size:12.5px;font-variant-numeric:tabular-nums}

/* input panels */
.sm-panel{display:flex;flex-direction:column;gap:12px;padding:14px 14px 14px;border-radius:22px;background:var(--surface-2);border:1px solid var(--border);transition:border-color .15s,box-shadow .15s}
.sm-panel:focus-within{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-dim)}
.sm-panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:0 2px}
.sm-panel-head label{font-size:12.5px;font-weight:700;color:var(--muted)}
.sm-panel-head span{font-size:11.5px;font-weight:600;color:var(--accent-text);font-variant-numeric:tabular-nums}
.sm-panel-body{display:flex;align-items:center;gap:10px}
.sm-big{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;padding:0 4px}
.sm-big.center{justify-content:center}
.sm-big i{font-style:normal;font-size:20px;font-weight:700;color:var(--muted)}
.sm-big input{flex:1;min-width:0;width:100%;background:transparent;border:none;color:var(--text);font-size:clamp(32px,10vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1.1;padding:2px 0;font-variant-numeric:tabular-nums;-webkit-appearance:none;appearance:none;border-radius:0}
.sm-big.center input{text-align:right;flex:0 1 auto;width:4.4ch}
.sm-big.center i{font-size:15px}
.sm-big input:focus,.sm-big input:focus-visible{outline:none}
.sm-big input::placeholder{color:var(--muted);opacity:.45}

.sm-tag{flex-shrink:0;min-height:40px;padding:0 14px;border-radius:var(--r-pill);border:1px solid var(--border-strong);background:transparent;color:var(--accent-text);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;transition:background .15s,color .15s}
.sm-tag.on{background:var(--amber-dim);border-color:var(--amber)}
.sm-tag:hover{background:var(--amber-dim)}

.sm-step{flex-shrink:0;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border-strong);background:var(--surface-3);color:var(--text);cursor:pointer;transition:transform .08s,background .15s}
.sm-step:hover{background:var(--amber-dim)}
.sm-step:active{transform:scale(.92)}

.sm-quick{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -2px;padding:2px}
.sm-quick::-webkit-scrollbar{display:none}
.sm-qp{flex:1 0 auto;min-width:48px;min-height:42px;padding:0 14px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-3);color:var(--text);font-size:14px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;transition:transform .08s,background .15s}
.sm-qp:active{transform:scale(.93)}
.sm-qp.on{background:var(--btn);color:var(--on-accent);border-color:transparent;box-shadow:0 8px 18px -8px var(--glow-amber)}

.sm-rrsel{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px}
.sm-rrsel>span{font-size:12.5px;font-weight:700;color:var(--muted);white-space:nowrap}
.sm-rrsel .sm-seg{flex:1;max-width:280px}

/* result: the one memorable thing */
.sm-result{position:relative;overflow:hidden;padding:16px 14px 14px;border-radius:26px;background:var(--hero);color:#fff;border:1px solid rgba(255,255,255,.28);box-shadow:var(--hero-shadow)}
.sm[data-theme="dark"] .sm-result{border-color:rgba(232,201,122,.30)}
.sm-result::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(360px 200px at 50% -20%,rgba(255,255,255,.22),transparent 68%)}
.sm[data-theme="dark"] .sm-result::after{background:radial-gradient(360px 200px at 50% -20%,rgba(232,201,122,.24),transparent 68%)}
.sm-result>*{position:relative;z-index:1}
.sm-result-top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 4px}
.sm-result-label{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.8)}
.sm-copy{min-height:34px;padding:0 14px;border-radius:var(--r-pill);border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s,color .15s}
.sm-copy:hover:not(:disabled){background:rgba(255,255,255,.26)}
.sm-copy:disabled{opacity:.45;cursor:default}
.sm-copy.done{background:#8dffc0;border-color:#8dffc0;color:#06361d}
.sm-lot{display:flex;align-items:baseline;justify-content:center;gap:10px;width:100%;padding:10px 0 6px;background:none;border:none;color:inherit;cursor:pointer}
.sm-lot:disabled{cursor:default}
.sm-lot:active:not(:disabled){transform:scale(.985)}
.sm-lot-num{font-size:clamp(68px,23vw,104px);font-weight:800;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums;animation:sm-pop .16s ease-out}
.sm[data-theme="dark"] .sm-result.ready .sm-lot-num{background:linear-gradient(180deg,#ffffff 30%,#f1d98f 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;padding:0 .04em}
.sm-lot-unit{font-size:16px;font-weight:700;color:rgba(255,255,255,.7)}
.sm-result.idle .sm-lot-num,.sm-result.small .sm-lot-num{opacity:.28;animation:none}
@keyframes sm-pop{from{transform:scale(.95);opacity:.55}to{transform:scale(1);opacity:1}}
.sm-line{text-align:center;font-size:12.5px;color:rgba(255,255,255,.82);padding:0 8px 6px}
.sm-line.warm{color:#f6e0a2}

.sm-rr{display:flex;height:38px;margin:10px 0 12px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.16)}
.sm-rr>div{display:flex;align-items:center;justify-content:center;min-width:0;padding:0 8px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums;transition:flex-grow .25s ease}
.sm-rr-risk{position:relative;background:linear-gradient(180deg,rgba(255,107,125,.55),rgba(255,107,125,.30));color:#ffe9ec}
.sm-rr-risk::after{content:"";position:absolute;right:0;top:0;bottom:0;width:2px;background:#fff;opacity:.85}
.sm-rr-reward{background:linear-gradient(180deg,rgba(52,224,161,.52),rgba(52,224,161,.28));color:#e6fff5}

.sm-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sm-metrics>div{display:flex;flex-direction:column;align-items:center;gap:1px;padding:10px 4px;border-radius:16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.20)}
.sm-metrics span{font-size:11px;font-weight:600;color:rgba(255,255,255,.75)}
.sm-metrics b{font-size:15px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
.sm-metrics em{font-style:normal;font-size:10.5px;font-weight:600;color:rgba(255,255,255,.7);font-variant-numeric:tabular-nums;white-space:nowrap}
.sm-note{text-align:center;font-size:12px;color:rgba(255,255,255,.78);margin-top:12px;padding:0 6px}

.sm-contract{display:flex;flex-direction:column;gap:6px;padding:0 4px}
.sm-contract-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sm-contract-row label{font-size:12.5px;font-weight:700;color:var(--muted)}
.sm-pv{display:flex;align-items:center;gap:4px;min-height:40px;padding:0 12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);transition:border-color .15s,box-shadow .15s}
.sm-pv:focus-within{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-dim)}
.sm-pv i{font-style:normal;font-weight:700;color:var(--muted);font-size:14px}
.sm-pv input{width:62px;background:transparent;border:none;color:var(--text);font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;padding:0;text-align:right}
.sm-pv input:focus,.sm-pv input:focus-visible{outline:none}
.sm-contract p{font-size:11.5px;line-height:1.45;color:var(--muted)}

/* rules tiles */
.sm-rules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sm-rule{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:20px;padding:14px 8px;text-align:center;box-shadow:var(--shadow-card)}
.sm-rule .l{font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:6px}
.sm-rule .v{font-size:22px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.sm-rule .v.pos{color:var(--teal)}
.sm-rule .v.neg{color:var(--rose)}

/* glass card */
.sm-card{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:var(--r-card);padding:16px;box-shadow:var(--shadow-card)}

/* activity graph */
.sm-gh-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.sm-gh-stats>div{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:10px 4px;text-align:center;min-width:0}
.sm-gh-stats b{display:block;font-size:15px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
.sm-gh-stats b.pos,.sm-gh-pick .pos{color:var(--teal)}
.sm-gh-stats b.neg,.sm-gh-pick .neg{color:var(--rose)}
.sm-gh-stats span{font-size:10.5px;color:var(--muted);font-weight:600}
.sm-gh-wrap{overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}
.sm-gh-body{display:flex;gap:6px;width:max-content}
.sm-gh-days{display:flex;flex-direction:column;gap:3px;padding-top:17px}
.sm-gh-days span{height:var(--cell);font-size:9px;line-height:var(--cell);color:var(--muted);font-weight:600}
.sm-gh-months{display:flex;gap:3px;height:14px;margin-bottom:3px}
.sm-gh-months span{width:var(--cell);font-size:9.5px;line-height:14px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:visible}
.sm-gh-grid{display:flex;gap:3px;width:max-content}
.sm-gh-col{display:flex;flex-direction:column;gap:3px}
.sm-gh-cell{width:var(--cell);height:var(--cell);border-radius:3px;border:none;padding:0;cursor:pointer;transition:transform .08s}
.sm-gh-cell:disabled{cursor:default}
.sm-gh-cell.sel{outline:2px solid var(--amber);outline-offset:1px}
.sm-gh-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px}
.sm-gh-pick{display:flex;align-items:baseline;gap:8px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.sm-gh-pick b{color:var(--text);font-weight:700}
.sm-gh-pick span{font-weight:700}
.sm-gh-legend{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)}
.sm-gh-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}

/* camp cards */
.sm-camps{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.sm-camp{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:22px;background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card)}
.sm-camp-badge{flex-shrink:0;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:15px;font-weight:800;background:var(--surface-2);border:1px solid var(--border);color:var(--muted)}
.sm-camp-main{flex:1;min-width:0}
.sm-camp-title{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sm-camp-title em{font-style:normal;font-size:11px;font-weight:800;color:var(--on-accent);background:var(--btn);border-radius:var(--r-pill);padding:2px 9px}
.sm-camp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
.sm-camp-next{font-size:11.5px;font-weight:700;color:var(--accent-text);white-space:nowrap}
.sm-camp.done{opacity:.72}
.sm-camp.done .sm-camp-badge{background:var(--btn);border-color:transparent;color:var(--on-accent)}
.sm-camp.locked{opacity:.6}
.sm-camp.now{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber) inset,0 0 28px 2px var(--glow-amber)}
.sm-camp.now .sm-camp-badge{background:var(--amber-dim);border-color:var(--amber);color:var(--accent-text)}

/* camp-up toast */
.sm-toast{position:fixed;left:50%;top:calc(18px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--r-pill);background:var(--btn);color:var(--on-accent);font-size:14px;font-weight:800;box-shadow:0 18px 36px -12px var(--glow-amber);animation:sm-toast .35s cubic-bezier(.2,1.2,.4,1)}
@keyframes sm-toast{from{opacity:0;transform:translate(-50%,-14px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}

/* ===== small phones ===== */
@media (max-width:420px){
.sm{padding-left:12px;padding-right:12px}
.sm-top{grid-template-columns:72px 1fr 72px}
.sm-gh-stats b{font-size:13.5px}
.sm-rule .v{font-size:19px}
.sm-calc{padding:16px 12px 14px;border-radius:28px}
.sm-calc-title span{display:none}
.sm-metrics b{font-size:14px}
.sm-rr>div{font-size:11px;padding:0 5px}
}

/* ===== large phones and portrait tablets ===== */
@media (min-width:600px){
.sm{padding-left:24px;padding-right:24px;--cell:13px}
.sm-wrap{max-width:680px}
.sm-calc{padding:22px 20px 18px}
.sm-camps{grid-template-columns:repeat(2,minmax(0,1fr))}
}

/* ===== landscape tablets: two columns, sizer stays in view ===== */
@media (min-width:820px){
.sm{--cell:14px}
.sm-wrap{max-width:1080px}
.sm-top{grid-template-columns:110px 1fr 110px;margin-bottom:24px}
.sm-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:22px;row-gap:26px;align-items:start;
grid-template-areas:"hero calc" "rules calc" "activity activity" "camps camps"}
.sm-a-calc{position:sticky;top:18px;align-self:start}
.sm-camps{grid-template-columns:repeat(2,minmax(0,1fr))}
.sm-gh-wrap{overflow-x:visible}
}
@media (min-width:1100px){
.sm-camps{grid-template-columns:repeat(3,minmax(0,1fr))}
}

@media (prefers-reduced-motion:reduce){
.sm-pulse,.sm-toast,.sm-lot-num{animation:none}
.sm-fill,.sm-rr>div{transition:none}
}
`;