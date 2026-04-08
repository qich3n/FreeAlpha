/**
 * Black-Scholes Greeks calculator (client-side).
 * Ports the Python greeks.py to JavaScript using the standard normal
 * distribution implemented via the rational approximation (Abramowitz & Stegun).
 */

// Standard normal PDF
function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF (Abramowitz & Stegun approximation, |error| < 7.5e-8)
function normCdf(x) {
  if (x === 0) return 0.5;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Compute Black-Scholes Greeks for a single option.
 *
 * @param {number} S     - Spot price
 * @param {number} K     - Strike price
 * @param {number} T     - Time to expiry in years (> 0)
 * @param {number} r     - Risk-free rate (annualized)
 * @param {number} sigma - Implied volatility (annualized)
 * @param {string} type  - "call" or "put"
 * @param {number} [q=0] - Continuous dividend yield
 * @returns {{ delta, gamma, vega, theta, charm }}
 */
function bsGreeks(S, K, T, r, sigma, type, q = 0) {
  if (T <= 0 || sigma <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, vega: 0, theta: 0, charm: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const phiD1 = normPdf(d1);
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);
  const isCall = type === "call";

  // Delta
  const delta = isCall
    ? eqT * normCdf(d1)
    : -eqT * normCdf(-d1);

  // Gamma (same for calls and puts)
  const gamma = eqT * phiD1 / (S * sigma * sqrtT);

  // Vega (per 1% vol move)
  const vega = S * eqT * phiD1 * sqrtT / 100.0;

  // Theta (per calendar day)
  const baseTheta = -S * eqT * phiD1 * sigma / (2.0 * sqrtT);
  const theta = isCall
    ? (baseTheta - r * K * erT * normCdf(d2) + q * S * eqT * normCdf(d1)) / 365.0
    : (baseTheta + r * K * erT * normCdf(-d2) - q * S * eqT * normCdf(-d1)) / 365.0;

  // Charm (delta bleed per day)
  const charmCommon = phiD1 * (2.0 * (r - q) * T - d2 * sigma * sqrtT) / (2.0 * T * sigma * sqrtT);
  const charm = isCall
    ? -eqT * (charmCommon + q * normCdf(d1)) / 365.0
    : -eqT * (charmCommon - q * normCdf(-d1)) / 365.0;

  return { delta, gamma, vega, theta, charm };
}

/**
 * Compute Greeks for an entire options chain array.
 * Mutates each row in-place, adding delta/gamma/vega/theta/charm fields.
 *
 * @param {Array} chain - Array of option objects with { strike, iv, type, dte }
 * @param {number} spot - Current spot price
 * @param {number} r    - Risk-free rate
 * @param {number} [q=0] - Dividend yield
 */
function computeChainGreeks(chain, spot, r, q = 0) {
  for (const row of chain) {
    const T = Math.max(row.dte, 1) / 365.0;
    const g = bsGreeks(spot, row.strike, T, r, row.iv, row.type, q);
    row.delta = g.delta;
    row.gamma = g.gamma;
    row.vega = g.vega;
    row.theta = g.theta;
    row.charm = g.charm;
  }
}
