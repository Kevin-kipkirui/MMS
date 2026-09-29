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
  if (!day || day.isFuture) return "rgba(255,255,255,.05)";
  if (!day.entry) return "rgba(255,255,255,.10)";
  const net = day.entry.net || 0;
  if (net > 0) return net > 300 ? "#2ea043" : net > 100 ? "#3fb950" : "#56d364";
  if (net < 0) return net < -300 ? "#8b1a1a" : net < -100 ? "#b62324" : "#da3633";
  return "rgba(255,255,255,.16)";
}

const fm = (n) => "$" + Math.round(n).toLocaleString();
const levelOf = (b) => LEVELS.reduce((acc, l, k) => (b >= l[0] ? k : acc), 0);
const POINTS = LEVELS.map((_, i) => [
  50 + i * 67,
  262 - Math.pow(i / 9, 1.15) * 205 - (i % 2 ? 6 : 0),
]);

const css = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter+Tight:wght@400;600&display=swap');
.sm{--bg:#0e1a28;--panel:#152537;--line:#26405a;--snow:#eef3f7;--mute:#8fa5ba;--gold:#e8b84a;
--serif:'Fraunces',Georgia,serif;--sans:'Inter Tight',system-ui,sans-serif;
background:var(--bg);color:var(--snow);font:15px/1.5 var(--sans);min-height:100vh;padding:18px 14px 60px}
.sm *{box-sizing:border-box;margin:0}
.sm-wrap{max-width:900px;margin:auto}
.sm h1{font:800 clamp(30px,7vw,52px)/1 var(--serif);letter-spacing:-.02em;margin-bottom:16px}
.sm h2{font:600 20px var(--serif);margin-bottom:10px}
.sm section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
.sm .mount{padding:0;overflow:hidden;background:linear-gradient(#0b1622,#1a3450)}
.sm .mount svg{display:block;width:100%;height:auto}
.sm label{display:block;color:var(--mute);font-size:13px;margin-bottom:4px}
.sm input{width:100%;padding:10px;border-radius:9px;border:1px solid var(--line);background:#0e1a28;color:var(--snow);font:inherit}
.sm input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.sm table{width:100%;border-collapse:collapse;font-size:14px}
.sm td,.sm th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right}
.sm td:first-child,.sm th:first-child{text-align:left}
.sm th{color:var(--mute);font-weight:400}
.sm tr.done td{color:var(--mute)}
.sm tr.now td{color:var(--gold);font-weight:600}
.sm .scroll{overflow-x:auto}
.sm-gh-wrap{overflow-x:auto;padding-bottom:4px}
.sm-gh-grid{display:flex;gap:3px;width:max-content}
.sm-gh-col{display:flex;flex-direction:column;gap:3px}
.sm-gh-cell{width:11px;height:11px;border-radius:2px}
.sm-gh-legend{display:flex;align-items:center;gap:4px;margin-top:10px;font-size:11px;color:var(--mute)}
.sm-gh-legend i{width:11px;height:11px;border-radius:2px;display:inline-block}
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
        <i style={{ background: "#da3633" }} />
        <i style={{ background: "rgba(255,255,255,.10)" }} />
        <i style={{ background: "#56d364" }} />
        <i style={{ background: "#2ea043" }} />
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
      <polygon points={`0,300 0,270 ${ridge} 700,40 700,300`} fill="#10202f" />
      <polygon points={`0,300 0,285 ${shadow} 700,70 700,300`} fill="#183048" opacity=".8" />
      <polyline points={ridge} fill="none" stroke="#3a5875" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      <polyline points={climbed} fill="none" stroke="#e8b84a" strokeWidth="3.5" strokeLinecap="round" />
      {POINTS.map((p, k) => (
        <g key={k}>
          <circle
            cx={p[0]}
            cy={p[1]}
            r={k <= i ? 7 : 5}
            fill={k <= i ? "#e8b84a" : "#0e1a28"}
            stroke={k === 9 ? "#e8b84a" : "#4fb3bf"}
            strokeWidth="2"
          />
          <text x={p[0]} y={p[1] + 24} textAnchor="middle" fontSize="11" fill="#8fa5ba">
            {k + 1}
          </text>
        </g>
      ))}
      <line x1={top[0]} y1={top[1] - 30} x2={top[0]} y2={top[1] - 6} stroke="#eef3f7" strokeWidth="2" />
      <path d={`M${top[0]} ${top[1] - 30}v-16l14 5-14 5`} fill="#e8b84a" />
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
              style={{
                background: "#152537",
                border: "1px solid #26405a",
                color: "#eef3f7",
                borderRadius: "999px",
                padding: "8px 12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
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