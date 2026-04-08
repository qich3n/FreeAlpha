/**
 * GET /api/expirations?symbol=SPY
 * Returns available option expiration dates from Yahoo Finance.
 */

import { resolveSymbol, yahooFetch } from "./_yahoo.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get("symbol") || "SPY").toUpperCase();
  const yfSymbol = resolveSymbol(symbol);

  try {
    const yfUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yfSymbol)}`;
    const resp = await yahooFetch(yfUrl);

    if (!resp.ok) {
      return Response.json(
        { error: `Yahoo Finance returned ${resp.status}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const chain = data?.optionChain?.result?.[0];
    if (!chain) {
      return Response.json({ error: "No options data found" }, { status: 404 });
    }

    const expirations = (chain.expirationDates || []).map((ts) => {
      const d = new Date(ts * 1000);
      return d.toISOString().split("T")[0];
    });

    return Response.json({ symbol, expirations });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
