"""
FreeAlpha – Options Greeks Dashboard
Flask backend that fetches options chains from Yahoo Finance and exposes
aggregate + per-strike Greeks for SPX / SPY.
"""

import datetime as dt
import os
import traceback

import numpy as np
import yfinance as yf
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from greeks import vectorized_greeks

app = Flask(__name__)
CORS(app)

SUPPORTED_TICKERS = {"SPY", "SPX", "^SPX"}
RISK_FREE_RATE = 0.043  # approximate 10-yr yield; update as needed
CONTRACT_MULTIPLIER = 100

# SPX uses ^SPX on Yahoo Finance
TICKER_MAP = {"SPX": "^SPX"}


def _resolve_ticker(symbol: str) -> str:
    symbol = symbol.upper()
    return TICKER_MAP.get(symbol, symbol)


def _fetch_chain(symbol: str, expiration: str | None = None, num_expirations: int = 4):
    """
    Fetch the options chain for *symbol*.
    If expiration is given, fetch only that date; otherwise fetch the nearest
    *num_expirations* expiration dates.
    """
    yf_symbol = _resolve_ticker(symbol)
    ticker = yf.Ticker(yf_symbol)
    spot = _get_spot(ticker)

    if spot is None:
        raise ValueError(f"Could not retrieve spot price for {symbol}")

    available = ticker.options  # tuple of 'YYYY-MM-DD' strings
    if not available:
        raise ValueError(f"No options data available for {symbol}")

    if expiration:
        expirations = [expiration]
    else:
        expirations = list(available[:num_expirations])

    today = dt.date.today()
    rows = []

    for exp_str in expirations:
        exp_date = dt.date.fromisoformat(exp_str)
        T = max((exp_date - today).days, 1) / 365.0

        chain = ticker.option_chain(exp_str)

        for side, df in [("call", chain.calls), ("put", chain.puts)]:
            if df.empty:
                continue

            strikes = df["strike"].values
            ivs = df["impliedVolatility"].values
            oi = df["openInterest"].fillna(0).values.astype(float)
            volume = df["volume"].fillna(0).values.astype(float)
            last_price = df["lastPrice"].fillna(0).values.astype(float)
            bid = df["bid"].fillna(0).values.astype(float)
            ask = df["ask"].fillna(0).values.astype(float)
            option_types = np.array([side] * len(strikes))

            greeks = vectorized_greeks(spot, strikes, T, RISK_FREE_RATE, ivs, option_types)

            for i in range(len(strikes)):
                rows.append({
                    "symbol": symbol.upper(),
                    "expiration": exp_str,
                    "dte": int(T * 365),
                    "strike": float(strikes[i]),
                    "type": side,
                    "bid": float(bid[i]),
                    "ask": float(ask[i]),
                    "lastPrice": float(last_price[i]),
                    "volume": int(volume[i]),
                    "openInterest": int(oi[i]),
                    "iv": float(ivs[i]),
                    "delta": float(greeks["delta"][i]),
                    "gamma": float(greeks["gamma"][i]),
                    "vega": float(greeks["vega"][i]),
                    "theta": float(greeks["theta"][i]),
                    "charm": float(greeks["charm"][i]),
                })

    return rows, spot, expirations


def _get_spot(ticker) -> float | None:
    info = ticker.info
    spot = info.get("regularMarketPrice") or info.get("previousClose")
    if spot:
        return float(spot)
    hist = ticker.history(period="1d")
    if not hist.empty:
        return float(hist["Close"].iloc[-1])
    return None


def _aggregate_exposure(rows, spot):
    """
    Compute aggregate Greek exposures across the chain.
    GEX = Σ OI × Gamma × 100 × S   (per strike, calls positive, puts negative)
    DEX = Σ OI × Delta × 100
    VEX = Σ OI × Vega × 100
    CEX = Σ OI × Charm × 100
    """
    strikes = sorted(set(r["strike"] for r in rows))
    gex_by_strike = {}
    dex_by_strike = {}
    vex_by_strike = {}
    cex_by_strike = {}

    for k in strikes:
        gex_by_strike[k] = 0.0
        dex_by_strike[k] = 0.0
        vex_by_strike[k] = 0.0
        cex_by_strike[k] = 0.0

    total_gex = 0.0
    total_dex = 0.0
    total_vex = 0.0
    total_cex = 0.0

    for r in rows:
        oi = r["openInterest"]
        k = r["strike"]
        sign = 1 if r["type"] == "call" else -1

        g = oi * r["gamma"] * CONTRACT_MULTIPLIER * spot * sign
        d = oi * r["delta"] * CONTRACT_MULTIPLIER * sign
        v = oi * r["vega"] * CONTRACT_MULTIPLIER * sign
        c = oi * r["charm"] * CONTRACT_MULTIPLIER * sign

        gex_by_strike[k] += g
        dex_by_strike[k] += d
        vex_by_strike[k] += v
        cex_by_strike[k] += c

        total_gex += g
        total_dex += d
        total_vex += v
        total_cex += c

    profile = []
    for k in strikes:
        profile.append({
            "strike": k,
            "gex": round(gex_by_strike[k], 2),
            "dex": round(dex_by_strike[k], 2),
            "vex": round(vex_by_strike[k], 2),
            "cex": round(cex_by_strike[k], 2),
        })

    return {
        "total_gex": round(total_gex, 2),
        "total_dex": round(total_dex, 2),
        "total_vex": round(total_vex, 2),
        "total_cex": round(total_cex, 2),
        "profile": profile,
    }


# ── Routes ───────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chain")
def api_chain():
    symbol = request.args.get("symbol", "SPY").upper()
    expiration = request.args.get("expiration", None)
    num_exp = int(request.args.get("num_expirations", 4))

    try:
        rows, spot, expirations = _fetch_chain(symbol, expiration, num_exp)
        exposure = _aggregate_exposure(rows, spot)
        return jsonify({
            "symbol": symbol,
            "spot": spot,
            "expirations": expirations,
            "exposure": exposure,
            "chain": rows,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/expirations")
def api_expirations():
    symbol = request.args.get("symbol", "SPY").upper()
    try:
        yf_symbol = _resolve_ticker(symbol)
        ticker = yf.Ticker(yf_symbol)
        return jsonify({"symbol": symbol, "expirations": list(ticker.options)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=True, host="0.0.0.0", port=port)
