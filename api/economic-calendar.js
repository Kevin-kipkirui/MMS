const FEEDS = [
  { url: "https://nfs.faireconomy.media/ff_calendar_thisweek.json", required: true },
  { url: "https://nfs.faireconomy.media/ff_calendar_nextweek.json", required: false },
];

const CACHE_MS = 15 * 60 * 1000;
let cache = { at: 0, payload: null };

// Extra markets tagged on medium/high events so users can filter by them
const RELATED = { USD: ["USD", "XAU", "US500", "BTC"] };

function getImpact(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  return "low"; // Low and Holiday
}

function getCategory(e) {
  const t = e.title || "";
  if (String(e.impact).toLowerCase() === "holiday" || /holiday/i.test(t)) return "Holidays";
  if (/(speaks|minutes|rate statement|monetary policy|press conference|accounts|\b(boe|boj|ecb|fomc|mpc|snb|rba|rbnz|boc)\b)/i.test(t)) return "Central banks";
  if (/(crude|oil|opec|natural gas|api weekly)/i.test(t)) return "Energy";
  if (/(employment|unemployment|jobless|claims|payroll|adp|job |earnings|wage)/i.test(t)) return "Employment";
  if (/\b(cpi|ppi|inflation|pce|deflator)\b/i.test(t)) return "Inflation";
  if (/(gdp|pmi|ism|retail sales|industrial production|factory orders|manufacturing|services|confidence|sentiment|optimism|consumer|business|leading indicators|durable|inventories)/i.test(t)) return "Activity";
  if (/(house|housing|hpi|building|construction)/i.test(t)) return "Housing";
  if (/(trade balance|current account|reserves|auction)/i.test(t)) return "Trade & bonds";
  return "Other";
}

function getSymbols(e, impact) {
  const cur = e.country === "All" ? "ALL" : e.country;
  const out = new Set([cur]);
  if (impact !== "low" && RELATED[cur]) RELATED[cur].forEach((s) => out.add(s));
  if (/(crude|oil|opec|natural gas)/i.test(e.title || "")) out.add("USOIL");
  return Array.from(out);
}

function normalize(e, index, seen) {
  const time = e.date ? new Date(e.date) : null;
  if (!time || isNaN(time.getTime())) return null;
  const impact = getImpact(e.impact);
  let id = `${e.country}-${time.toISOString()}-${e.title}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (seen.has(id)) id += "-" + index;
  seen.add(id);
  return {
    id,
    title: e.title || "Untitled",
    summary: "",
    source: "Economic calendar",
    category: getCategory(e),
    time: time.toISOString(),
    impact,
    symbols: getSymbols(e, impact),
    actual: null, // this feed does not publish actual values
    forecast: e.forecast || null,
    previous: e.previous || null,
    url: null,
  };
}

async function fetchFeed(url) {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TradingDashboard/1.0)" },
  });
  if (!r.ok) {
    const err = new Error("Calendar request failed (" + r.status + ")");
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("Unexpected calendar format");
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (cache.payload && Date.now() - cache.at < CACHE_MS) {
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json(cache.payload);
  }

  try {
    const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f.url)));

    const mainFailed = results[0].status === "rejected";
    if (mainFailed) {
      if (cache.payload) return res.status(200).json(cache.payload); // serve stale
      const status = results[0].reason && results[0].reason.status;
      return res.status(status === 429 ? 429 : 502).json({
        error:
          status === 429
            ? "The calendar provider is rate-limiting requests. Try again in a few minutes."
            : "Unable to load the economic calendar.",
      });
    }

    const raw = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const seen = new Set();
    const items = raw
      .map((e, i) => normalize(e, i, seen))
      .filter(Boolean)
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    const payload = { items, updatedAt: new Date().toISOString(), source: "Economic calendar" };
    cache = { at: Date.now(), payload };

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Economic calendar error:", error);
    if (cache.payload) return res.status(200).json(cache.payload);
    return res.status(500).json({ error: "Unable to load the economic calendar." });
  }
}