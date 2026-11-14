import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { setShotUser, uploadShot, fetchShotUrl, removeShot } from "../lib/firebase";

/**
 * <Strategies />
 * Record any trading strategy through a form and read it back as a clean,
 * designed page. Same blue-glass / gold look as Session.
 *
 * Storage:   Supabase table "strategies" (text fields) + the same photo
 *            pipeline Session uses for trade photos (device cache + Firebase).
 * Navigation: <Strategies onBack={...} /> is rendered by App.jsx.
 */

// ---------- tiny utilities ----------
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
    /* quota / privacy mode */
  }
}
function newId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const DIRS = {
  buy: { l: "Buy", c: "buy" },
  sell: { l: "Sell", c: "sell" },
  both: { l: "Buy & Sell", c: "both" },
};
const SUGGEST = [
  "Trendlines", "Market structure", "Fibonacci", "Order blocks", "Imbalances",
  "Key levels", "Support / Resistance", "Moving averages", "Volume", "VWAP", "RSI", "Candlestick patterns",
];
const SIDE_OPTS = [
  ["any", "General"],
  ["buy", "Buy"],
  ["sell", "Sell"],
];

// ---------- data model ----------
const blank = () => ({
  id: newId(),
  title: "",
  tagline: "",
  market: "",
  direction: "both",
  tf: { bias: "", setup: "", entry: "" },
  win: { start: "", end: "", tz: "" },
  idea: { main: "", reasoning: "", images: [] },
  tools: [],
  setup: { text: "", images: [] },
  entry: { text: "", steps: [], images: [] },
  stop: { rule: "", explain: "", images: [] },
  tp: { rule: "", rr: "", explain: "", images: [] },
  risk: { perTrade: "", maxLoss: "", text: "" },
  psych: { rules: [], text: "" },
  notes: { text: "", images: [] },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function norm(s) {
  const b = blank();
  const x = s || {};
  return {
    ...b,
    ...x,
    tf: { ...b.tf, ...(x.tf || {}) },
    win: { ...b.win, ...(x.win || {}) },
    idea: { ...b.idea, ...(x.idea || {}) },
    tools: Array.isArray(x.tools) ? x.tools : [],
    setup: { ...b.setup, ...(x.setup || {}) },
    entry: { ...b.entry, ...(x.entry || {}) },
    stop: { ...b.stop, ...(x.stop || {}) },
    tp: { ...b.tp, ...(x.tp || {}) },
    risk: { ...b.risk, ...(x.risk || {}) },
    psych: { ...b.psych, ...(x.psych || {}) },
    notes: { ...b.notes, ...(x.notes || {}) },
  };
}

function allImages(s) {
  const out = [];
  [s.idea, s.setup, s.entry, s.stop, s.tp, s.notes].forEach((sec) => {
    (sec && sec.images ? sec.images : []).forEach((im) => out.push(im.id));
  });
  return out;
}

const sortItems = (a) => a.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
const fmtWindow = (w) => {
  const t = [w.start, w.end].filter(Boolean).join(" – ");
  return t ? t + (w.tz ? " " + w.tz : "") : "";
};
const rrNum = (v) => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : null;
};
const decs = (v) => {
  const p = String(v).split(".");
  return p[1] ? p[1].length : 0;
};

// ---------- images (device cache + Firebase, same pipeline as Session) ----------
const IMG_PREFIX = "td_stimg_";
const IMG_QUEUE = "td_stq";

function compressImage(file, maxDim = 1400, quality = 0.78) {
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

async function saveImg(id, dataUrl) {
  let local = false;
  try {
    await idbSet(IMG_PREFIX + id, dataUrl);
    local = true;
  } catch (e) {
    /* cloud only */
  }
  try {
    await uploadShot(id, dataUrl);
  } catch (e) {
    if (local) {
      const q = readLS(IMG_QUEUE, []);
      if (!q.includes(id)) writeLS(IMG_QUEUE, [...q, id]);
    }
  }
}
async function loadImg(id) {
  try {
    const v = await idbGet(IMG_PREFIX + id);
    if (v) return v;
  } catch (e) {
    /* ignore */
  }
  try {
    return await fetchShotUrl(id);
  } catch (e) {
    return null;
  }
}
async function dropImg(id) {
  try {
    await idbDel(IMG_PREFIX + id);
  } catch (e) {
    /* ignore */
  }
  try {
    await removeShot(id);
  } catch (e) {
    /* ignore */
  }
}
async function flushImgQueue() {
  const q = readLS(IMG_QUEUE, []);
  if (!q.length) return;
  const left = [];
  for (const id of q) {
    try {
      const v = await idbGet(IMG_PREFIX + id);
      if (v) await uploadShot(id, v);
    } catch (e) {
      left.push(id);
    }
  }
  writeLS(IMG_QUEUE, left);
}

// ---------- Supabase ----------
const TABLE = "strategies";
const lsKey = (uid) => "td_strategies_" + uid;
const DEL_KEY = "td_strategies_del";
const rowOf = (uid) => (s) => ({
  id: s.id,
  user_id: uid,
  data: s,
  updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
});
async function fetchRemote(uid) {
  const { data, error } = await supabase.from(TABLE).select("id,data,updated_at").eq("user_id", uid);
  if (error) throw error;
  return (data || []).map((r) => norm({ ...r.data, id: r.id }));
}

// ---------- icons ----------
const ICONS = {
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
  back: ["M15 18l-6-6 6-6"],
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  img: ["M3 5h18v14H3z", "M3 16l5-5 4 4 3-3 6 6"],
  up: ["M18 15l-6-6-6 6"],
  down: ["M6 9l6 6 6-6"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
};
function Ic({ n, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      {ICONS[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ---------- picture (loads from cache / cloud) ----------
function Pic({ id, cache, onOpen }) {
  const cached = cache && cache[id];
  const [src, setSrc] = useState(cached || null);
  const [miss, setMiss] = useState(false);
  useEffect(() => {
    if (cached) {
      setSrc(cached);
      setMiss(false);
      return undefined;
    }
    let live = true;
    setSrc(null);
    setMiss(false);
    loadImg(id).then((v) => {
      if (!live) return;
      if (v) setSrc(v);
      else setMiss(true);
    });
    return () => { live = false; };
  }, [id, cached]);
  if (miss) return <div className="st-pic ph">Image unavailable</div>;
  if (!src) return <div className="st-pic ph sk" aria-busy="true" />;
  return (
    <button type="button" className="st-pic" onClick={() => onOpen && onOpen(src)} aria-label="View image full size">
      <img src={src} alt="" loading="lazy" />
    </button>
  );
}

function Gallery({ images, cache, onOpen }) {
  const groups = [
    ["buy", "Buy example"],
    ["sell", "Sell example"],
    ["any", "Reference"],
  ]
    .map(([k, t]) => ({ k, t, list: (images || []).filter((i) => (i.side || "any") === k) }))
    .filter((g) => g.list.length);
  if (!groups.length) return null;
  const head = groups.length > 1 || groups[0].k !== "any";
  return (
    <div className="st-gal">
      {groups.map((g) => (
        <div key={g.k} className="st-galgrp">
          {head && <div className={"st-galhead " + g.k}>{g.t}</div>}
          <div className="st-galgrid">
            {g.list.map((im) => (
              <figure key={im.id} className="st-fig">
                <Pic id={im.id} cache={cache} onOpen={onOpen} />
                {im.cap ? <figcaption>{im.cap}</figcaption> : null}
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- read-only calculator ----------
function RiskCalc({ rr, perTrade }) {
  const [e, setE] = useState("");
  const [s, setS] = useState("");
  const [bal, setBal] = useState("");
  const [rp, setRp] = useState(perTrade || "1");
  const [r, setR] = useState(rr || "3");
  const en = parseFloat(e), sl = parseFloat(s), b = parseFloat(bal), p = parseFloat(rp), rv = parseFloat(r);
  const ok = isFinite(en) && isFinite(sl) && en !== sl;
  const dist = Math.abs(en - sl);
  const buy = en > sl;
  const dp = Math.min(6, Math.max(2, decs(e), decs(s)));
  const tp = ok && isFinite(rv) && rv > 0 ? (buy ? en + rv * dist : en - rv * dist) : null;
  const risk = isFinite(b) && isFinite(p) && b > 0 && p > 0 ? (b * p) / 100 : null;
  const money = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inp = (id, label, val, set, step) => (
    <div className="st-field">
      <label className="st-lab" htmlFor={id}>{label}</label>
      <input id={id} className="st-in" type="number" step={step || "any"} inputMode="decimal" value={val} onChange={(ev) => set(ev.target.value)} />
    </div>
  );
  return (
    <div className="st-calc">
      <div className="st-calc-title">Trade calculator</div>
      <div className="st-row">
        {inp("sc-e", "Entry price", e, setE)}
        {inp("sc-s", "Stop price", s, setS)}
        {inp("sc-r", "Reward : risk (1 : x)", r, setR)}
      </div>
      <div className="st-row">
        {inp("sc-b", "Account balance", bal, setBal)}
        {inp("sc-p", "Risk per trade (%)", rp, setRp)}
      </div>
      {ok ? (
        <div className="st-res">
          <div className="st-resc hero"><small>Take-profit price</small><b>{tp !== null ? tp.toFixed(dp) : "-"}</b></div>
          <div className="st-resc"><small>Direction</small><b className={buy ? "pos" : "neg"}>{buy ? "BUY" : "SELL"}</b></div>
          <div className="st-resc"><small>Stop distance (1R)</small><b>{dist.toFixed(dp)}</b></div>
          {risk !== null && (
            <>
              <div className="st-resc"><small>Amount at risk</small><b className="neg">{money(risk)}</b></div>
              <div className="st-resc"><small>Position size (units)</small><b>{(risk / dist).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
            </>
          )}
        </div>
      ) : (
        <div className="st-hint">Enter an entry and a different stop price to see the target and position size.</div>
      )}
    </div>
  );
}

// ======================================================================
//  READ-ONLY VIEW
// ======================================================================
function StrategyView({ s, onBack, onEdit, onDelete, onOpenImg }) {
  const secs = useMemo(() => {
    const out = [];
    const has = (sec) => (sec.images || []).length > 0;
    if (s.idea.main || s.idea.reasoning || s.tools.length || has(s.idea)) out.push({ k: "idea", t: "The idea" });
    if (s.setup.text || has(s.setup)) out.push({ k: "setup", t: "The setup" });
    if (s.entry.text || s.entry.steps.length || has(s.entry)) out.push({ k: "entry", t: "The entry" });
    if (s.stop.rule || s.stop.explain || has(s.stop)) out.push({ k: "stop", t: "The stop loss" });
    if (s.tp.rule || s.tp.rr || s.tp.explain || has(s.tp)) out.push({ k: "tp", t: "The take profit" });
    if (s.risk.perTrade || s.risk.maxLoss || s.risk.text || s.tp.rr) out.push({ k: "risk", t: "Risk management" });
    if (s.psych.rules.length || s.psych.text) out.push({ k: "psych", t: "Psychology" });
    if (s.notes.text || has(s.notes)) out.push({ k: "notes", t: "Notes" });
    return out;
  }, [s]);

  const [active, setActive] = useState(secs[0] ? secs[0].k : "");
  const navRef = useRef(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.dataset.k); }),
      { rootMargin: "-30% 0px -60% 0px" }
    );
    secs.forEach((x) => {
      const el = document.getElementById("st-sec-" + x.k);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [secs]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const a = nav.querySelector(".on");
    if (a) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: "auto" });
  }, [active]);

  const go = (k) => {
    const el = document.getElementById("st-sec-" + k);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(k);
  };

  const d = DIRS[s.direction] || DIRS.both;
  const win = fmtWindow(s.win);
  const frames = [
    ["Bias / main", s.tf.bias],
    ["Setup", s.tf.setup],
    ["Entry", s.tf.entry],
    ["Trading window", win],
  ].filter((x) => x[1]);
  const rr = rrNum(s.tp.rr);
  const idx = (k) => ROMAN[secs.findIndex((x) => x.k === k)] || "";

  const Head = ({ k, t }) => (
    <div className="st-sechead">
      <span className="st-secnum">{idx(k)}</span>
      <h2>{t}</h2>
    </div>
  );
  const present = (k) => secs.some((x) => x.k === k);

  return (
    <>
      <div className="st-bar">
        <button type="button" className="st-icon" onClick={onBack} aria-label="Back to all strategies"><Ic n="back" /></button>
        <div className="st-bar-title">Strategy</div>
        <button type="button" className="st-icon" onClick={onEdit} aria-label="Edit this strategy" title="Edit"><Ic n="pen" /></button>
        <button type="button" className="st-icon danger" onClick={onDelete} aria-label="Delete this strategy" title="Delete"><Ic n="trash" /></button>
      </div>

      <header className="st-hero">
        <div className="st-eyebrow">{s.market || "Trading strategy"}</div>
        <h1>{s.title}</h1>
        {s.tagline ? <p className="st-lede">{s.tagline}</p> : null}
        <div className="st-chips">
          <span className={"st-dir " + d.c}>{d.l}</span>
          {s.market ? <span className="st-chip">{s.market}</span> : null}
          {rr ? <span className="st-chip">R:R 1 : {rr}</span> : null}
        </div>
        {frames.length > 0 && (
          <div className="st-frames">
            {frames.map(([l, v]) => (
              <div className="st-frame" key={l}>
                <small>{l}</small>
                <b>{v}</b>
              </div>
            ))}
          </div>
        )}
      </header>

      {secs.length > 1 && (
        <nav className="st-nav" ref={navRef} aria-label="Sections">
          {secs.map((x, i) => (
            <button key={x.k} type="button" className={active === x.k ? "on" : ""} onClick={() => go(x.k)}>
              <b>{ROMAN[i]}</b>
              {x.t}
            </button>
          ))}
        </nav>
      )}

      {present("idea") && (
        <section className="st-sec" id="st-sec-idea" data-k="idea">
          <Head k="idea" t="The idea" />
          {s.idea.main ? (
            <div className="st-card st-quote"><p className="st-prose big">{s.idea.main}</p></div>
          ) : null}
          {s.idea.reasoning ? (
            <div className="st-card">
              <div className="st-sub">Reasoning</div>
              <p className="st-prose">{s.idea.reasoning}</p>
            </div>
          ) : null}
          {s.tools.length > 0 && (
            <div className="st-card">
              <div className="st-sub">Tools used</div>
              <div className="st-tags">{s.tools.map((t) => <span className="st-tag ro" key={t}>{t}</span>)}</div>
            </div>
          )}
          <Gallery images={s.idea.images} onOpen={onOpenImg} />
        </section>
      )}

      {present("setup") && (
        <section className="st-sec" id="st-sec-setup" data-k="setup">
          <Head k="setup" t="The setup" />
          {s.setup.text ? <div className="st-card"><p className="st-prose">{s.setup.text}</p></div> : null}
          <Gallery images={s.setup.images} onOpen={onOpenImg} />
        </section>
      )}

      {present("entry") && (
        <section className="st-sec" id="st-sec-entry" data-k="entry">
          <Head k="entry" t="The entry" />
          {s.entry.text ? <div className="st-card"><p className="st-prose">{s.entry.text}</p></div> : null}
          {s.entry.steps.length > 0 && (
            <ol className="st-steps">
              {s.entry.steps.map((st, i) => (
                <li key={st.id}>
                  <span className="st-stepn">{i + 1}</span>
                  <div className="st-stept"><small>Step {i + 1}</small><p>{st.text}</p></div>
                </li>
              ))}
            </ol>
          )}
          <Gallery images={s.entry.images} onOpen={onOpenImg} />
        </section>
      )}

      {present("stop") && (
        <section className="st-sec" id="st-sec-stop" data-k="stop">
          <Head k="stop" t="The stop loss" />
          <div className="st-card st-rule neg">
            {s.stop.rule ? <p className="st-prose big">{s.stop.rule}</p> : null}
            {s.stop.explain ? <p className="st-prose muted">{s.stop.explain}</p> : null}
          </div>
          <Gallery images={s.stop.images} onOpen={onOpenImg} />
        </section>
      )}

      {present("tp") && (
        <section className="st-sec" id="st-sec-tp" data-k="tp">
          <Head k="tp" t="The take profit" />
          <div className="st-card st-rule pos">
            {s.tp.rule ? <p className="st-prose big">{s.tp.rule}</p> : null}
            {rr ? (
              <div className="st-rr" aria-label={"Risk to reward 1 to " + rr}>
                <div className="r1" style={{ flex: 1 }}>RISK <b>1R</b></div>
                <div className="r3" style={{ flex: Math.min(rr, 10) }}>REWARD <b>{rr}R</b></div>
              </div>
            ) : null}
            {s.tp.explain ? <p className="st-prose muted">{s.tp.explain}</p> : null}
          </div>
          <Gallery images={s.tp.images} onOpen={onOpenImg} />
        </section>
      )}

      {present("risk") && (
        <section className="st-sec" id="st-sec-risk" data-k="risk">
          <Head k="risk" t="Risk management" />
          {(s.risk.perTrade || s.risk.maxLoss || s.risk.text) && (
            <div className="st-card">
              {(s.risk.perTrade || s.risk.maxLoss) && (
                <div className="st-stats">
                  {s.risk.perTrade ? <div className="st-stat"><b>{s.risk.perTrade}%</b><small>Risk per trade</small></div> : null}
                  {s.risk.maxLoss ? <div className="st-stat"><b>{s.risk.maxLoss}</b><small>Max loss / day</small></div> : null}
                </div>
              )}
              {s.risk.text ? <p className="st-prose">{s.risk.text}</p> : null}
            </div>
          )}
          <div className="st-card"><RiskCalc rr={s.tp.rr} perTrade={s.risk.perTrade} /></div>
        </section>
      )}

      {present("psych") && (
        <section className="st-sec" id="st-sec-psych" data-k="psych">
          <Head k="psych" t="Psychology" />
          {s.psych.text ? <div className="st-card"><p className="st-prose">{s.psych.text}</p></div> : null}
          {s.psych.rules.length > 0 && (
            <div className="st-rules">
              {s.psych.rules.map((r, i) => (
                <div className="st-rulec" key={r.id}><span>{i + 1}</span><p>{r.text}</p></div>
              ))}
            </div>
          )}
        </section>
      )}

      {present("notes") && (
        <section className="st-sec" id="st-sec-notes" data-k="notes">
          <Head k="notes" t="Notes" />
          {s.notes.text ? <div className="st-card"><p className="st-prose">{s.notes.text}</p></div> : null}
          <Gallery images={s.notes.images} onOpen={onOpenImg} />
        </section>
      )}

      {secs.length === 0 && (
        <div className="st-card st-empty">
          <p>This strategy only has a name so far.</p>
          <button type="button" className="st-btn pri" onClick={onEdit}><Ic n="pen" /> Add the details</button>
        </div>
      )}

      <div className="st-endnote">
        Updated {new Date(s.updatedAt || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </>
  );
}

// ======================================================================
//  FORM PIECES
// ======================================================================
function Field({ id, label, hint, opt, children }) {
  return (
    <div className="st-field">
      <label className="st-lab" htmlFor={id}>
        {label}
        {opt ? <em>optional</em> : null}
      </label>
      {children}
      {hint ? <span className="st-hint">{hint}</span> : null}
    </div>
  );
}

function FCard({ n, title, hint, children }) {
  return (
    <section className="st-fcard">
      <div className="st-fhead">
        <span className="st-fnum">{n}</span>
        <div>
          <h3>{title}</h3>
          {hint ? <p>{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function TagInput({ tags, onChange }) {
  const [v, setV] = useState("");
  const add = (t) => {
    const x = t.trim();
    if (!x) return;
    if (tags.some((y) => y.toLowerCase() === x.toLowerCase())) { setV(""); return; }
    onChange([...tags, x]);
    setV("");
  };
  return (
    <div>
      {tags.length > 0 && (
        <div className="st-tags">
          {tags.map((t) => (
            <span className="st-tag" key={t}>
              {t}
              <button type="button" aria-label={"Remove " + t} onClick={() => onChange(tags.filter((x) => x !== t))}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="st-addrow">
        <input
          className="st-in"
          value={v}
          placeholder="Type a tool and press Enter"
          aria-label="Add a tool"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(v); } }}
        />
        <button type="button" className="st-btn" onClick={() => add(v)}>Add</button>
      </div>
      <div className="st-sugs">
        {SUGGEST.filter((x) => !tags.some((t) => t.toLowerCase() === x.toLowerCase())).map((x) => (
          <button type="button" key={x} className="st-sug" onClick={() => add(x)}>+ {x}</button>
        ))}
      </div>
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, addLabel }) {
  const setText = (id, text) => onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  const move = (idx, d) => {
    const j = idx + d;
    if (j < 0 || j >= items.length) return;
    const a = items.slice();
    [a[idx], a[j]] = [a[j], a[idx]];
    onChange(a);
  };
  return (
    <div className="st-list">
      {items.map((it, i) => (
        <div className="st-item" key={it.id}>
          <span className="st-itemn">{i + 1}</span>
          <textarea
            className="st-in"
            rows={2}
            value={it.text}
            placeholder={placeholder}
            aria-label={"Item " + (i + 1)}
            onChange={(e) => setText(it.id, e.target.value)}
          />
          <div className="st-itembtns">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Ic n="up" size={16} /></button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><Ic n="down" size={16} /></button>
            <button type="button" aria-label="Remove" className="danger" onClick={() => onChange(items.filter((x) => x.id !== it.id))}><Ic n="x" size={16} /></button>
          </div>
        </div>
      ))}
      <button type="button" className="st-btn" onClick={() => onChange([...items, { id: newId(), text: "" }])}>
        <Ic n="plus" size={16} /> {addLabel}
      </button>
    </div>
  );
}

function ImageEditor({ images, onChange, pics, setPics, defaultSide, label }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setMsg("");
    const added = [];
    const newPics = {};
    for (const f of files) {
      if (!f.type.startsWith("image/")) { setMsg("Only image files can be added."); continue; }
      try {
        const data = await compressImage(f);
        const id = "str" + newId();
        newPics[id] = data;
        added.push({ id, side: defaultSide || "any", cap: "" });
      } catch (err) {
        setMsg("Couldn't read one of the images.");
      }
    }
    if (added.length) {
      setPics((p) => ({ ...p, ...newPics }));
      onChange([...images, ...added]);
    }
    setBusy(false);
  };

  const patch = (id, p) => onChange(images.map((i) => (i.id === id ? { ...i, ...p } : i)));

  return (
    <div className="st-imged">
      <div className="st-lab">{label || "Pictures"} <em>optional</em></div>
      {images.length > 0 && (
        <div className="st-imglist">
          {images.map((im) => (
            <div className="st-imgitem" key={im.id}>
              <Pic id={im.id} cache={pics} />
              <div className="st-imgmeta">
                <div className="st-seg" role="group" aria-label="Which side is this picture for">
                  {SIDE_OPTS.map(([k, l]) => (
                    <button key={k} type="button" className={(im.side || "any") === k ? "on " + k : ""} onClick={() => patch(im.id, { side: k })}>{l}</button>
                  ))}
                </div>
                <input className="st-in" value={im.cap || ""} placeholder="Caption (what should I notice?)" aria-label="Picture caption" onChange={(e) => patch(im.id, { cap: e.target.value })} />
                <button type="button" className="st-btn danger sm" onClick={() => onChange(images.filter((x) => x.id !== im.id))}>
                  <Ic n="trash" size={15} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <button type="button" className="st-upload" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
        <Ic n="img" /> {busy ? "Processing…" : "Add pictures"}
      </button>
      {msg ? <div className="st-err">{msg}</div> : null}
    </div>
  );
}

// ======================================================================
//  EDITOR
// ======================================================================
function Editor({ draft, setDraft, pics, setPics, isNew, err, saving, onSave, onCancel }) {
  const top = (p) => setDraft((d) => ({ ...d, ...p }));
  const sec = (k, p) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }));
  const side = draft.direction === "buy" ? "buy" : draft.direction === "sell" ? "sell" : "any";
  const imgProps = (k) => ({
    images: draft[k].images,
    onChange: (images) => sec(k, { images }),
    pics,
    setPics,
    defaultSide: side,
  });

  return (
    <>
      <div className="st-bar">
        <button type="button" className="st-icon" onClick={onCancel} aria-label="Cancel and go back"><Ic n="back" /></button>
        <div className="st-bar-title">{isNew ? "New strategy" : "Edit strategy"}</div>
      </div>

      <div className="st-form">
        <FCard n="1" title="Basics" hint="The name and the frame of the strategy.">
          <Field id="sf-title" label="Strategy name">
            <input id="sf-title" className={"st-in" + (err ? " bad" : "")} value={draft.title} maxLength={80} placeholder="e.g. Ride with the tide" onChange={(e) => top({ title: e.target.value })} />
          </Field>
          {err ? <div className="st-err" role="alert">{err}</div> : null}
          <Field id="sf-tag" label="Tagline" opt>
            <input id="sf-tag" className="st-in" value={draft.tagline} maxLength={140} placeholder="One line that sums it up" onChange={(e) => top({ tagline: e.target.value })} />
          </Field>
          <div className="st-row">
            <Field id="sf-mkt" label="Market / instrument" opt>
              <input id="sf-mkt" className="st-in" value={draft.market} placeholder="e.g. XAUUSD, EURUSD, NAS100" onChange={(e) => top({ market: e.target.value })} />
            </Field>
            <div className="st-field">
              <span className="st-lab">Direction</span>
              <div className="st-seg wide" role="group" aria-label="Direction">
                {[["buy", "Buy"], ["sell", "Sell"], ["both", "Both"]].map(([k, l]) => (
                  <button key={k} type="button" className={draft.direction === k ? "on " + k : ""} onClick={() => top({ direction: k })}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="st-row">
            <Field id="sf-tf1" label="Bias / main time frame" opt>
              <input id="sf-tf1" className="st-in" value={draft.tf.bias} placeholder="e.g. 5 min" onChange={(e) => sec("tf", { bias: e.target.value })} />
            </Field>
            <Field id="sf-tf2" label="Setup time frame" opt>
              <input id="sf-tf2" className="st-in" value={draft.tf.setup} placeholder="e.g. 5 min" onChange={(e) => sec("tf", { setup: e.target.value })} />
            </Field>
            <Field id="sf-tf3" label="Entry time frame" opt>
              <input id="sf-tf3" className="st-in" value={draft.tf.entry} placeholder="e.g. 1 min" onChange={(e) => sec("tf", { entry: e.target.value })} />
            </Field>
          </div>
          <div className="st-row">
            <Field id="sf-ws" label="Trading window starts" opt>
              <input id="sf-ws" type="time" className="st-in" value={draft.win.start} onChange={(e) => sec("win", { start: e.target.value })} />
            </Field>
            <Field id="sf-we" label="Trading window ends" opt>
              <input id="sf-we" type="time" className="st-in" value={draft.win.end} onChange={(e) => sec("win", { end: e.target.value })} />
            </Field>
            <Field id="sf-tz" label="Time zone" opt>
              <input id="sf-tz" className="st-in" value={draft.win.tz} placeholder="e.g. EAT" onChange={(e) => sec("win", { tz: e.target.value })} />
            </Field>
          </div>
        </FCard>

        <FCard n="2" title="The idea" hint="Why does this strategy work? The reasoning you never want to forget.">
          <Field id="sf-main" label="Main idea" opt>
            <textarea id="sf-main" className="st-in" rows={3} value={draft.idea.main} placeholder="Price follows a trend and leaves a trail behind it…" onChange={(e) => sec("idea", { main: e.target.value })} />
          </Field>
          <Field id="sf-reason" label="Reasoning" opt>
            <textarea id="sf-reason" className="st-in" rows={4} value={draft.idea.reasoning} placeholder="What is the logic behind it?" onChange={(e) => sec("idea", { reasoning: e.target.value })} />
          </Field>
          <ImageEditor {...imgProps("idea")} label="Pictures showing the idea" />
        </FCard>

        <FCard n="3" title="Tools" hint="What goes on the chart.">
          <TagInput tags={draft.tools} onChange={(tools) => top({ tools })} />
        </FCard>

        <FCard n="4" title="The setup" hint="How do you spot a setup? Add buy and sell examples as pictures.">
          <Field id="sf-setup" label="Description" opt>
            <textarea id="sf-setup" className="st-in" rows={4} value={draft.setup.text} placeholder="Describe what a valid setup looks like…" onChange={(e) => sec("setup", { text: e.target.value })} />
          </Field>
          <ImageEditor {...imgProps("setup")} label="Setup pictures" />
        </FCard>

        <FCard n="5" title="The entry" hint="The steps, in order, from first look to clicking the button.">
          <Field id="sf-entry" label="Overview" opt>
            <textarea id="sf-entry" className="st-in" rows={3} value={draft.entry.text} placeholder="A short summary of the entry trigger…" onChange={(e) => sec("entry", { text: e.target.value })} />
          </Field>
          <div className="st-lab">Steps to the entry</div>
          <ListEditor
            items={draft.entry.steps}
            onChange={(steps) => sec("entry", { steps })}
            placeholder="First do this…"
            addLabel="Add a step"
          />
          <ImageEditor {...imgProps("entry")} label="Entry pictures" />
        </FCard>

        <FCard n="6" title="Stop loss" hint="Where it goes and why.">
          <Field id="sf-slr" label="Rule" opt>
            <textarea id="sf-slr" className="st-in" rows={2} value={draft.stop.rule} placeholder="Just beyond the high that price made after the breach" onChange={(e) => sec("stop", { rule: e.target.value })} />
          </Field>
          <Field id="sf-sle" label="Explanation" opt>
            <textarea id="sf-sle" className="st-in" rows={3} value={draft.stop.explain} placeholder="Why this placement?" onChange={(e) => sec("stop", { explain: e.target.value })} />
          </Field>
          <ImageEditor {...imgProps("stop")} label="Stop loss pictures" />
        </FCard>

        <FCard n="7" title="Take profit" hint="The target, the ratio, and what happens after.">
          <div className="st-row">
            <Field id="sf-tpr" label="Rule" opt>
              <input id="sf-tpr" className="st-in" value={draft.tp.rule} placeholder="e.g. 2 times the stop loss" onChange={(e) => sec("tp", { rule: e.target.value })} />
            </Field>
            <Field id="sf-rr" label="Reward (1 : x)" opt hint="Enter x, e.g. 3 for 1 : 3">
              <input id="sf-rr" className="st-in" type="number" step="any" min="0" inputMode="decimal" value={draft.tp.rr} placeholder="3" onChange={(e) => sec("tp", { rr: e.target.value })} />
            </Field>
          </div>
          <Field id="sf-tpe" label="Explanation" opt>
            <textarea id="sf-tpe" className="st-in" rows={3} value={draft.tp.explain} placeholder="Do you move the stop? Let it run?" onChange={(e) => sec("tp", { explain: e.target.value })} />
          </Field>
          <ImageEditor {...imgProps("tp")} label="Take profit pictures" />
        </FCard>

        <FCard n="8" title="Risk management" hint="Numbers and rules that protect the account.">
          <div className="st-row">
            <Field id="sf-rpt" label="Risk per trade (%)" opt>
              <input id="sf-rpt" className="st-in" type="number" step="any" min="0" inputMode="decimal" value={draft.risk.perTrade} placeholder="1" onChange={(e) => sec("risk", { perTrade: e.target.value })} />
            </Field>
            <Field id="sf-rml" label="Max loss per day" opt>
              <input id="sf-rml" className="st-in" value={draft.risk.maxLoss} placeholder="e.g. 3R or 160" onChange={(e) => sec("risk", { maxLoss: e.target.value })} />
            </Field>
          </div>
          <Field id="sf-rt" label="Rules" opt>
            <textarea id="sf-rt" className="st-in" rows={3} value={draft.risk.text} placeholder="Max trades, when to stop, sizing rules…" onChange={(e) => sec("risk", { text: e.target.value })} />
          </Field>
        </FCard>

        <FCard n="9" title="Psychology" hint="The reminders that keep you disciplined.">
          <Field id="sf-pt" label="Mindset" opt>
            <textarea id="sf-pt" className="st-in" rows={3} value={draft.psych.text} placeholder="How should you think while trading this?" onChange={(e) => sec("psych", { text: e.target.value })} />
          </Field>
          <div className="st-lab">Personal rules</div>
          <ListEditor
            items={draft.psych.rules}
            onChange={(rules) => sec("psych", { rules })}
            placeholder="e.g. No revenge trades after a loss"
            addLabel="Add a rule"
          />
        </FCard>

        <FCard n="10" title="Notes & screenshots" hint="Anything else worth keeping.">
          <Field id="sf-nt" label="Notes" opt>
            <textarea id="sf-nt" className="st-in" rows={4} value={draft.notes.text} onChange={(e) => sec("notes", { text: e.target.value })} />
          </Field>
          <ImageEditor {...imgProps("notes")} label="Screenshots" />
        </FCard>
      </div>

      <div className="st-savebar">
        <div className="st-savein">
          <button type="button" className="st-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="st-btn pri" onClick={onSave} disabled={saving}>
            <Ic n="check" size={16} /> {saving ? "Saving…" : "Save strategy"}
          </button>
        </div>
      </div>
    </>
  );
}

// ======================================================================
//  LIST
// ======================================================================
function ListView({ items, loaded, syncLabel, query, setQuery, filter, setFilter, onBack, onNew, onOpen, onEdit, onDelete, theme, onTheme }) {
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      if (filter !== "all" && s.direction !== filter) return false;
      if (!q) return true;
      return [s.title, s.tagline, s.market, s.tools.join(" ")].join(" ").toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  return (
    <>
      <div className="st-bar">
        <button type="button" className="st-icon" onClick={onBack} aria-label="Back to the session"><Ic n="back" /></button>
        <div className="st-bar-title">Strategies</div>
        <button type="button" className="st-icon" onClick={onTheme} aria-label="Toggle theme"><Ic n={theme === "light" ? "sun" : "moon"} /></button>
        <button type="button" className="st-btn pri st-addtop" onClick={onNew}><Ic n="plus" size={16} /> <span>Add strategy</span></button>
      </div>

      <header className="st-listhead">
        <h1>Your playbook</h1>
        <p>Every strategy you trade, written down once and kept clear.</p>
      </header>

      <div className="st-tools">
        <div className="st-search">
          <Ic n="search" size={17} />
          <input value={query} placeholder="Search name, market or tool" aria-label="Search strategies" onChange={(e) => setQuery(e.target.value)} />
          {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Ic n="x" size={16} /></button> : null}
        </div>
        <div className="st-filters" role="group" aria-label="Filter by direction">
          {[["all", "All"], ["buy", "Buy"], ["sell", "Sell"], ["both", "Both"]].map(([k, l]) => (
            <button key={k} type="button" className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="st-grid">
          {[0, 1, 2].map((i) => <div key={i} className="st-card sk st-skel" aria-hidden="true" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="st-card st-empty">
          <div className="st-emptyico"><Ic n="pen" size={26} /></div>
          <h3>No strategies yet</h3>
          <p>Add your first one. Fill in the idea, setup, entry, stop and target, and it becomes a clean page you can read before every session.</p>
          <button type="button" className="st-btn pri" onClick={onNew}><Ic n="plus" size={16} /> Add your first strategy</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="st-card st-empty">
          <h3>No matches</h3>
          <p>Nothing matches your search or filter.</p>
          <button type="button" className="st-btn" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
        </div>
      ) : (
        <div className="st-grid">
          {shown.map((s) => {
            const d = DIRS[s.direction] || DIRS.both;
            const tfs = [s.tf.bias, s.tf.setup, s.tf.entry].filter(Boolean);
            const uniq = tfs.filter((x, i) => tfs.indexOf(x) === i).join(" · ");
            const rr = rrNum(s.tp.rr);
            return (
              <article className="st-card st-scard" key={s.id}>
                <button type="button" className="st-scard-main" onClick={() => onOpen(s.id)}>
                  <span className={"st-dir " + d.c}>{d.l}</span>
                  <h3>{s.title}</h3>
                  {s.tagline ? <p>{s.tagline}</p> : null}
                  <span className="st-chips">
                    {s.market ? <span className="st-chip">{s.market}</span> : null}
                    {uniq ? <span className="st-chip">{uniq}</span> : null}
                    {rr ? <span className="st-chip">1 : {rr}</span> : null}
                  </span>
                </button>
                <div className="st-scard-foot">
                  <span>{new Date(s.updatedAt || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  <span className="st-scard-btns">
                    <button type="button" aria-label={"Edit " + s.title} onClick={() => onEdit(s.id)}><Ic n="pen" size={16} /></button>
                    <button type="button" className="danger" aria-label={"Delete " + s.title} onClick={() => onDelete(s.id)}><Ic n="trash" size={16} /></button>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="st-sync">{syncLabel}</div>
    </>
  );
}

// ======================================================================
//  MAIN
// ======================================================================
export default function Strategies({ onBack } = {}) {
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState("idle");
  const [retry, setRetry] = useState(0);

  const [mode, setMode] = useState("list"); // list | view | edit
  const [curId, setCurId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pics, setPics] = useState({});
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [confirmDel, setConfirmDel] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(() => (readLS("td_theme", "dark") === "light" ? "light" : "dark"));

  const initialRef = useRef("");
  const origImgs = useRef([]);
  const toastTimer = useRef(null);
  const fontAdded = useRef(false);

  // fonts (shared with Session)
  useEffect(() => {
    if (fontAdded.current || typeof document === "undefined") return;
    fontAdded.current = true;
    if (!document.getElementById("ts-font-link")) {
      const link = document.createElement("link");
      link.id = "ts-font-link";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // theme stays in step with the rest of the app
  useEffect(() => {
    const sync = () => {
      const t = readLS("td_theme", "dark");
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    writeLS("td_theme", next);
  };

  // who is signed in
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setUserId(data.session ? data.session.user.id : null);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const on = () => setRetry((t) => t + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  // load from the device instantly, then reconcile with Supabase
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setShotUser(userId);
    const local = readLS(lsKey(userId), []).map(norm);
    setItems(sortItems(local));
    setLoaded(true);
    (async () => {
      try {
        setSyncState("syncing");
        const dels = readLS(DEL_KEY, []);
        if (dels.length) {
          const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).in("id", dels);
          if (error) throw error;
          writeLS(DEL_KEY, []);
        }
        const remote = await fetchRemote(userId);
        const cur = readLS(lsKey(userId), []).map(norm);
        const map = new Map();
        remote.forEach((r) => map.set(r.id, r));
        const push = [];
        cur.forEach((l) => {
          const r = map.get(l.id);
          if (!r || (l.updatedAt || 0) > (r.updatedAt || 0)) {
            map.set(l.id, l);
            push.push(l);
          }
        });
        if (push.length) {
          const { error } = await supabase.from(TABLE).upsert(push.map(rowOf(userId)));
          if (error) throw error;
        }
        if (cancelled) return;
        setItems(sortItems([...map.values()]));
        setSyncState("synced");
        flushImgQueue();
      } catch (e) {
        if (cancelled) return;
        setSyncState(e && (e.code === "42P01" || e.code === "PGRST205") ? "nosetup" : "offline");
      }
    })();
    return () => { cancelled = true; };
  }, [userId, retry]);

  // keep the device copy current
  useEffect(() => {
    if (userId && loaded) writeLS(lsKey(userId), items);
  }, [items, userId, loaded]);

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [mode, curId]);

  const flash = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const syncLabel =
    syncState === "synced" ? "Synced to your account."
      : syncState === "syncing" ? "Syncing…"
      : syncState === "nosetup" ? "Saved on this device. The strategies table isn't set up in Supabase yet."
      : syncState === "offline" ? "Offline. Changes will sync when you reconnect."
      : "Connecting…";

  const current = useMemo(() => items.find((x) => x.id === curId) || null, [items, curId]);

  const pushOne = async (s) => {
    if (!userId) return;
    setSyncState("syncing");
    try {
      const { error } = await supabase.from(TABLE).upsert(rowOf(userId)(s));
      if (error) throw error;
      setSyncState("synced");
    } catch (e) {
      setSyncState(e && (e.code === "42P01" || e.code === "PGRST205") ? "nosetup" : "offline");
    }
  };

  // ---------- actions ----------
  const openNew = () => {
    const d = blank();
    setDraft(d);
    setPics({});
    setIsNew(true);
    setErr("");
    initialRef.current = JSON.stringify(d);
    origImgs.current = [];
    setMode("edit");
  };
  const openEdit = (id) => {
    const s = items.find((x) => x.id === id);
    if (!s) return;
    const d = norm(JSON.parse(JSON.stringify(s)));
    setDraft(d);
    setPics({});
    setIsNew(false);
    setErr("");
    setCurId(id);
    initialRef.current = JSON.stringify(d);
    origImgs.current = allImages(d);
    setMode("edit");
  };
  const openView = (id) => {
    setCurId(id);
    setMode("view");
  };

  const cancelEdit = () => {
    const dirty = draft && (JSON.stringify(draft) !== initialRef.current || Object.keys(pics).length > 0);
    if (dirty && !window.confirm("Discard your changes?")) return;
    if (isNew || !curId) setMode("list");
    else setMode("view");
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setErr("Give the strategy a name first.");
      const el = document.getElementById("sf-title");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      return;
    }
    setSaving(true);
    setErr("");
    const final = { ...draft, title: draft.title.trim(), updatedAt: Date.now() };
    const keep = allImages(final);
    for (const id of keep) {
      if (pics[id]) await saveImg(id, pics[id]);
    }
    origImgs.current.filter((id) => !keep.includes(id)).forEach((id) => dropImg(id));
    setItems((arr) => sortItems([...arr.filter((x) => x.id !== final.id), final]));
    setCurId(final.id);
    setPics({});
    setSaving(false);
    setMode("view");
    flash("Strategy saved.");
    pushOne(final);
  };

  const doDelete = async () => {
    const id = confirmDel;
    setConfirmDel(null);
    const s = items.find((x) => x.id === id);
    if (!s) return;
    allImages(s).forEach((i) => dropImg(i));
    setItems((arr) => arr.filter((x) => x.id !== id));
    if (curId === id) { setCurId(null); setMode("list"); }
    flash("Strategy deleted.");
    if (userId) {
      try {
        const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("id", id);
        if (error) throw error;
      } catch (e) {
        const q = readLS(DEL_KEY, []);
        if (!q.includes(id)) writeLS(DEL_KEY, [...q, id]);
        setSyncState("offline");
      }
    }
  };

  const delTarget = confirmDel ? items.find((x) => x.id === confirmDel) : null;

  return (
    <div className="st-root" data-theme={theme}>
      <style>{CSS}</style>
      <div className={"st-wrap" + (mode === "edit" ? " edit" : "")}>
        {mode === "list" && (
          <ListView
            items={items} loaded={loaded} syncLabel={syncLabel}
            query={query} setQuery={setQuery} filter={filter} setFilter={setFilter}
            onBack={() => (typeof onBack === "function" ? onBack() : (window.location.hash = "#session"))}
            onNew={openNew} onOpen={openView} onEdit={openEdit} onDelete={setConfirmDel}
            theme={theme} onTheme={toggleTheme}
          />
        )}
        {mode === "view" && current && (
          <StrategyView
            key={current.id}
            s={current}
            onBack={() => setMode("list")}
            onEdit={() => openEdit(current.id)}
            onDelete={() => setConfirmDel(current.id)}
            onOpenImg={setLightbox}
          />
        )}
        {mode === "view" && !current && (
          <div className="st-card st-empty">
            <p>That strategy could not be found.</p>
            <button type="button" className="st-btn" onClick={() => setMode("list")}>Back to the list</button>
          </div>
        )}
        {mode === "edit" && draft && (
          <Editor
            draft={draft} setDraft={setDraft} pics={pics} setPics={setPics}
            isNew={isNew} err={err} saving={saving} onSave={save} onCancel={cancelEdit}
          />
        )}
      </div>

      {lightbox && (
        <div className="st-backdrop" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Image preview">
          <button type="button" className="st-lbclose" aria-label="Close preview" onClick={() => setLightbox(null)}><Ic n="x" /></button>
          <img className="st-lbimg" src={lightbox} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {delTarget && (
        <div className="st-backdrop center" onClick={() => setConfirmDel(null)}>
          <div className="st-modal" role="alertdialog" aria-modal="true" aria-labelledby="st-del-t" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-t" id="st-del-t">Delete this strategy?</div>
            <p className="st-modal-s">"{delTarget.title}" and its pictures will be removed. This can't be undone.</p>
            <div className="st-modal-a">
              <button type="button" className="st-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button type="button" className="st-btn dangerfill" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast ? <div className="st-toast" role="status">{toast}</div> : null}
    </div>
  );
}

// ---------- scoped styles ----------
const CSS = `
.st-root{
--bg-grad:linear-gradient(180deg,#0c1124 0%,#080b17 42%,#04060d 100%);
--surface:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 42%),linear-gradient(160deg,rgba(26,34,58,.86),rgba(11,15,29,.94));
--surface-2:rgba(255,255,255,.055);
--border:rgba(190,205,255,.10);
--text:#f5f7fc; --muted:#8b94ad;
--amber:#e8c97a; --amber-dim:rgba(232,201,122,.16);
--accent-text:#f1d98f;
--teal:#34e0a1; --teal-dim:rgba(52,224,161,.14);
--rose:#ff6b7d; --rose-dim:rgba(255,107,125,.15);
--warn:#f2b45c;
--on-accent:#1b1407;
--focus-ring:#e8c97a;
--orb-1:rgba(232,201,122,.13); --orb-2:rgba(64,104,255,.20); --orb-3:rgba(150,170,255,.07);
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--shadow-card-hover:0 1px 0 rgba(255,255,255,.11) inset,0 26px 50px -18px rgba(0,0,0,1);
--glow-amber:rgba(232,201,122,.30);
--bar-bg:rgba(11,16,32,.82);
--r-card:1.6rem; --r-input:.9rem; --r-pill:999px;
box-sizing:border-box;min-height:100vh;position:relative;
padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
background:var(--bg-grad);background-attachment:fixed;
color:var(--text);font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;overflow-x:clip;max-width:100vw;
}
.st-root[data-theme="light"]{
--bg-grad:linear-gradient(180deg,#d6e2f7 0%,#bfd0ee 50%,#a9bee4 100%);
--surface:linear-gradient(160deg,rgba(255,255,255,.80),rgba(224,235,252,.58));
--surface-2:rgba(255,255,255,.62);
--border:rgba(30,60,120,.13);
--text:#10214a; --muted:#5d7099;
--amber:#e9a92a; --amber-dim:rgba(233,169,42,.28);
--accent-text:#1f4a94;
--teal:#0b8f50; --teal-dim:rgba(15,157,88,.14);
--rose:#d63c33; --rose-dim:rgba(214,60,51,.12);
--warn:#c67a12;
--on-accent:#2b1d00;
--focus-ring:#2f6fc4;
--orb-1:rgba(255,255,255,.9); --orb-2:rgba(90,140,230,.42); --orb-3:rgba(255,255,255,.55);
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--modal-bg:#eef4ff;
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--shadow-card-hover:0 1px 0 rgba(255,255,255,1) inset,0 22px 42px -18px rgba(38,72,150,.48);
--glow-amber:rgba(233,169,42,.42);
--bar-bg:rgba(236,243,255,.82);
}
.st-root *{box-sizing:border-box;}
.st-root::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);}
.st-root button{font-family:inherit;color:inherit;}
.st-root button,.st-root input,.st-root textarea{-webkit-tap-highlight-color:transparent;}
.st-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.st-root ::selection{background:var(--amber);color:var(--on-accent);}
.st-wrap{position:relative;z-index:1;width:100%;max-width:68rem;margin:0 auto;padding:1rem clamp(.9rem,3.5vw,2rem) 6rem;}
.st-wrap.edit{max-width:50rem;padding-bottom:8rem;}
.st-wrap>*{min-width:0;}

/* ----- top bar ----- */
.st-bar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:1.1rem;}
.st-bar-title{flex:1;min-width:0;font-size:1rem;font-weight:800;letter-spacing:-.01em;overflow-wrap:anywhere;}
.st-icon{display:inline-grid;place-items:center;flex-shrink:0;width:2.75rem;height:2.75rem;border-radius:50%;border:1px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:border-color .18s ease,color .18s ease,background .18s ease;}
.st-icon:hover{border-color:var(--amber);}
.st-icon.danger:hover{border-color:var(--rose);color:var(--rose);}
.st-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:2.75rem;padding:.6rem 1.1rem;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:.88rem;font-weight:700;cursor:pointer;transition:transform .15s ease,border-color .18s ease,background .18s ease;text-align:center;}
.st-btn:hover{border-color:var(--amber);}
.st-btn:active{transform:scale(.97);}
.st-btn:disabled{opacity:.5;cursor:default;}
.st-btn.pri{background:var(--btn);color:var(--on-accent);border-color:transparent;box-shadow:0 10px 22px -10px var(--glow-amber);}
.st-btn.danger{color:var(--rose);}
.st-btn.danger:hover{border-color:var(--rose);}
.st-btn.dangerfill{background:var(--rose);color:#fff;border-color:transparent;}
.st-btn.sm{min-height:2.25rem;padding:.35rem .8rem;font-size:.78rem;align-self:flex-start;}

/* ----- list ----- */
.st-listhead{margin:.4rem 0 1.2rem;}
.st-listhead h1{margin:0;font-size:clamp(1.8rem,5.5vw,2.8rem);font-weight:800;letter-spacing:-.03em;line-height:1.08;}
.st-root:not([data-theme="light"]) .st-listhead h1,.st-root:not([data-theme="light"]) .st-hero h1{background:linear-gradient(180deg,#fff 20%,#c3cce6 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;}
.st-listhead p{margin:.4rem 0 0;color:var(--muted);font-size:.95rem;line-height:1.5;}
.st-tools{display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.1rem;align-items:center;}
.st-search{flex:1 1 15rem;min-width:0;display:flex;align-items:center;gap:.6rem;padding:0 .9rem;min-height:2.9rem;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--muted);}
.st-search:focus-within{border-color:var(--amber);}
.st-search input{flex:1;min-width:0;border:0;background:none;color:var(--text);font:inherit;font-size:1rem;padding:.5rem 0;outline:none;}
.st-search button{border:0;background:none;display:grid;place-items:center;color:var(--muted);cursor:pointer;padding:.2rem;}
.st-filters{display:inline-flex;gap:.25rem;padding:.25rem;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);flex-wrap:wrap;}
.st-filters button{border:0;background:none;color:var(--muted);padding:.5rem .9rem;border-radius:var(--r-pill);font-size:.8rem;font-weight:700;cursor:pointer;min-height:2.25rem;}
.st-filters button.on{background:var(--btn);color:var(--on-accent);}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr));gap:1rem;}
.st-card{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow-card);padding:clamp(1rem,2.6vw,1.6rem);min-width:0;}
.st-scard{display:flex;flex-direction:column;padding:0;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;}
.st-scard:hover{transform:translateY(-3px);border-color:var(--amber);box-shadow:var(--shadow-card-hover);}
.st-scard-main{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;flex:1;text-align:left;border:0;background:none;padding:1.2rem 1.2rem .6rem;cursor:pointer;min-width:0;width:100%;}
.st-scard-main h3{margin:.2rem 0 0;font-size:1.2rem;font-weight:800;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere;}
.st-scard-main p{margin:0;color:var(--muted);font-size:.88rem;line-height:1.5;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.st-scard-foot{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem .8rem .8rem 1.2rem;font-size:.75rem;color:var(--muted);}
.st-scard-btns{display:inline-flex;gap:.3rem;}
.st-scard-btns button{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:50%;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;transition:all .18s ease;}
.st-scard-btns button:hover{color:var(--text);border-color:var(--amber);}
.st-scard-btns button.danger:hover{color:var(--rose);border-color:var(--rose);}
.st-chips{display:flex;flex-wrap:wrap;gap:.4rem;}
.st-chip{font-size:.74rem;font-weight:700;padding:.3rem .65rem;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);color:var(--text);overflow-wrap:anywhere;}
.st-dir{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:.28rem .7rem;border-radius:var(--r-pill);border:1px solid;}
.st-dir.buy{color:var(--teal);background:var(--teal-dim);border-color:var(--teal);}
.st-dir.sell{color:var(--rose);background:var(--rose-dim);border-color:var(--rose);}
.st-dir.both{color:var(--accent-text);background:var(--amber-dim);border-color:var(--amber);}
.st-empty{text-align:center;display:flex;flex-direction:column;align-items:center;gap:.8rem;padding:clamp(1.6rem,6vw,3rem) 1.2rem;}
.st-empty h3{margin:0;font-size:1.25rem;font-weight:800;}
.st-empty p{margin:0;color:var(--muted);max-width:30rem;line-height:1.55;}
.st-emptyico{width:3.6rem;height:3.6rem;border-radius:50%;display:grid;place-items:center;background:var(--amber-dim);color:var(--accent-text);}
.st-sync{margin-top:2rem;text-align:center;font-size:.75rem;color:var(--muted);}
.sk{position:relative;overflow:hidden;}
.sk::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.07) 50%,transparent 80%);transform:translateX(-100%);animation:st-sk 1.4s infinite;}
@keyframes st-sk{to{transform:translateX(100%);}}
.st-skel{min-height:10rem;}

/* ----- read view ----- */
.st-hero{padding:clamp(.8rem,3vw,2rem) 0 1.4rem;}
.st-eyebrow{display:inline-flex;align-items:center;gap:.7rem;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--accent-text);font-weight:700;overflow-wrap:anywhere;}
.st-eyebrow::before{content:"";width:2rem;height:1px;background:var(--amber);flex-shrink:0;}
.st-hero h1{margin:.9rem 0 .8rem;font-size:clamp(2.1rem,7vw,4.2rem);line-height:1.04;font-weight:800;letter-spacing:-.035em;overflow-wrap:anywhere;padding-right:.05em;}
.st-lede{margin:0 0 1.1rem;max-width:42rem;font-size:clamp(1rem,2vw,1.15rem);color:var(--muted);line-height:1.6;overflow-wrap:anywhere;}
.st-frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr));gap:.7rem;margin-top:1.4rem;}
.st-frame{padding:.9rem 1rem;border-radius:1.1rem;border:1px solid var(--border);background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--shadow-card);min-width:0;}
.st-frame small{display:block;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:.25rem;}
.st-frame b{display:block;font-size:1.15rem;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;}
.st-nav{position:sticky;top:0;z-index:20;display:flex;gap:.4rem;overflow-x:auto;scrollbar-width:none;padding:.6rem .2rem;margin:0 -.2rem 1rem;background:var(--bar-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border-bottom:1px solid var(--border);}
.st-nav::-webkit-scrollbar{display:none;}
.st-nav button{flex:none;display:inline-flex;align-items:center;gap:.5rem;padding:.45rem .9rem .45rem .5rem;border-radius:var(--r-pill);border:1px solid transparent;background:none;color:var(--muted);font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s ease;min-height:2.4rem;}
.st-nav button b{display:grid;place-items:center;min-width:1.55rem;height:1.55rem;padding:0 .3rem;border-radius:.6rem;background:var(--surface-2);color:var(--accent-text);font-size:.68rem;}
.st-nav button:hover{color:var(--text);}
.st-nav button.on{color:var(--text);border-color:var(--amber);background:var(--amber-dim);}
.st-nav button.on b{background:var(--btn);color:var(--on-accent);}
.st-sec{padding-top:clamp(1.6rem,4vw,2.6rem);scroll-margin-top:4.5rem;}
.st-sec>*+*{margin-top:1rem;}
.st-sechead{display:flex;align-items:center;gap:.9rem;margin-bottom:1.1rem;min-width:0;}
.st-sechead::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent);min-width:1rem;}
.st-sechead h2{margin:0;font-size:clamp(1.4rem,4vw,2.1rem);font-weight:800;letter-spacing:-.025em;line-height:1.15;overflow-wrap:anywhere;}
.st-secnum{flex-shrink:0;min-width:2.2rem;text-align:center;padding:.4rem .7rem;border-radius:.8rem;background:var(--btn);color:var(--on-accent);font-size:.82rem;font-weight:800;letter-spacing:.06em;box-shadow:0 8px 20px -8px var(--glow-amber);}
.st-prose{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:1rem;}
.st-prose.big{font-size:clamp(1.08rem,2.4vw,1.3rem);line-height:1.6;font-weight:600;}
.st-prose.muted{color:var(--muted);font-size:.95rem;}
.st-prose+.st-prose{margin-top:.8rem;}
.st-sub{font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text);margin-bottom:.6rem;}
.st-quote{position:relative;padding-left:clamp(1.3rem,3vw,2rem);}
.st-quote::before{content:"";position:absolute;left:0;top:1.1rem;bottom:1.1rem;width:4px;border-radius:4px;background:linear-gradient(var(--amber),transparent);}
.st-tags{display:flex;flex-wrap:wrap;gap:.45rem;margin-bottom:.6rem;}
.st-tag{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .5rem .4rem .8rem;border-radius:var(--r-pill);border:1px solid var(--amber);background:var(--amber-dim);font-size:.82rem;font-weight:700;overflow-wrap:anywhere;}
.st-tag.ro{padding:.4rem .9rem;}
.st-tag button{border:0;background:none;cursor:pointer;opacity:.7;font-size:1.1rem;line-height:1;padding:0 .25rem;min-width:1.6rem;min-height:1.6rem;}
.st-tag button:hover{opacity:1;}
.st-steps{list-style:none;margin:0;padding:0;display:grid;gap:.8rem;}
.st-steps li{position:relative;display:flex;gap:1rem;padding:1rem 1.1rem;border-radius:1.2rem;border:1px solid var(--border);background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--shadow-card);min-width:0;}
.st-stepn{flex-shrink:0;width:2.4rem;height:2.4rem;border-radius:.85rem;display:grid;place-items:center;background:var(--btn);color:var(--on-accent);font-weight:800;box-shadow:0 8px 18px -8px var(--glow-amber);}
.st-stept{flex:1;min-width:0;}
.st-stept small{display:block;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:.15rem;}
.st-stept p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;}
.st-rule.neg{border-left:4px solid var(--rose);}
.st-rule.pos{border-left:4px solid var(--teal);}
.st-rr{display:flex;height:3.4rem;border-radius:1rem;overflow:hidden;margin:1rem 0;border:1px solid var(--border);}
.st-rr div{display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.72rem;letter-spacing:.1em;font-weight:800;min-width:5.5rem;padding:0 .6rem;white-space:nowrap;}
.st-rr b{font-size:1.1rem;}
.st-rr .r1{background:var(--rose-dim);color:var(--rose);}
.st-rr .r3{background:var(--teal-dim);color:var(--teal);}
.st-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.7rem;margin-bottom:1rem;}
.st-stat{padding:.9rem 1rem;border-radius:1rem;border:1px solid var(--border);background:var(--surface-2);min-width:0;}
.st-stat b{display:block;font-size:1.5rem;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;}
.st-stat small{font-size:.72rem;color:var(--muted);font-weight:600;}
.st-rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:.8rem;}
.st-rulec{display:flex;gap:.8rem;padding:1rem 1.1rem;border-radius:1.2rem;border:1px solid var(--border);border-left:4px solid var(--amber);background:var(--surface);box-shadow:var(--shadow-card);min-width:0;}
.st-rulec span{flex-shrink:0;font-weight:800;color:var(--accent-text);}
.st-rulec p{margin:0;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.55;}
.st-endnote{margin-top:3rem;text-align:center;font-size:.75rem;color:var(--muted);}

/* gallery */
.st-gal{display:grid;gap:1.1rem;}
.st-galhead{font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.6rem;display:inline-flex;align-items:center;gap:.5rem;}
.st-galhead::before{content:"";width:.55rem;height:.55rem;border-radius:50%;background:var(--muted);}
.st-galhead.buy{color:var(--teal);}.st-galhead.buy::before{background:var(--teal);}
.st-galhead.sell{color:var(--rose);}.st-galhead.sell::before{background:var(--rose);}
.st-galgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr));gap:.9rem;}
.st-fig{margin:0;min-width:0;}
.st-fig figcaption{margin-top:.5rem;font-size:.85rem;color:var(--muted);line-height:1.5;overflow-wrap:anywhere;padding:0 .2rem;}
.st-pic{display:block;width:100%;aspect-ratio:16/10;padding:0;border-radius:1.1rem;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);cursor:zoom-in;box-shadow:var(--shadow-card);position:relative;}
.st-pic img{display:block;width:100%;height:100%;object-fit:cover;}
.st-pic.ph{display:grid;place-items:center;color:var(--muted);font-size:.78rem;cursor:default;}

/* calculator */
.st-calc-title{font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text);margin-bottom:.8rem;}
.st-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.7rem;margin-top:.4rem;}
.st-resc{padding:.8rem 1rem;border-radius:1rem;border:1px solid var(--border);background:var(--surface-2);min-width:0;}
.st-resc.hero{grid-column:1/-1;background:var(--amber-dim);border-color:var(--amber);}
.st-resc small{display:block;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:.15rem;}
.st-resc b{font-size:1.2rem;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
.st-resc.hero b{font-size:1.7rem;}
.st-resc .pos{color:var(--teal);}.st-resc .neg{color:var(--rose);}

/* ----- form ----- */
.st-form{display:grid;gap:1rem;}
.st-fcard{background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow-card);padding:clamp(1rem,3vw,1.6rem);display:grid;gap:1rem;min-width:0;}
.st-fhead{display:flex;gap:.9rem;align-items:flex-start;}
.st-fhead h3{margin:0;font-size:1.15rem;font-weight:800;letter-spacing:-.02em;}
.st-fhead p{margin:.15rem 0 0;font-size:.85rem;color:var(--muted);line-height:1.45;}
.st-fnum{flex-shrink:0;min-width:2.1rem;height:2.1rem;padding:0 .4rem;border-radius:.7rem;display:grid;place-items:center;background:var(--btn);color:var(--on-accent);font-weight:800;font-size:.85rem;}
.st-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12.5rem),1fr));gap:.9rem;}
.st-field{display:flex;flex-direction:column;gap:.4rem;min-width:0;}
.st-lab{font-size:.8rem;font-weight:700;color:var(--muted);display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;}
.st-lab em{font-style:normal;font-size:.68rem;font-weight:600;opacity:.7;}
.st-hint{font-size:.74rem;color:var(--muted);}
.st-in{width:100%;min-width:0;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-input);color:var(--text);padding:.75rem .9rem;font:inherit;font-size:1rem;line-height:1.5;transition:border-color .18s ease,box-shadow .18s ease;}
.st-in::placeholder{color:var(--muted);opacity:.7;}
.st-in:focus{outline:none;border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-dim);}
.st-in.bad{border-color:var(--rose);}
textarea.st-in{resize:vertical;min-height:3.2rem;}
.st-err{color:var(--rose);font-size:.82rem;font-weight:600;}
.st-seg{display:inline-flex;gap:.25rem;padding:.25rem;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface-2);flex-wrap:wrap;}
.st-seg.wide{display:flex;}
.st-seg.wide button{flex:1;}
.st-seg button{border:0;background:none;color:var(--muted);padding:.45rem .85rem;border-radius:var(--r-pill);font-size:.8rem;font-weight:700;cursor:pointer;min-height:2.4rem;}
.st-seg button.on{background:var(--btn);color:var(--on-accent);}
.st-seg button.on.buy{background:linear-gradient(180deg,#3fe0a9,#1d9b78);color:#06130f;}
.st-seg button.on.sell{background:linear-gradient(180deg,#ff8aa0,#d6435c);color:#fff;}
.st-addrow{display:flex;gap:.6rem;flex-wrap:wrap;}
.st-addrow .st-in{flex:1 1 12rem;}
.st-sugs{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.7rem;}
.st-sug{border:1px dashed var(--border);background:none;color:var(--muted);padding:.4rem .8rem;border-radius:var(--r-pill);font-size:.78rem;font-weight:600;cursor:pointer;min-height:2.2rem;}
.st-sug:hover{color:var(--text);border-color:var(--amber);}
.st-list{display:grid;gap:.7rem;}
.st-item{display:grid;grid-template-columns:auto 1fr auto;gap:.6rem;align-items:start;}
.st-itemn{width:2rem;height:2rem;margin-top:.45rem;border-radius:.65rem;display:grid;place-items:center;background:var(--amber-dim);color:var(--accent-text);font-weight:800;font-size:.8rem;}
.st-itembtns{display:flex;flex-direction:column;gap:.25rem;}
.st-itembtns button{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:.65rem;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;}
.st-itembtns button:hover:not(:disabled){color:var(--text);border-color:var(--amber);}
.st-itembtns button.danger:hover{color:var(--rose);border-color:var(--rose);}
.st-itembtns button:disabled{opacity:.3;cursor:default;}
@media (max-width:30rem){
  .st-item{grid-template-columns:1fr auto;}
  .st-itemn{display:none;}
  .st-itembtns{flex-direction:row;grid-column:1/-1;justify-content:flex-end;}
}
.st-imged{display:grid;gap:.7rem;}
.st-imglist{display:grid;gap:.8rem;}
.st-imgitem{display:grid;grid-template-columns:minmax(0,9rem) 1fr;gap:.9rem;padding:.7rem;border-radius:1.1rem;border:1px solid var(--border);background:var(--surface-2);}
.st-imgitem .st-pic{cursor:default;box-shadow:none;aspect-ratio:4/3;}
.st-imgmeta{display:grid;gap:.6rem;align-content:start;min-width:0;}
@media (max-width:30rem){.st-imgitem{grid-template-columns:1fr;}.st-imgitem .st-pic{aspect-ratio:16/9;}}
.st-upload{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:1rem;border-radius:var(--r-input);border:1.5px dashed var(--border);background:var(--surface-2);color:var(--muted);font-size:.88rem;font-weight:700;cursor:pointer;min-height:3.2rem;transition:all .18s ease;}
.st-upload:hover:not(:disabled){border-color:var(--amber);color:var(--text);}
.st-savebar{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:.7rem clamp(.9rem,3.5vw,2rem) calc(.7rem + env(safe-area-inset-bottom,0px));background:var(--bar-bg);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border-top:1px solid var(--border);}
.st-savein{max-width:50rem;margin:0 auto;display:flex;gap:.7rem;justify-content:flex-end;flex-wrap:wrap;}
.st-savein .st-btn{flex:1 1 9rem;max-width:16rem;}

/* ----- overlays ----- */
.st-backdrop{position:fixed;inset:0;z-index:100;background:rgba(3,10,30,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;animation:st-fade .2s ease;}
.st-backdrop.center{align-items:center;}
@keyframes st-fade{from{opacity:0;}to{opacity:1;}}
.st-lbimg{max-width:100%;max-height:88vh;border-radius:1rem;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.st-lbclose{position:absolute;top:calc(.8rem + env(safe-area-inset-top,0px));right:.8rem;width:2.8rem;height:2.8rem;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.5);color:#fff;display:grid;place-items:center;cursor:pointer;}
.st-modal{width:100%;max-width:26rem;background:var(--surface);background-color:var(--modal-bg);border:1px solid var(--border);border-radius:1.6rem;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:st-pop .25s cubic-bezier(.2,1.2,.4,1);color:var(--text);}
@keyframes st-pop{from{transform:scale(.94) translateY(8px);opacity:0;}to{transform:none;opacity:1;}}
.st-modal-t{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;margin-bottom:.4rem;}
.st-modal-s{margin:0 0 1.2rem;color:var(--muted);font-size:.9rem;line-height:1.5;overflow-wrap:anywhere;}
.st-modal-a{display:flex;gap:.7rem;}
.st-modal-a .st-btn{flex:1;}
.st-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(5.5rem + env(safe-area-inset-bottom,0px));z-index:110;max-width:calc(100vw - 2rem);padding:.7rem 1.2rem;border-radius:var(--r-pill);background:var(--modal-bg);border:1px solid var(--amber);color:var(--text);font-size:.85rem;font-weight:700;box-shadow:0 14px 30px -10px rgba(0,0,0,.6);animation:st-fade .2s ease;}

@media (max-width:34rem){.st-addtop span{display:none;}.st-addtop{padding:.6rem .9rem;}}
@media (prefers-reduced-motion:reduce){
  .st-root *{animation:none !important;transition-duration:.01s !important;}
  .sk::after{display:none;}
}
`;