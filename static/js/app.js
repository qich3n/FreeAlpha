/* ── FreeAlpha frontend ───────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const symbolSelect   = $("#symbolSelect");
const expSelect      = $("#expSelect");
const loadBtn        = $("#loadBtn");
const loading        = $("#loading");
const errorBanner    = $("#errorBanner");
const summarySection = $("#summarySection");
const chartsSection  = $("#chartsSection");
const tableSection   = $("#tableSection");
const tableExpFilter = $("#tableExpFilter");
const tableTypeFilter= $("#tableTypeFilter");
const strikeRange    = $("#strikeRange");
const strikeRangeLabel = $("#strikeRangeLabel");

let currentData = null;
let charts = {};

// ── Initialization ──────────────────────────────────────────────────

symbolSelect.addEventListener("change", loadExpirations);
loadBtn.addEventListener("click", loadChain);
tableExpFilter.addEventListener("change", renderTable);
tableTypeFilter.addEventListener("change", renderTable);
strikeRange.addEventListener("input", () => {
  strikeRangeLabel.textContent = `±${strikeRange.value}%`;
  renderTable();
});

loadExpirations();

// ── API calls ───────────────────────────────────────────────────────

async function loadExpirations() {
  const symbol = symbolSelect.value;
  try {
    const resp = await fetch(`/api/expirations?symbol=${symbol}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    expSelect.innerHTML = '<option value="">Nearest 4</option>';
    (data.expirations || []).forEach((exp) => {
      const opt = document.createElement("option");
      opt.value = exp;
      opt.textContent = exp;
      expSelect.appendChild(opt);
    });
  } catch (e) {
    console.error("Failed to load expirations:", e);
  }
}

async function loadChain() {
  const symbol = symbolSelect.value;
  const exp = expSelect.value;
  showLoading(true);
  hideError();

  let url = `/api/chain?symbol=${symbol}`;
  if (exp) url += `&expiration=${exp}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    currentData = data;
    render(data);
  } catch (e) {
    showError(e.message || "Failed to load data");
  } finally {
    showLoading(false);
  }
}

// ── Rendering ───────────────────────────────────────────────────────

function render(data) {
  renderSummary(data);
  renderCharts(data);
  populateTableFilters(data);
  renderTable();
  summarySection.classList.remove("hidden");
  chartsSection.classList.remove("hidden");
  tableSection.classList.remove("hidden");
}

function renderSummary(data) {
  $("#spotValue").textContent = fmt(data.spot, 2);
  $("#dexValue").textContent = fmtLarge(data.exposure.total_dex);
  $("#gexValue").textContent = fmtLarge(data.exposure.total_gex);
  $("#vexValue").textContent = fmtLarge(data.exposure.total_vex);
  $("#cexValue").textContent = fmtLarge(data.exposure.total_cex);

  colorize($("#dexValue"), data.exposure.total_dex);
  colorize($("#gexValue"), data.exposure.total_gex);
  colorize($("#vexValue"), data.exposure.total_vex);
  colorize($("#cexValue"), data.exposure.total_cex);
}

function renderCharts(data) {
  const profile = filterProfileAroundSpot(data.exposure.profile, data.spot, 12);
  const labels = profile.map((p) => p.strike.toFixed(0));

  createBarChart("gexChart", "gex", labels, profile.map((p) => p.gex), data.spot, "GEX");
  createBarChart("dexChart", "dex", labels, profile.map((p) => p.dex), data.spot, "DEX");
  createBarChart("vexChart", "vex", labels, profile.map((p) => p.vex), data.spot, "VEX");
  createBarChart("cexChart", "cex", labels, profile.map((p) => p.cex), data.spot, "CEX");
}

function filterProfileAroundSpot(profile, spot, pctRange) {
  const lo = spot * (1 - pctRange / 100);
  const hi = spot * (1 + pctRange / 100);
  return profile.filter((p) => p.strike >= lo && p.strike <= hi);
}

function createBarChart(canvasId, key, labels, values, spot, label) {
  if (charts[key]) charts[key].destroy();

  const ctx = document.getElementById(canvasId).getContext("2d");
  const colors = values.map((v) =>
    v >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"
  );

  charts[key] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label, data: values, backgroundColor: colors, borderRadius: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${label}: ${fmtLarge(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#6b7280", maxRotation: 45, font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: {
            color: "#6b7280",
            font: { size: 10 },
            callback: (v) => fmtLarge(v),
          },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

function populateTableFilters(data) {
  tableExpFilter.innerHTML = '<option value="">All</option>';
  (data.expirations || []).forEach((exp) => {
    const opt = document.createElement("option");
    opt.value = exp;
    opt.textContent = exp;
    tableExpFilter.appendChild(opt);
  });
}

function renderTable() {
  if (!currentData) return;
  const tbody = document.querySelector("#chainTable tbody");
  tbody.innerHTML = "";

  const expFilter = tableExpFilter.value;
  const typeFilter = tableTypeFilter.value;
  const range = parseInt(strikeRange.value, 10);
  const spot = currentData.spot;
  const lo = spot * (1 - range / 100);
  const hi = spot * (1 + range / 100);

  let rows = currentData.chain.filter((r) => {
    if (expFilter && r.expiration !== expFilter) return false;
    if (typeFilter && r.type !== typeFilter) return false;
    if (r.strike < lo || r.strike > hi) return false;
    return true;
  });

  rows.sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type));

  const frag = document.createDocumentFragment();
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.expiration}</td>
      <td>${r.strike.toFixed(1)}</td>
      <td class="${r.type === "call" ? "call-type" : "put-type"}">${r.type.toUpperCase()}</td>
      <td>${fmt(r.bid, 2)}</td>
      <td>${fmt(r.ask, 2)}</td>
      <td>${fmt(r.lastPrice, 2)}</td>
      <td>${r.volume.toLocaleString()}</td>
      <td>${r.openInterest.toLocaleString()}</td>
      <td>${(r.iv * 100).toFixed(1)}%</td>
      <td class="${r.delta >= 0 ? "positive" : "negative"}">${fmt(r.delta, 4)}</td>
      <td>${fmt(r.gamma, 5)}</td>
      <td>${fmt(r.vega, 4)}</td>
      <td class="${r.theta >= 0 ? "positive" : "negative"}">${fmt(r.theta, 4)}</td>
      <td class="${r.charm >= 0 ? "positive" : "negative"}">${fmt(r.charm, 6)}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

// ── Utilities ───────────────────────────────────────────────────────

function fmt(n, digits) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(digits);
}

function fmtLarge(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

function colorize(el, val) {
  el.classList.remove("positive", "negative");
  if (val > 0) el.classList.add("positive");
  else if (val < 0) el.classList.add("negative");
}

function showLoading(on) {
  loading.classList.toggle("hidden", !on);
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.classList.add("hidden");
}
