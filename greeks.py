"""
Black-Scholes Greeks calculator.
Computes delta, gamma, vega, theta, and charm for European options.
"""

import numpy as np
from scipy.stats import norm


def black_scholes_greeks(S, K, T, r, sigma, option_type="call", q=0.0):
    """
    Calculate Black-Scholes Greeks for a European option.

    Parameters
    ----------
    S : float – spot price of the underlying
    K : float – strike price
    T : float – time to expiration in years (must be > 0)
    r : float – risk-free interest rate (annualized, e.g. 0.05 for 5%)
    sigma : float – implied volatility (annualized, e.g. 0.20 for 20%)
    option_type : str – "call" or "put"
    q : float – continuous dividend yield (annualized)

    Returns
    -------
    dict with keys: delta, gamma, vega, theta, charm
    """
    if T <= 0 or sigma <= 0:
        return {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0, "charm": 0.0}

    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    nd1 = norm.cdf(d1)
    nd2 = norm.cdf(d2)
    phi_d1 = norm.pdf(d1)

    # Delta
    if option_type == "call":
        delta = np.exp(-q * T) * nd1
    else:
        delta = -np.exp(-q * T) * norm.cdf(-d1)

    # Gamma (same for calls and puts)
    gamma = np.exp(-q * T) * phi_d1 / (S * sigma * sqrt_T)

    # Vega (per 1% move in vol → divide by 100)
    vega = S * np.exp(-q * T) * phi_d1 * sqrt_T / 100.0

    # Theta (per calendar day → divide by 365)
    if option_type == "call":
        theta = (
            -S * np.exp(-q * T) * phi_d1 * sigma / (2.0 * sqrt_T)
            - r * K * np.exp(-r * T) * nd2
            + q * S * np.exp(-q * T) * nd1
        ) / 365.0
    else:
        theta = (
            -S * np.exp(-q * T) * phi_d1 * sigma / (2.0 * sqrt_T)
            + r * K * np.exp(-r * T) * norm.cdf(-d2)
            - q * S * np.exp(-q * T) * norm.cdf(-d1)
        ) / 365.0

    # Charm  =  -dDelta/dT  (delta bleed per day → divide by 365)
    if option_type == "call":
        charm = -np.exp(-q * T) * (
            phi_d1 * (2.0 * (r - q) * T - d2 * sigma * sqrt_T) / (2.0 * T * sigma * sqrt_T)
            + q * nd1
        ) / 365.0
    else:
        charm = -np.exp(-q * T) * (
            phi_d1 * (2.0 * (r - q) * T - d2 * sigma * sqrt_T) / (2.0 * T * sigma * sqrt_T)
            - q * norm.cdf(-d1)
        ) / 365.0

    return {
        "delta": float(delta),
        "gamma": float(gamma),
        "vega": float(vega),
        "theta": float(theta),
        "charm": float(charm),
    }


def vectorized_greeks(S, K_arr, T, r, sigma_arr, option_types, q=0.0):
    """
    Vectorized Greeks calculation across arrays of strikes/IVs.

    Parameters
    ----------
    S : float
    K_arr : np.ndarray of strikes
    T : float
    r : float
    sigma_arr : np.ndarray of implied volatilities
    option_types : np.ndarray of "call"/"put" strings
    q : float

    Returns
    -------
    dict of np.ndarrays: delta, gamma, vega, theta, charm
    """
    K = np.asarray(K_arr, dtype=float)
    sigma = np.asarray(sigma_arr, dtype=float)
    is_call = np.array([t == "call" for t in option_types])

    valid = (T > 0) & (sigma > 0) & (K > 0)
    delta = np.zeros_like(K)
    gamma = np.zeros_like(K)
    vega = np.zeros_like(K)
    theta = np.zeros_like(K)
    charm = np.zeros_like(K)

    if not np.any(valid):
        return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta, "charm": charm}

    Kv = K[valid]
    sv = sigma[valid]
    ic = is_call[valid]
    sqrt_T = np.sqrt(T)

    d1 = (np.log(S / Kv) + (r - q + 0.5 * sv ** 2) * T) / (sv * sqrt_T)
    d2 = d1 - sv * sqrt_T
    phi_d1 = norm.pdf(d1)

    # Delta
    d = np.where(ic, np.exp(-q * T) * norm.cdf(d1), -np.exp(-q * T) * norm.cdf(-d1))
    delta[valid] = d

    # Gamma
    g = np.exp(-q * T) * phi_d1 / (S * sv * sqrt_T)
    gamma[valid] = g

    # Vega (per 1% vol)
    v = S * np.exp(-q * T) * phi_d1 * sqrt_T / 100.0
    vega[valid] = v

    # Theta (per day)
    base_theta = -S * np.exp(-q * T) * phi_d1 * sv / (2.0 * sqrt_T)
    call_theta = (base_theta - r * Kv * np.exp(-r * T) * norm.cdf(d2) + q * S * np.exp(-q * T) * norm.cdf(d1)) / 365.0
    put_theta = (base_theta + r * Kv * np.exp(-r * T) * norm.cdf(-d2) - q * S * np.exp(-q * T) * norm.cdf(-d1)) / 365.0
    theta[valid] = np.where(ic, call_theta, put_theta)

    # Charm (per day)
    charm_common = phi_d1 * (2.0 * (r - q) * T - d2 * sv * sqrt_T) / (2.0 * T * sv * sqrt_T)
    call_charm = -np.exp(-q * T) * (charm_common + q * norm.cdf(d1)) / 365.0
    put_charm = -np.exp(-q * T) * (charm_common - q * norm.cdf(-d1)) / 365.0
    charm[valid] = np.where(ic, call_charm, put_charm)

    return {
        "delta": delta,
        "gamma": gamma,
        "vega": vega,
        "theta": theta,
        "charm": charm,
    }
