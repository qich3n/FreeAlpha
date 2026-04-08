/**
 * Shared Yahoo Finance auth helper for Cloudflare Workers.
 * Yahoo requires a cookie + crumb pair for API access.
 * Flow: GET fc.yahoo.com → extract cookies → GET crumb → use both.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TICKER_MAP = { SPX: "^SPX" };

export function resolveSymbol(symbol) {
  const s = symbol.toUpperCase();
  return TICKER_MAP[s] || s;
}

/**
 * Obtain a valid { cookie, crumb } pair from Yahoo Finance.
 */
async function getAuth() {
  // Step 1: hit a Yahoo page to get session cookies
  const initResp = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });

  // Collect Set-Cookie headers
  const rawCookies = initResp.headers.getAll
    ? initResp.headers.getAll("set-cookie")
    : [initResp.headers.get("set-cookie")].filter(Boolean);

  const cookieStr = rawCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  // Step 2: fetch the crumb
  const crumbResp = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookieStr,
      },
    }
  );

  const crumb = await crumbResp.text();
  return { cookie: cookieStr, crumb: crumb.trim() };
}

/**
 * Fetch a Yahoo Finance API URL with proper auth.
 */
export async function yahooFetch(url) {
  // Try without auth first (some endpoints still work)
  let resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (resp.ok) return resp;

  // Fall back to crumb-based auth
  const { cookie, crumb } = await getAuth();
  const separator = url.includes("?") ? "&" : "?";
  const authedUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  resp = await fetch(authedUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  return resp;
}
