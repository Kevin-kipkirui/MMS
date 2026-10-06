const MARKETAUX_URL = "https://api.marketaux.com/v1/news/all";

// Each page costs one API request. The free plan returns only a few
// articles per request, so raise this only if your plan allows it.
const PAGES = 1;

// Macro-focused search (Marketaux supports | for OR and quotes for phrases)
const SEARCH =
  '"federal reserve" | inflation | "interest rates" | payrolls | ECB | "bank of england" | GDP | OPEC | tariffs | "central bank"';

// Keep results in memory for a while so you don't burn your daily quota
const CACHE_MS = 15 * 60 * 1000;
let cache = { at: 0, payload: null };

const HIGH_RE =
  /\b(federal reserve|fomc|powell|cpi|inflation|payrolls?|non-?farm|rate (decision|hike|cut)|interest rates?|ecb|lagarde|bank of japan|boj|bank of england|gdp|tariffs?)\b/;
const MED_RE =
  /\b(fed|unemployment|jobs|treasury|yields?|opec|oil|crude|central bank|recession|retail sales|pmi|dollar|gold)\b/;

function getText(a) {
  return [a.title, a.description, a.snippet].filter(Boolean).join(" ").toLowerCase();
}

function getImpact(a) {
  const t = getText(a);
  if (HIGH_RE.test(t)) return "high";
  if (MED_RE.test(t)) return "medium";
  return "low";
}

function getCategory(a) {
  const t = getText(a);
  if (/\b(federal reserve|fomc|powell|ecb|lagarde|bank of japan|boj|bank of england|central bank|interest rates?|rate (decision|hike|cut))\b/.test(t)) return "Central banks";
  if (/\b(cpi|inflation|gdp|jobs|payrolls?|non-?farm|unemployment|pmi|retail sales|recession)\b/.test(t)) return "Economy";
  if (/\b(oil|opec|crude|gold)\b/.test(t)) return "Commodities";
  if (/\b(bitcoin|crypto|ethereum)\b/.test(t)) return "Crypto";
  if (/\b(dollar|yen|euro|sterling|forex)\b/.test(t)) return "Forex";
  return "Markets";
}

function getSymbols(a) {
  const out = new Set();
  const t = getText(a);
  if (/\b(fed|federal reserve|fomc|powell|dollar|treasury)\b/.test(t)) out.add("USD");
  if (/\b(ecb|euro|eurozone|lagarde)\b/.test(t)) out.add("EUR");
  if (/\b(boj|yen|bank of japan)\b/.test(t)) out.add("JPY");
  if (/\b(bank of england|sterling|pound)\b/.test(t)) out.add("GBP");
  if (/\bgold\b/.test(t)) out.add("XAU");
  if (/\b(oil|opec|crude)\b/.test(t)) out.add("USOIL");
  if (/\b(bitcoin|crypto)\b/.test(t)) out.add("BTC");
  (a.entities || []).forEach((e) => {
    if (e && e.symbol) out.add(e.symbol);
  });
  return Array.from(out).slice(0, 6);
}

function normalizeArticle(a, index) {
  return {
    id: a.uuid || a.url || "marketaux-" + index,
    title: a.title || "Untitled",
    summary: a.description || a.snippet || "",
    source: a.source || "Marketaux",
    category: getCategory(a),
    time: a.published_at || null, // already an ISO UTC string
    impact: getImpact(a),
    symbols: getSymbols(a),
    actual: null,
    forecast: null,
    previous: null,
    url: a.url || null,
  };
}

async function fetchPage(token, page, publishedAfter) {
  const params = new URLSearchParams({
    api_token: token,
    search: SEARCH,
    language: "en",
    published_after: publishedAfter,
    page: String(page),
  });
  const r = await fetch(`${MARKETAUX_URL}?${params.toString()}`);
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.MARKETAUX_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "MARKETAUX_API_TOKEN is not configured." });
  }

  // Serve from memory if still fresh
  if (cache.payload && Date.now() - cache.at < CACHE_MS) {
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json(cache.payload);
  }

  try {
    // Last 48 hours, UTC, format Y-m-dTH:i:s (no trailing Z)
    const publishedAfter = new Date(Date.now() - 48 * 3600 * 1000)
      .toISOString()
      .slice(0, 19);

    const articles = [];
    for (let page = 1; page <= PAGES; page++) {
      const { ok, status, data } = await fetchPage(token, page, publishedAfter);

      if (!ok) {
        const code = data && data.error && data.error.code;
        const message = data && data.error && data.error.message;

        // If we have older data, show it instead of an error
        if (cache.payload) {
          res.setHeader("Cache-Control", "no-store");
          return res.status(200).json(cache.payload);
        }
        if (code === "usage_limit_reached" || code === "rate_limit_reached") {
          return res.status(429).json({
            error: "News limit reached for now. It will refresh automatically later.",
          });
        }
        if (code === "invalid_api_token") {
          return res.status(500).json({ error: "The Marketaux API token is invalid." });
        }
        return res.status(502).json({
          error: message || "News provider request failed (" + status + ").",
        });
      }

      const list = Array.isArray(data && data.data) ? data.data : [];
      articles.push(...list);
      const meta = (data && data.meta) || {};
      if (!meta.limit || (meta.returned || list.length) < meta.limit) break;
    }

    const seen = new Set();
    const items = articles
      .filter((a) => a && a.title && a.published_at)
      .filter((a) => {
        const key = a.uuid || a.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(normalizeArticle)
      .filter((i) => i.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    const payload = {
      items,
      updatedAt: new Date().toISOString(),
      source: "Marketaux",
    };
    cache = { at: Date.now(), payload };

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Economic news error:", error);
    if (cache.payload) return res.status(200).json(cache.payload);
    return res.status(500).json({ error: "Unable to fetch economic news." });
  }
}