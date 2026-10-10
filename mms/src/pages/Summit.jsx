import { useState, useEffect, useRef, useMemo } from "react";

const LEVELS = [
  [500, 40, 80, 0.08],
  [1000, 80, 160, 0.16],
  [2500, 200, 400, 0.4],
  [5000, 400, 800, 0.8],
  [10000, 800, 1600, 1.6],
  [25000, 1500, 3000, 3],
  [50000, 2500, 5000, 5],
  [100000, 4000, 8000, 8],
  [200000, 6000, 12000, 12],
  [300000, 9000, 18000, 18],
];

const KEY = "summitTracker.v2";
const HISTORY_KEY = "td_history"; // shared with session.jsx, do not rename on either side
const THEME_KEY = "td_theme"; // shared with session.jsx

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

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const money = (n) => "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fm = (n) => "$" + Math.round(n).toLocaleString();
const levelOf = (b) => LEVELS.reduce((acc, l, k) => (b >= l[0] ? k : acc), 0);

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

function ContributionGraph() {
  const [weeks, setWeeks] = useState([]);
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

  return (
    <div>
      <div className="sm-gh-stats">
        <div><b className="pos">{stats.green}</b><span>Green days</span></div>
        <div><b className="neg">{stats.red}</b><span>Red days</span></div>
        <div><b>{stats.best === null ? "–" : (stats.best >= 0 ? "+" : "\u2212") + money(stats.best)}</b><span>Best day</span></div>
        <div>
          <b className={stats.total > 0 ? "pos" : stats.total < 0 ? "neg" : ""}>
            {(stats.total > 0 ? "+" : stats.total < 0 ? "\u2212" : "") + money(stats.total)}
          </b>
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
                    <div
                      key={day.date}
                      className="sm-gh-cell"
                      title={day.entry ? `${day.date}: ${day.entry.net >= 0 ? "+" : ""}${day.entry.net}` : day.date}
                      style={{ background: cellColor(day) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
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
              <button type="button" onClick={onBack} className="sm-back">← Back</button>
            )}
          </div>
          <h1>The Summit Climb</h1>
          <div className="sm-top-side" />
        </header>

        {/* hero: balance + mountain in one scene */}
        <section className="sm-hero">
          <div className="sm-hero-head">
            <span>Account balance</span>
            {!editing && <button className="sm-pill" onClick={startEdit}>edit balance</button>}
          </div>

          {editing ? (
            <div className="sm-hero-edit">
              <input
                type="number" min="0" step="0.01" autoFocus value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                aria-label="Current balance"
              />
              <button className="sm-save" onClick={saveEdit}>Save</button>
              <button className="sm-cancel" onClick={() => setEditing(false)}>Cancel</button>
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

        {/* current camp rules */}
        <h2 className="sm-section">Your rules at this camp<span className="sub">camp {current + 1}</span></h2>
        <div className="sm-rules">
          <div className="sm-rule"><div className="l">Risk per trade</div><div className="v neg">{fm(camp[1])}</div></div>
          <div className="sm-rule"><div className="l">Target</div><div className="v pos">{fm(camp[2])}</div></div>
          <div className="sm-rule"><div className="l">Lot size</div><div className="v">{camp[3].toFixed(2)}</div></div>
        </div>

        <h2 className="sm-section">Trading activity<span className="sub">last 6 months, from your journal</span></h2>
        <section className="sm-card">
          <ContributionGraph />
        </section>

        <h2 className="sm-section">All camps<span className="sub">your route to the top</span></h2>
        <div className="sm-camps">
          {LEVELS.map((r, k) => {
            const state = k < current ? "done" : k === current ? "now" : "locked";
            return (
              <div key={k} className={`sm-camp ${state}`}>
                <div className="sm-camp-badge">{state === "done" ? "\u2713" : k === 9 ? "🏔️" : k + 1}</div>
                <div className="sm-camp-main">
                  <div className="sm-camp-title">
                    {fm(r[0])}{k === 9 ? "+" : ""}
                    {state === "now" && <em>you are here</em>}
                  </div>
                  <div className="sm-camp-meta">
                    <span>Risk {fm(r[1])}</span>
                    <span>Target {fm(r[2])}</span>
                    <span>Lot {r[3].toFixed(2)}</span>
                  </div>
                </div>
                {state === "locked" && k === current + 1 && <div className="sm-camp-next">{fm(r[0] - balance)} away</div>}
              </div>
            );
          })}
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
--border:rgba(190,205,255,.10);
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

position:relative;box-sizing:border-box;min-height:100vh;
background:var(--bg-grad);background-attachment:fixed;
color:var(--text);font:15px/1.5 'Plus Jakarta Sans','Inter',system-ui,sans-serif;
padding:calc(18px + env(safe-area-inset-top,0px)) 14px calc(60px + env(safe-area-inset-bottom,0px));
-webkit-font-smoothing:antialiased;overflow-x:clip;
}
.sm[data-theme="light"]{
--bg-grad:linear-gradient(180deg,#d6e2f7 0%,#bfd0ee 50%,#a9bee4 100%);
--surface:linear-gradient(160deg,rgba(255,255,255,.80),rgba(224,235,252,.58));
--surface-2:rgba(255,255,255,.62);
--border:rgba(30,60,120,.13);
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
.sm button{font-family:inherit}
.sm :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.sm ::selection{background:var(--amber);color:var(--on-accent)}
.sm-wrap{position:relative;z-index:1;max-width:560px;margin:0 auto}
.sm-dim{opacity:.5}

/* header: [back] [centered title] [spacer] */
.sm-top{display:grid;grid-template-columns:84px 1fr 84px;align-items:center;gap:8px;margin-bottom:16px}
.sm-top-side{display:flex}
.sm-top h1{text-align:center;font-weight:800;font-size:clamp(20px,5.6vw,30px);letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.sm[data-theme="dark"] .sm-top h1{
background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;padding:0 .14em;
}
.sm-back{background:var(--btn);color:var(--on-accent);border:none;border-radius:var(--r-pill);padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px -8px var(--glow-amber);white-space:nowrap}

/* centered section titles */
.sm-section{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;font-weight:700;font-size:19px;letter-spacing:-.02em;margin:32px 0 14px}
.sm-section .sub{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0}

/* hero */
.sm-hero{position:relative;overflow:hidden;padding:20px 20px 0;border-radius:30px;border:1px solid rgba(255,255,255,.3);background:var(--hero);color:#fff;box-shadow:var(--hero-shadow)}
.sm[data-theme="dark"] .sm-hero{border-color:rgba(232,201,122,.30)}
.sm-hero::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(420px 220px at 100% -10%,rgba(255,255,255,.28),transparent 65%)}
.sm[data-theme="dark"] .sm-hero::after{background:radial-gradient(420px 220px at 100% -10%,rgba(232,201,122,.22),transparent 65%)}
.sm-hero>*{position:relative;z-index:1}
.sm-hero-head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:500;color:rgba(255,255,255,.85);margin-bottom:10px}
.sm-pill{color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:var(--r-pill);padding:4px 11px;font-size:11.5px;font-weight:600;cursor:pointer}
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
.sm-hero-edit input{flex:1;min-width:0;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.32);border-radius:12px;color:#fff;padding:10px 12px;font:inherit;font-size:15px;font-variant-numeric:tabular-nums}
.sm-save{border:none;background:#fff;color:var(--hero-ink);border-radius:12px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer}
.sm-cancel{border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.14);color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;cursor:pointer}
.sm-mount{margin:8px -20px 0}
.sm-mount svg{display:block;width:100%;height:auto}
.sm-pulse{transform-box:fill-box;transform-origin:center;animation:sm-pulse 2s ease-in-out infinite}
@keyframes sm-pulse{0%,100%{transform:scale(1);opacity:.28}50%{transform:scale(1.5);opacity:.08}}

/* rules tiles */
.sm-rules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sm-rule{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:20px;padding:14px 10px;text-align:center;box-shadow:var(--shadow-card)}
.sm-rule .l{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px}
.sm-rule .v{font-size:22px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.sm-rule .v.pos{color:var(--teal)}
.sm-rule .v.neg{color:var(--rose)}

/* glass card */
.sm-card{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:var(--r-card);padding:16px;box-shadow:var(--shadow-card)}

/* activity graph */
.sm-gh-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.sm-gh-stats>div{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:10px 6px;text-align:center}
.sm-gh-stats b{display:block;font-size:15px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sm-gh-stats b.pos{color:var(--teal)}
.sm-gh-stats b.neg{color:var(--rose)}
.sm-gh-stats span{font-size:10.5px;color:var(--muted);font-weight:600}
.sm-gh-wrap{overflow-x:auto;padding-bottom:4px}
.sm-gh-body{display:flex;gap:6px;width:max-content}
.sm-gh-days{display:flex;flex-direction:column;gap:3px;padding-top:17px}
.sm-gh-days span{height:11px;font-size:9px;line-height:11px;color:var(--muted);font-weight:600}
.sm-gh-months{display:flex;gap:3px;height:14px;margin-bottom:3px}
.sm-gh-months span{width:11px;font-size:9.5px;line-height:14px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:visible}
.sm-gh-grid{display:flex;gap:3px;width:max-content}
.sm-gh-col{display:flex;flex-direction:column;gap:3px}
.sm-gh-cell{width:11px;height:11px;border-radius:3px}
.sm-gh-legend{display:flex;align-items:center;gap:4px;margin-top:10px;font-size:11px;color:var(--muted)}
.sm-gh-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}

/* camp cards */
.sm-camps{display:flex;flex-direction:column;gap:10px}
.sm-camp{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:22px;background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);box-shadow:var(--shadow-card)}
.sm-camp-badge{flex-shrink:0;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:15px;font-weight:800;background:var(--surface-2);border:1px solid var(--border);color:var(--muted)}
.sm-camp-main{flex:1;min-width:0}
.sm-camp-title{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sm-camp-title em{font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--on-accent);background:var(--btn);border-radius:var(--r-pill);padding:2px 8px}
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

@media (max-width:420px){
.sm-top{grid-template-columns:72px 1fr 72px}
.sm-gh-stats b{font-size:13.5px}
.sm-rule .v{font-size:19px}
}
@media (prefers-reduced-motion:reduce){
.sm-pulse,.sm-toast{animation:none}
.sm-fill{transition:none}
}
`;