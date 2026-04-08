/**
 * GET /api/chain?symbol=SPY[&expiration=2026-04-18][&num_expirations=4]
 * Fetches options chain data from Yahoo Finance.
 * Greeks are computed client-side in greeks.js.
 */

import { resolveSymbol, yahooFetch } from "./_yahoo.js";

function dateToTimestamp(dateStr) {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

function timestampToDate(ts) {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

async function fetchOptions(yfSymbol, expirationTs) {
  let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yfSymbol)}`;
  if (expirationTs) url += `?date=${expirationTs}`;

  const resp = await yahooFetch(url);
  if (!resp.ok) throw new Error(`Yahoo Finance returned ${resp.status}`);

  const data = await resp.json();
  return data?.optionChain?.result?.[0];
}

function parseContracts(contracts, type, expStr, today) {
  if (!contracts) return [];
  const dte = Math.max(daysBetween(today, expStr), 1);

  return contracts.map((c) => ({
    strike: c.strike,
    type,
    expiration: expStr,
    dte,
    bid: c.bid ?? 0,
    ask: c.ask ?? 0,
    lastPrice: c.lastPrice ?? 0,
    volume: c.volume ?? 0,
    openInterest: c.openInterest ?? 0,
    iv: c.impliedVolatility ?? 0,
  }));
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get("symbol") || "SPY").toUpperCase();
  const expParam = url.searchParams.get("expiration");
  const numExp = parseInt(url.searchParams.get("num_expirations") || "4", 10);
  const yfSymbol = resolveSymbol(symbol);
  const today = todayStr();

  try {
    const initial = await fetchOptions(yfSymbol);
    if (!initial) {
      return Response.json({ error: "No options data found" }, { status: 404 });
    }

    const spot =
      initial.quote?.regularMarketPrice ??
      initial.quote?.previousClose ??
      0;
    const allExpirations = (initial.expirationDates || []).map(timestampToDate);

    let targetExpirations;
    if (expParam) {
      targetExpirations = [expParam];
    } else {
      targetExpirations = allExpirations.slice(0, numExp);
    }

    const chainPromises = targetExpirations.map(async (expStr) => {
      const ts = dateToTimestamp(expStr);
      const result = await fetchOptions(yfSymbol, ts);
      if (!result) return [];

      const calls = parseContracts(result.options?.[0]?.calls, "call", expStr, today);
      const puts = parseContracts(result.options?.[0]?.puts, "put", expStr, today);
      return [...calls, ...puts];
    });

    const chains = await Promise.all(chainPromises);
    const chain = chains.flat();

    return Response.json({
      symbol,
      spot,
      expirations: targetExpirations,
      chain,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
