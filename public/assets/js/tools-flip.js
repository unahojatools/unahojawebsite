/* ============================================================
   tools-flip.js — Calculadora avanzada de flips + gráficos (Canvas)
   Estructura compatible con tu web (sin init(), cálculo local)
   Requisitos en HTML:
   - Inputs con ids f-...
   - Contenedores: #f-kpis, #f-table tbody
   - Canvas (gráficos): #chart-scenarios, #chart-mao, #chart-waterfall
   - Botones: #f-calc, #f-copy, #f-exportCsv
   ============================================================ */

(function () {
  "use strict";

  /* =======================
     Helpers de formato
     ======================= */
  function fmtEur(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function fmtEur2(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n);
  }

  function fmtPct(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(n);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function num(id, fallback = 0) {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : NaN;
    return isFinite(v) ? v : fallback;
  }

  function txt(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setText(id, s) {
    const el = document.getElementById(id);
    if (el) el.textContent = s;
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function safeDiv(a, b) {
    if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
    return a / b;
  }

  /* =======================
     Defaults "suaves" desde comparables
     - Modo: si existe valor manual en el campo destino (y no está vacío), NO se pisa.
     - Si está vacío o 0, se rellena con el valor sugerido.
     ======================= */
  function applySoftDefault(targetId, value) {
    const el = document.getElementById(targetId);
    if (!el) return;

    const raw = String(el.value ?? "").trim();
    const asNum = Number(raw);

    const shouldApply =
      raw === "" || (!isFinite(asNum)) || asNum === 0;

    if (shouldApply && isFinite(value)) {
      el.value = String(value);
      el.dataset.soft = "1";
    }
  }

  function clearSoftFlag(id) {
    const el = document.getElementById(id);
    if (!el) return;
    delete el.dataset.soft;
  }

  function markManualOnInput(ids) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => clearSoftFlag(id));
      el.addEventListener("change", () => clearSoftFlag(id));
    });
  }

  /* =======================
     Modelo de escenarios
     ======================= */
  const SCENARIOS = [
    { key: "pesimista", label: "Pesimista", arvAdj: -0.06, ttmAdj: +0.20, reformAdj: +0.10, sellFeesAdj: +0.10 },
    { key: "moderado",  label: "Moderado",  arvAdj:  0.00, ttmAdj:  0.00, reformAdj:  0.00, sellFeesAdj:  0.00 },
    { key: "optimista", label: "Optimista", arvAdj: +0.04, ttmAdj: -0.15, reformAdj: -0.05, sellFeesAdj: -0.05 },
  ];

  /* =======================
     Cálculo financiero básico (interés simple proporcional)
     ======================= */
  function financingCost({
    totalNeed,
    ltv,               // % deuda sobre totalNeed (0..1)
    annualRate,        // TIN anual (0..1)
    months,            // time to market
    entryFees,         // € gastos apertura/estudio/etc.
    monthlyFees,       // € fees mensuales
  }) {
    const debt = Math.max(0, totalNeed * clamp(ltv, 0, 1));
    const equity = Math.max(0, totalNeed - debt);

    const m = Math.max(0, months);
    const interest = debt * annualRate * (m / 12);
    const fees = (isFinite(entryFees) ? entryFees : 0) + (isFinite(monthlyFees) ? monthlyFees : 0) * m;

    return { debt, equity, interest, fees, total: interest + fees };
  }

  /* =======================
     Núcleo: calcular un escenario
     ======================= */
  function computeScenario(base, s) {
    // Ajustes del escenario
    const arv = base.arv * (1 + s.arvAdj);
    const ttmMonths = base.ttmMonths * (1 + s.ttmAdj);
    const reform = base.reformCost * (1 + s.reformAdj);

    const sellFeesPct = base.sellFeesPct * (1 + s.sellFeesAdj);
    const sellFees = arv * sellFeesPct;

    const purchaseCosts = base.purchaseCosts; // gastos compra fijos
    const holdingMonthly = base.holdingMonthly; // holding €/mes (IBI+comunidad+seguros+utilidades)
    const holding = holdingMonthly * ttmMonths;

    const totalNeed = base.purchasePrice + purchaseCosts + reform + base.contingency + holding;

    const fin = financingCost({
      totalNeed,
      ltv: base.ltv,
      annualRate: base.annualRate,
      months: ttmMonths,
      entryFees: base.finEntryFees,
      monthlyFees: base.finMonthlyFees,
    });

    const totalCostsAllIn =
      base.purchasePrice +
      purchaseCosts +
      reform +
      base.contingency +
      holding +
      fin.total +
      sellFees;

    const profit = arv - totalCostsAllIn;
    const roiEquity = safeDiv(profit, fin.equity);
    const margin = safeDiv(profit, arv);

    // MAO (maximum allowable offer)
    // Idea: dado un objetivo de margen sobre ARV (base.targetMargin),
    // MAO = ARV*(1 - targetMargin - sellFeesPct) - (purchaseCosts + reform + contingency + holding + financing)
    const mao =
      arv * (1 - base.targetMargin - sellFeesPct) -
      (purchaseCosts + reform + base.contingency + holding + fin.total);

    // Redondeo suave
    const maoRounded = isFinite(mao) ? Math.floor(mao / 1000) * 1000 : NaN;

    return {
      key: s.key,
      label: s.label,
      arv,
      ttmMonths,
      reform,
      sellFeesPct,
      sellFees,
      holding,
      totalNeed,
      fin,
      totalCostsAllIn,
      profit,
      roiEquity,
      margin,
      mao,
      maoRounded,
    };
  }

  /* =======================
     Lectura inputs + comparables → defaults
     ======================= */
  function pullComparablesAndApplyDefaults() {
    // Comparables (inputs opcionales)
    // Esperado (si existen):
    // c-price (€/m2), c-arv (€/m2), c-dom (días), c-discount (% compra vs mercado), c-sellFees (%), c-reform (€/m2)
    const compPriceM2 = num("c-price", NaN);
    const compArvM2 = num("c-arv", NaN);
    const compDomDays = num("c-dom", NaN);
    const compSellFeesPct = num("c-sellFees", NaN) / 100;
    const compReformM2 = num("c-reform", NaN);
    const compDiscountPct = num("c-discount", NaN) / 100;

    // Inputs base necesarios (si existen)
    const area = num("f-area", NaN);

    // Defaults suaves hacia campos de la calculadora
    // - ARV: si hay compArvM2 y area
    if (isFinite(compArvM2) && isFinite(area)) {
      applySoftDefault("f-arv", compArvM2 * area);
    }

    // - Precio compra objetivo: si hay compPriceM2, descuento, y area
    if (isFinite(compPriceM2) && isFinite(area)) {
      const impliedMarket = compPriceM2 * area;
      const impliedOffer = isFinite(compDiscountPct) ? impliedMarket * (1 - compDiscountPct) : impliedMarket;
      applySoftDefault("f-purchasePrice", impliedOffer);
    }

    // - TTM por DOM (días → meses aprox)
    if (isFinite(compDomDays)) {
      const months = compDomDays / 30.4;
      applySoftDefault("f-ttmMonths", months);
    }

    // - Sell fees %
    if (isFinite(compSellFeesPct)) {
      applySoftDefault("f-sellFeesPct", compSellFeesPct * 100);
    }

    // - Reforma por €/m2
    if (isFinite(compReformM2) && isFinite(area)) {
      applySoftDefault("f-reformCost", compReformM2 * area);
    }
  }

  function readBase() {
    pullComparablesAndApplyDefaults();

    const purchasePrice = num("f-purchasePrice", 0);
    const arv = num("f-arv", 0);
    const area = num("f-area", 0);

    const purchaseCosts = num("f-purchaseCosts", 0);
    const reformCost = num("f-reformCost", 0);
    const contingency = num("f-contingency", 0);

    const ttmMonths = num("f-ttmMonths", 6);
    const holdingMonthly = num("f-holdingMonthly", 0);

    const sellFeesPct = num("f-sellFeesPct", 3) / 100;

    const ltv = num("f-ltv", 70) / 100;
    const annualRate = num("f-annualRate", 8) / 100;
    const finEntryFees = num("f-finEntryFees", 0);
    const finMonthlyFees = num("f-finMonthlyFees", 0);

    const targetMargin = num("f-targetMargin", 0.12) / 100; // en % en UI

    return {
      purchasePrice,
      arv,
      area,
      purchaseCosts,
      reformCost,
      contingency,
      ttmMonths,
      holdingMonthly,
      sellFeesPct,
      ltv,
      annualRate,
      finEntryFees,
      finMonthlyFees,
      targetMargin,
    };
  }

  /* =======================
     UI: KPIs + tabla
     ======================= */
  function renderKpis(base, scenarios) {
    // KPI principal basado en Moderado
    const mid = scenarios.find((x) => x.key === "moderado") || scenarios[0];

    const kpisHtml = `
      <div class="kpi"><div class="k">MAO (moderado)</div><div class="v">${isFinite(mid.maoRounded) ? fmtEur(mid.maoRounded) : "—"}</div></div>
      <div class="kpi"><div class="k">Beneficio (moderado)</div><div class="v">${fmtEur2(mid.profit)}</div></div>
      <div class="kpi"><div class="k">Margen (moderado)</div><div class="v">${fmtPct(mid.margin)}</div></div>
      <div class="kpi"><div class="k">ROI (equity, moderado)</div><div class="v">${fmtPct(mid.roiEquity)}</div></div>
    `;
    setHTML("f-kpis", kpisHtml);

    const tbody = document.querySelector("#f-table tbody");
    if (!tbody) return;

    const rows = scenarios
      .map((s) => {
        return `
          <tr>
            <td>${s.label}</td>
            <td>${fmtEur(s.arv)}</td>
            <td>${fmtEur(s.totalCostsAllIn)}</td>
            <td>${fmtEur2(s.profit)}</td>
            <td>${fmtPct(s.margin)}</td>
            <td>${isFinite(s.maoRounded) ? fmtEur(s.maoRounded) : "—"}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;
  }

  /* =======================
     Gráficos (Canvas) — sin librerías
     ======================= */

  function getCanvas(id) {
    const c = document.getElementById(id);
    if (!c || !(c instanceof HTMLCanvasElement)) return null;
    return c;
  }

  function fitCanvasToCssSize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(220, Math.floor(rect.width));
    const h = Math.max(140, Math.floor(rect.height || 220));
    const pxW = Math.floor(w * dpr);
    const pxH = Math.floor(h * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawAxes(ctx, w, h, pad) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
    ctx.restore();
  }

  function drawBarsScenarios(scenarios) {
    const canvas = getCanvas("chart-scenarios");
    if (!canvas) return;

    const { ctx, w, h } = fitCanvasToCssSize(canvas);
    ctx.clearRect(0, 0, w, h);

    const pad = 22;
    drawAxes(ctx, w, h, pad);

    const values = scenarios.map((s) => s.profit);
    const minV = Math.min(...values, 0);
    const maxV = Math.max(...values, 0);
    const span = maxV - minV || 1;

    const n = scenarios.length;
    const barGap = 10;
    const plotW = w - pad * 2;
    const barW = (plotW - barGap * (n - 1)) / n;

    function yFor(v) {
      const t = (v - minV) / span;
      return (h - pad) - t * (h - pad * 2);
    }

    const zeroY = yFor(0);

    // Grid horizontal suave
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i <= 4; i++) {
      const yy = pad + ((h - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, yy);
      ctx.lineTo(w - pad, yy);
      ctx.stroke();
    }
    ctx.restore();

    // Barras
    scenarios.forEach((s, i) => {
      const x = pad + i * (barW + barGap);
      const y = yFor(s.profit);
      const top = Math.min(y, zeroY);
      const bot = Math.max(y, zeroY);
      const height = Math.max(1, bot - top);

      // Barra
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, top, barW, height);
      ctx.restore();

      // Etiqueta
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(s.label, x + barW / 2, h - pad + 4);
      ctx.restore();
    });

    // Línea cero
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(pad, zeroY);
    ctx.lineTo(w - pad, zeroY);
    ctx.stroke();
    ctx.restore();

    // Título
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Beneficio por escenario", pad, 6);
    ctx.restore();
  }

  function drawLineMaoVsArv(scenarios) {
    const canvas = getCanvas("chart-mao");
    if (!canvas) return;

    const { ctx, w, h } = fitCanvasToCssSize(canvas);
    ctx.clearRect(0, 0, w, h);

    const pad = 26;
    drawAxes(ctx, w, h, pad);

    // Serie: puntos (ARV, MAO)
    const xs = scenarios.map((s) => s.arv);
    const ys = scenarios.map((s) => s.mao);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    function xFor(v) {
      const t = (v - minX) / spanX;
      return pad + t * (w - pad * 2);
    }
    function yFor(v) {
      const t = (v - minY) / spanY;
      return (h - pad) - t * (h - pad * 2);
    }

    // Grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i <= 4; i++) {
      const yy = pad + ((h - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, yy);
      ctx.lineTo(w - pad, yy);
      ctx.stroke();
    }
    ctx.restore();

    // Línea
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    scenarios.forEach((s, i) => {
      const x = xFor(s.arv);
      const y = yFor(s.mao);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Puntos + labels
    scenarios.forEach((s) => {
      const x = xFor(s.arv);
      const y = yFor(s.mao);

      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s.label, x + 8, y);
      ctx.restore();
    });

    // Título
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("MAO vs ARV (escenarios)", pad, 6);
    ctx.restore();
  }

  function drawWaterfallBase(mid) {
    const canvas = getCanvas("chart-waterfall");
    if (!canvas) return;

    const { ctx, w, h } = fitCanvasToCssSize(canvas);
    ctx.clearRect(0, 0, w, h);

    const pad = 22;
    drawAxes(ctx, w, h, pad);

    // Cascada: ARV -> restas de costes -> Profit
    const items = [
      { label: "ARV", value: mid.arv, type: "total" },
      { label: "Compra", value: -mid.base.purchasePrice, type: "delta" },
      { label: "Gastos compra", value: -mid.base.purchaseCosts, type: "delta" },
      { label: "Reforma", value: -mid.reform, type: "delta" },
      { label: "Contingencia", value: -mid.base.contingency, type: "delta" },
      { label: "Holding", value: -mid.holding, type: "delta" },
      { label: "Financiación", value: -mid.fin.total, type: "delta" },
      { label: "Venta", value: -mid.sellFees, type: "delta" },
      { label: "Beneficio", value: mid.profit, type: "total" },
    ];

    // Acumulados
    let running = 0;
    const bars = [];
    items.forEach((it, idx) => {
      if (idx === 0) {
        running = it.value;
        bars.push({ label: it.label, start: 0, end: running });
        return;
      }
      if (it.type === "delta") {
        const start = running;
        running = running + it.value;
        bars.push({ label: it.label, start, end: running });
        return;
      }
      // total final (beneficio)
      bars.push({ label: it.label, start: 0, end: it.value });
    });

    const ends = bars.map((b) => b.end);
    const minV = Math.min(...ends, 0);
    const maxV = Math.max(...ends, 0);
    const span = maxV - minV || 1;

    function yFor(v) {
      const t = (v - minV) / span;
      return (h - pad) - t * (h - pad * 2);
    }

    const n = bars.length;
    const gap = 8;
    const plotW = w - pad * 2;
    const barW = (plotW - gap * (n - 1)) / n;

    // Grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i <= 4; i++) {
      const yy = pad + ((h - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, yy);
      ctx.lineTo(w - pad, yy);
      ctx.stroke();
    }
    ctx.restore();

    // Barras
    bars.forEach((b, i) => {
      const x = pad + i * (barW + gap);
      const y1 = yFor(b.start);
      const y2 = yFor(b.end);
      const top = Math.min(y1, y2);
      const height = Math.max(1, Math.abs(y2 - y1));

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, top, barW, height);
      ctx.restore();

      // Labels
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(b.label, x + barW / 2, h - pad + 4);
      ctx.restore();
    });

    // Título
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Cascada de costes (moderado)", pad, 6);
    ctx.restore();
  }

  function renderCharts(base, scenarios) {
    // Nota: los ctx usan el color actual del canvas (heredado),
    // si quieres colores exactos del sistema, dime y lo adaptamos a variables CSS.
    drawBarsScenarios(scenarios);
    drawLineMaoVsArv(scenarios);

    const mid = scenarios.find((x) => x.key === "moderado") || scenarios[0];
    drawWaterfallBase({ ...mid, base });
  }

  /* =======================
     Cálculo principal
     ======================= */
  function flipCalculate() {
    const base = readBase();

    // Guard clauses mínimos
    const scenarios = SCENARIOS.map((s) => computeScenario(base, s));

    // Render UI
    renderKpis(base, scenarios);

    // Charts
    renderCharts(base, scenarios);

    return { base, scenarios };
  }

  /* =======================
     Copy + CSV
     ======================= */
  function makeCopyText(r) {
    const mid = r.scenarios.find((x) => x.key === "moderado") || r.scenarios[0];
    return `Flip (moderado)
Compra: ${fmtEur(r.base.purchasePrice)}
ARV: ${fmtEur(mid.arv)}
TTM: ${mid.ttmMonths.toFixed(1)} meses
Reforma: ${fmtEur(mid.reform)}
Coste total: ${fmtEur(mid.totalCostsAllIn)}
Beneficio: ${fmtEur2(mid.profit)}
Margen: ${isFinite(mid.margin) ? (mid.margin * 100).toFixed(2) + "%" : "—"}
ROI (equity): ${isFinite(mid.roiEquity) ? (mid.roiEquity * 100).toFixed(2) + "%" : "—"}
MAO: ${isFinite(mid.maoRounded) ? fmtEur(mid.maoRounded) : "—"}`;
  }

  function exportCsv(r) {
    const rows = [
      ["Escenario", "ARV", "Coste total", "Beneficio", "Margen", "MAO"],
      ...r.scenarios.map((s) => [
        s.label,
        s.arv,
        s.totalCostsAllIn,
        s.profit,
        s.margin,
        s.maoRounded,
      ]),
    ];

    const csv = rows.map((x) => x.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flip_escenarios.csv";
    a.click();
  }

  /* =======================
     Bindings
     ======================= */
  function bind() {
    document.getElementById("f-calc")?.addEventListener("click", () => flipCalculate());

    document.getElementById("f-copy")?.addEventListener("click", () => {
      const r = flipCalculate();
      const text = makeCopyText(r);
      navigator.clipboard?.writeText(text);
    });

    document.getElementById("f-exportCsv")?.addEventListener("click", () => {
      const r = flipCalculate();
      exportCsv(r);
    });

    // Si existen comparables, al cambiar recalculamos y además aplicamos defaults suaves
    const compIds = ["c-price", "c-arv", "c-dom", "c-discount", "c-sellFees", "c-reform"];
    compIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => flipCalculate());
      el.addEventListener("change", () => flipCalculate());
    });

    // Cuando el usuario toca campos clave, se consideran manuales (para no sobrescribir)
    markManualOnInput([
      "f-purchasePrice",
      "f-arv",
      "f-ttmMonths",
      "f-sellFeesPct",
      "f-reformCost",
      "f-area",
    ]);

    // Redibujar al cambiar tamaño (responsive)
    window.addEventListener("resize", () => {
      flipCalculate();
    });
  }

  bind();
  flipCalculate();
})();
