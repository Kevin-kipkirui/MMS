import { useState, useEffect } from "react";

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
const HISTORY_KEY = "td_history"; // shared with session.jsx — do not rename on either side

function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function buildContributionWeeks(history, weeks = 26) {
  const byDate = {};
  history.forEach((h) => { byDate[h.date] = h; });

  const today = new Date();
today.setHours(0, 0, 0, 0);
  const endPad = 6 - today.getDay();
  const totalDays = weeks * 7;

  const days = [];
  for (let i = totalDays + endPad - 1; i >= -endPad; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    days.push({ date: key, entry: byDate[key] || null, isFuture: d > today });
  }
  const grid = [];
  for (let i = 0; i < days.length; i += 7) grid.push(days.slice(i, i + 7));
  return grid;
}

function cellColor(day) {
  if (!day || day.isFuture) return "rgba(16,33,74,.05)";
  if (!day.entry) return "rgba(16,33,74,.11)";
  const net = day.entry.net || 0;
  if (net > 0) return net > 300 ? "#1e8a3c" : net > 100 ? "#2fa24f" : "#56c46f";
  if (net < 0) return net < -300 ? "#a3201c" : net < -100 ? "#c9342c" : "#e2665f";
  return "rgba(16,33,74,.2)";
}

const fm = (n) => "$" + Math.round(n).toLocaleString();
const levelOf = (b) => LEVELS.reduce((acc, l, k) => (b >= l[0] ? k : acc), 0);
const POINTS = LEVELS.map((_, i) => [
  50 + i * 67,
  262 - Math.pow(i / 9, 1.15) * 205 - (i % 2 ? 6 : 0),
]);

const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.sm{
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
--hero:linear-gradient(155deg,#2c5c9c 0%,#1b4180 50%,#10284f 100%);
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--blur:blur(22px) saturate(150%);
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--hero-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 28px 54px -20px rgba(16,40,90,.7);
--serif:'Plus Jakarta Sans',system-ui,sans-serif;
--sans:'Plus Jakarta Sans',system-ui,sans-serif;

position:relative;box-sizing:border-box;
background:var(--bg-grad);background-attachment:fixed;
color:var(--text);font:15px/1.5 var(--sans);min-height:100vh;
padding:calc(18px + env(safe-area-inset-top,0px)) 14px calc(60px + env(safe-area-inset-bottom,0px));
-webkit-font-smoothing:antialiased;
}
.sm::before{
content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:
radial-gradient(620px 420px at 90% 4%,rgba(255,255,255,.9),transparent 70%),
radial-gradient(780px 540px at 2% 98%,rgba(90,140,230,.42),transparent 70%),
radial-gradient(420px 320px at 8% 22%,rgba(255,255,255,.55),transparent 70%);
}
.sm *{box-sizing:border-box;margin:0}
.sm-wrap{position:relative;z-index:1;max-width:900px;margin:auto}
.sm h1{font:800 clamp(28px,7vw,44px)/1.05 var(--serif);letter-spacing:-.03em;margin-bottom:16px}
.sm h2{font:700 19px var(--serif);letter-spacing:-.02em;margin-bottom:12px}
.sm section{
background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
border:1px solid var(--border);border-radius:26px;padding:18px;margin-bottom:14px;
box-shadow:var(--shadow-card);
}
.sm .mount{
padding:0;overflow:hidden;border-radius:30px;
background:var(--hero);border:1px solid rgba(255,255,255,.3);
box-shadow:var(--hero-shadow);
}
.sm .mount svg{display:block;width:100%;height:auto}
.sm label{display:block;color:var(--muted);font-size:12.5px;font-weight:500;margin-bottom:6px}
.sm input{
width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--border);
background:var(--surface-2);color:var(--text);font:inherit;font-variant-numeric:tabular-nums;
}
.sm input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.sm table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
.sm td,.sm th{padding:10px 6px;border-bottom:1px solid var(--border);text-align:right}
.sm tr:last-child td{border-bottom:none}
.sm td:first-child,.sm th:first-child{text-align:left}
.sm th{color:var(--muted);font-weight:500;font-size:12.5px}
.sm tr.done td{color:var(--muted)}
.sm tr.now td{color:var(--accent-text);font-weight:800;background:var(--amber-dim)}
.sm tr.now td:first-child{border-radius:12px 0 0 12px}
.sm tr.now td:last-child{border-radius:0 12px 12px 0}
.sm .scroll{overflow-x:auto}
.sm-back{
background:var(--btn);color:var(--on-accent);border:none;border-radius:999px;
padding:9px 16px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;
box-shadow:0 8px 18px -8px rgba(233,169,42,.5);
}
.sm-gh-wrap{overflow-x:auto;padding-bottom:4px}
.sm-gh-grid{display:flex;gap:3px;width:max-content}
.sm-gh-col{display:flex;flex-direction:column;gap:3px}
.sm-gh-cell{width:11px;height:11px;border-radius:3px}
.sm-gh-legend{display:flex;align-items:center;gap:4px;margin-top:10px;font-size:11px;color:var(--muted)}
.sm-gh-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
`;

function ContributionGraph() {
  const [weeks, setWeeks] = useState([]);

  useEffect(() => {
    setWeeks(buildContributionWeeks(readHistory(), 26));
    const onStorage = (e) => {
      if (!e || e.key === HISTORY_KEY) setWeeks(buildContributionWeeks(readHistory(), 26));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div>
      <div className="sm-gh-wrap">
        <div className="sm-gh-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="sm-gh-col">
              {week.map((day, di) => (
                <div
                  key={di}
                  className="sm-gh-cell"
                  title={day.entry ? `${day.date}: ${day.entry.net >= 0 ? "+" : ""}${day.entry.net}` : day.date}
                  style={{ background: cellColor(day) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="sm-gh-legend">
        <span>Loss</span>
        <i style={{ background: "#e2665f" }} />
        <i style={{ background: "rgba(16,33,74,.11)" }} />
        <i style={{ background: "#56c46f" }} />
        <i style={{ background: "#1e8a3c" }} />
        <span>Win</span>
      </div>
    </div>
  );
}

function Mountain({ balance }) {
  const i = levelOf(balance);
  const ridge = POINTS.map((p) => p.join(",")).join(" ");
  const shadow = POINTS.map((p) => `${p[0] + 10},${p[1] + 22}`).join(" ");
  const climbed = POINTS.slice(0, i + 1).map((p) => p.join(",")).join(" ");

  let f = 0;
  if (i < 9) {
    f = Math.max(0, Math.min(1, (balance - LEVELS[i][0]) / (LEVELS[i + 1][0] - LEVELS[i][0])));
  }
  const a = POINTS[i];
  const c = POINTS[Math.min(i + 1, 9)];
  const x = a[0] + (c[0] - a[0]) * f;
  const y = a[1] + (c[1] - a[1]) * f;
  const top = POINTS[9];

  return (
    <svg viewBox="0 0 700 300" role="img" aria-label="Mountain with ten camps">
      <polygon points={`0,300 0,270 ${ridge} 700,40 700,300`} fill="#0d2a55" />
      <polygon points={`0,300 0,285 ${shadow} 700,70 700,300`} fill="#173f78" opacity=".8" />
      <polyline points={ridge} fill="none" stroke="#3a5875" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      <polyline points={climbed} fill="none" stroke="#f8ce62" strokeWidth="3.5" strokeLinecap="round" />
      {POINTS.map((p, k) => (
        <g key={k}>
          <circle
            cx={p[0]}
            cy={p[1]}
            r={k <= i ? 7 : 5}
            fill={k <= i ? "#f8ce62" : "#10284f"}
            stroke={k === 9 ? "#f8ce62" : "#9cc8f8"}
            strokeWidth="2"
          />
          <text x={p[0]} y={p[1] + 24} textAnchor="middle" fontSize="11" fill="#c5d9f5">
            {k + 1}
          </text>
        </g>
      ))}
      <line x1={top[0]} y1={top[1] - 30} x2={top[0]} y2={top[1] - 6} stroke="#ffffff" strokeWidth="2" />
      <path d={`M${top[0]} ${top[1] - 30}v-16l14 5-14 5`} fill="#f8ce62" />
      <g transform={`translate(${x},${y})`}>
        <circle r="11" fill="#5ccf94" opacity=".25" />
        <circle cy="-9" r="4" fill="#eef3f7" />
        <path d="M0-5v10M-4 8L0 4L4 8" stroke="#eef3f7" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function Summit({ onBack } = {}) {
  const [balance, setBalance] = useState(500);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(KEY));
      if (!isNaN(saved)) setBalance(saved);
    } catch (e) {}
  }, []);

  const update = (e) => {
    const v = Math.max(0, parseFloat(e.target.value) || 0);
    setBalance(v);
    try {
      localStorage.setItem(KEY, String(v));
    } catch (err) {}
  };

  const current = levelOf(balance);

  return (
    <div className="sm">
      <style>{css}</style>
      <div className="sm-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <h1 style={{ marginBottom: 0 }}>The Summit Climb</h1>
          {typeof onBack === "function" && (
            <button
              type="button"
              onClick={onBack}
              className="sm-back"
            >
              ← Back
            </button>
          )}
        </div>

        <section className="mount">
          <Mountain balance={balance} />
        </section>

        <section>
          <label htmlFor="bal">Current balance ($)</label>
          <input id="bal" type="number" min="0" value={balance} onChange={update} />
        </section>

        <section>
          <h2>Trading activity</h2>
          <ContributionGraph />
        </section>

        <section>
          <h2>All camps</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Camp</th>
                  <th>Capital</th>
                  <th>Risk</th>
                  <th>Target</th>
                  <th>Lot</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((r, k) => (
                  <tr key={k} className={k < current ? "done" : k === current ? "now" : ""}>
                    <td>{k === 9 ? "🏔️ 10" : (k < current ? "✓ " : "") + (k + 1)}</td>
                    <td>
                      {fm(r[0])}
                      {k === 9 ? "+" : ""}
                    </td>
                    <td>{fm(r[1])}</td>
                    <td>{fm(r[2])}</td>
                    <td>{r[3].toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}