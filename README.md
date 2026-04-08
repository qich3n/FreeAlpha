# FreeAlpha – Options Greeks Dashboard

A web dashboard that displays aggregate and per-strike options Greeks for **SPY** and **SPX**, powered by Yahoo Finance data.

## Features

- **Real-time options data** fetched from Yahoo Finance via `yfinance`
- **Greeks calculated** using the Black-Scholes model: Delta, Gamma, Vega, Theta, and Charm
- **Aggregate exposure metrics**: Net Delta (DEX), Gamma (GEX), Vega (VEX), and Charm (CEX) exposure across all strikes and expirations
- **Interactive bar charts** showing exposure profiles by strike
- **Filterable options chain table** with per-strike Greeks, adjustable by expiration, type (call/put), and strike range

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the server
python app.py

# 3. Open in your browser
open http://localhost:5000
```

## Architecture

| File | Purpose |
|------|---------|
| `app.py` | Flask backend – API endpoints, data fetching, aggregation |
| `greeks.py` | Black-Scholes Greeks calculator (scalar + vectorized) |
| `templates/index.html` | Dashboard HTML |
| `static/css/style.css` | Dark-themed responsive styles |
| `static/js/app.js` | Frontend logic, charts (Chart.js), table rendering |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/chain?symbol=SPY` | Full options chain with Greeks |
| `GET /api/chain?symbol=SPY&expiration=2025-01-17` | Chain for a specific expiration |
| `GET /api/expirations?symbol=SPY` | Available expiration dates |

## Greeks Reference

| Greek | Definition |
|-------|-----------|
| **Delta** | Rate of change of option price with respect to underlying price |
| **Gamma** | Rate of change of delta with respect to underlying price |
| **Vega** | Sensitivity of option price to a 1% change in implied volatility |
| **Theta** | Time decay per calendar day |
| **Charm** | Rate of change of delta with respect to time (delta bleed per day) |

## Disclaimer

For educational and informational purposes only. Not financial advice.
