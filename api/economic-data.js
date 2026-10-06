const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

function parseAlphaVantageTime(value) {
  if (!value) return null;

  // Alpha Vantage format: YYYYMMDDTHHMMSS
  const match = String(value).match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  ).toISOString();
}

function getCategory(topics = []) {
  const names = topics
    .map((topic) => topic?.topic)
    .filter(Boolean);

  if (names.includes("economy_macro")) return "Macro";
  if (names.includes("economy_monetary")) return "Central Banks";
  if (names.includes("economy_fiscal")) return "Fiscal";
  if (names.includes("financial_markets")) return "Markets";
  if (names.includes("energy_transportation")) return "Energy";

  return names[0] || "General";
}

function getSymbols(item) {
  const symbols = new Set();

  for (const ticker of item?.ticker_sentiment || []) {
    const tickerSymbol = ticker?.ticker;

    if (!tickerSymbol) continue;

    // Alpha Vantage can return things like:
    // "FOREX:USD"
    // "CRYPTO:BTC"
    // "AAPL"
    if (tickerSymbol.includes(":")) {
      const [, symbol] = tickerSymbol.split(":");
      if (symbol) symbols.add(symbol);
    } else {
      symbols.add(tickerSymbol);
    }
  }

  // Add USD for major macro/monetary news.
  const topics = (item?.topics || []).map((topic) => topic?.topic);

  if (
    topics.includes("economy_macro") ||
    topics.includes("economy_monetary") ||
    topics.includes("economy_fiscal")
  ) {
    symbols.add("USD");
  }

  return Array.from(symbols).slice(0, 8);
}

function getImpact(item) {
  const topics = (item?.topics || []).map((topic) => topic?.topic);

  const macroTopics = [
    "economy_macro",
    "economy_monetary",
    "economy_fiscal",
  ];

  const hasMacroTopic = topics.some((topic) =>
    macroTopics.includes(topic)
  );

  const sentimentScore = Math.abs(
    Number(item?.overall_sentiment_score || 0)
  );

  /*
   * This is NOT an official economic-calendar impact rating.
   * It is simply a relevance estimate for the UI.
   */
  if (hasMacroTopic && sentimentScore >= 0.35) {
    return "high";
  }

  if (hasMacroTopic || sentimentScore >= 0.2) {
    return "medium";
  }

  return "low";
}

function normalizeArticle(article, index) {
  const time = parseAlphaVantageTime(article?.time_published);

  return {
    id:
      article?.uuid ||
      article?.url ||
      `alpha-news-${index}`,

    title:
      article?.title ||
      "Untitled",

    summary:
      article?.summary ||
      "",

    source:
      article?.source ||
      "Alpha Vantage",

    category:
      getCategory(article?.topics),

    time,

    impact:
      getImpact(article),

    symbols:
      getSymbols(article),

    // NEWS_SENTIMENT does not provide economic-calendar
    // forecast/actual/previous values.
    actual: null,
    forecast: null,
    previous: null,

    url:
      article?.url ||
      null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "ALPHA_VANTAGE_API_KEY is not configured.",
    });
  }

  try {
    const params = new URLSearchParams({
      function: "NEWS_SENTIMENT",
      topics: "economy_macro",
      sort: "LATEST",
      limit: "30",
      apikey: apiKey,
    });

    const response = await fetch(
      `${ALPHA_VANTAGE_URL}?${params.toString()}`
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Alpha Vantage request failed.",
        status: response.status,
      });
    }

    const data = await response.json();

    // Alpha Vantage API errors / rate-limit responses
    if (data["Error Message"]) {
      return res.status(502).json({
        error: data["Error Message"],
      });
    }

    if (data["Information"]) {
      return res.status(429).json({
        error: data["Information"],
      });
    }

    if (data["Note"]) {
      return res.status(429).json({
        error: data["Note"],
      });
    }

    const feed = Array.isArray(data?.feed)
      ? data.feed
      : [];

    const items = feed
      .map(normalizeArticle)
      .filter((item) => item.title)
      .filter((item) => item.time)
      .slice(0, 30);

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json({
      items,
      updatedAt: new Date().toISOString(),
      source: "Alpha Vantage",
    });
  } catch (error) {
    console.error("Economic news error:", error);

    return res.status(500).json({
      error: "Unable to fetch economic news.",
    });
  }
}
