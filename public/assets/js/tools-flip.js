/* ============================================================
   /assets/js/tools-flip.js
   Calculadora de flip inmobiliario (UnaHojaTools)
   - Baseline €/m² por CCAA + micro ajuste
   - Comparables (tabla editable) -> sugerencias "en gris" (soft defaults)
   - MAO por objetivo (profit / margen / IRR) + buffer
   - Escenarios (multiplicadores)
   - Sensibilidad MAO vs ARV
   - Gráficos Canvas: escenarios, sensibilidad, cascada (base)
   ============================================================ */

(function () {
  "use strict";

  /* =======================
     Utilidades DOM
     ======================= */
  const $ = (id) => document.getElementById(id);

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function num(id, fallback = 0) {
    const el = $(id);
    if (!el) return fallback;
    const v = Number(el.value);
    return isFinite(v) ? v : fallback;
  }

  function str(id, fallback = "") {
    const el = $(id);
    if (!el) return fallback;
    return String(el.value ?? fallback);
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  /* =======================
     Formato
     ======================= */
  function fmtEur(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  }
  function fmtEur2(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
  }
  function fmtPct(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 2 }).format(n);
  }
  function fmtNum(n, d = 2) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: d }).format(n);
  }

  /* =======================
     Sugeridos (soft defaults)
     - Si el usuario cambia, se considera Confirmado.
     ======================= */
  function isEmptyLike(el) {
    if (!el) return true;
    const raw = String(el.value ?? "").trim();
    if (raw === "") return true;
    const v = Number(raw);
    return !isFinite(v) || v === 0;
  }

  function applySoft(id, v, hintId, hintText) {
    const el = $(id);
    if (!el) return;
    if (!isFinite(v)) return;

    if (isEmptyLike(el) || el.dataset.soft === "1") {
      el.value = String(v);
      el.dataset.soft = "1";
      if (hintId) setText(hintId, hintText || "Sugerido automáticamente.");
    }
  }

  function markConfirmedOnUserEdit(el) {
    if (!el) return;
    el.addEventListener("input", () => { el.dataset.soft = "0"; }, { passive: true });
    el.addEventListener("change", () => { el.dataset.soft = "0"; }, { passive: true });
  }

  function markConfirmed(ids) {
    ids.forEach((id) => markConfirmedOnUserEdit($(id)));
  }

  function clearAllSoftFlags() {
    const ids = [
      "f-saleEurM2","f-salePrice","f-saleDiscPct","f-saleMonths",
      "f-renoEurM2","f-bufferPct"
    ];
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.dataset.soft = "1";
    });
  }

  /* =======================
     Baselines €/m² por CCAA (idealista ene 2026)
     - Ajusta si cambias de fuente; dejamos dos mapas para selector.
     ======================= */
  const BASELINE = {
    idealista_jan2026: {
      "Andalucía": 2784, "Aragón": 1617, "Asturias": 1714, "Baleares": 5194, "Canarias": 3200,
      "Cantabria": 2047, "Castilla y León": 1287, "Castilla-La Mancha": 1048, "Cataluña": 2776,
      "Ceuta": 2447, "Comunitat Valenciana": 2422, "Euskadi": 3460, "Extremadura": 1040,
      "Galicia": 1505, "La Rioja": 1451, "Madrid": 4585, "Melilla": 2048, "Murcia": 1696, "Navarra": 1867
    },
    // Placeholder razonable: si no tienes datos reales de Fotocasa 2026 cargados aquí,
    // replicamos idealista para no romper el UX. Cuando tengas el dataset, sustitúyelo.
    fotocasa_feb2026: {
      "Andalucía": 2784, "Aragón": 1617, "Asturias": 1714, "Baleares": 5194, "Canarias": 3200,
      "Cantabria": 2047, "Castilla y León": 1287, "Castilla-La Mancha": 1048, "Cataluña": 2776,
      "Ceuta": 2447, "Comunitat Valenciana": 2422, "Euskadi": 3460, "Extremadura": 1040,
      "Galicia": 1505, "La Rioja": 1451, "Madrid": 4585, "Melilla": 2048, "Murcia": 1696, "Navarra": 1867
    }
  };

  function baselineEurM2() {
    const ccaa = str("f-ccaa");
    const src = str("f-source", "idealista_jan2026");
    const map = BASELINE[src] || BASELINE.idealista_jan2026;
    const b = map[ccaa];
    return isFinite(b) ? b : NaN;
  }

  /* =======================
     Comparables (tabla)
     ======================= */
  function loadComps() {
    try {
      const raw = localStorage.getItem("flip_comps_v1");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveComps(comps) {
    try {
      localStorage.setItem("flip_comps_v1", JSON.stringify(comps));
    } catch { /* noop */ }
  }

  function newComp() {
    return { zone: "", m2: 80, ask: 0, close: 0, dom: 0, adjPct: 0, conf: "media" };
  }

  function compWeight(conf) {
    if (conf === "alta") return 1.0;
    if (conf === "baja") return 0.4;
    return 0.7; // media
  }

  function compEffectiveEurM2(c) {
    const m2 = Math.max(1, Number(c.m2) || 1);
    const basePrice = (Number(c.close) > 0 ? Number(c.close) : Number(c.ask)) || 0;
    const eurM2 = basePrice / m2;
    const adj = 1 + (Number(c.adjPct) || 0) / 100;
    return eurM2 * adj;
  }

  function computeCompStats(comps) {
    const valid = comps
      .map((c) => {
        const eurM2 = compEffectiveEurM2(c);
        const w = compWeight(c.conf);
        const dom = Number(c.dom) || 0;
        const ask = Number(c.ask) || 0;
        const close = Number(c.close) || 0;
        const disc = (ask > 0 && close > 0) ? clamp((ask - close) / ask, 0, 0.5) : NaN;
        return { eurM2, w, dom, disc };
      })
      .filter((x) => isFinite(x.eurM2) && x.eurM2 > 0);

    const n = valid.length;
    if (n === 0) return {
      n: 0, eurM2: NaN, domDays: NaN, discPct: NaN, dispersion: NaN, score: 0
    };

    const wSum = valid.reduce((s, x) => s + x.w, 0) || 1;
    const eurM2 = valid.reduce((s, x) => s + x.eurM2 * x.w, 0) / wSum;

    const domVals = valid.filter(x => x.dom > 0);
    const domWsum = domVals.reduce((s, x) => s + x.w, 0) || 1;
    const domDays = domVals.length ? (domVals.reduce((s, x) => s + x.dom * x.w, 0) / domWsum) : NaN;

    const discVals = valid.filter(x => isFinite(x.disc));
    const discWsum = discVals.reduce((s, x) => s + x.w, 0) || 1;
    const discPct = discVals.length ? (discVals.reduce((s, x) => s + x.disc * x.w, 0) / discWsum) : NaN;

    // Dispersión (coef. variación aprox.)
    const mean = eurM2;
    const varW = valid.reduce((s, x) => s + x.w * Math.pow(x.eurM2 - mean, 2), 0) / wSum;
    const sd = Math.sqrt(Math.max(0, varW));
    const dispersion = (mean > 0) ? (sd / mean) : NaN;

    // Score 0–100 (simple y estable)
    // - + por nº comps
    // - + por baja dispersión
    // - + si hay DOM y cierres (disc)
    const scoreN = clamp((n / 8) * 40, 0, 40);
    const scoreDisp = isFinite(dispersion) ? clamp((1 - dispersion / 0.18) * 40, 0, 40) : 10;
    const scoreInfo = (domVals.length ? 10 : 0) + (discVals.length ? 10 : 0);
    const score = Math.round(clamp(scoreN + scoreDisp + scoreInfo, 0, 100));

    return { n, eurM2, domDays, discPct, dispersion, score };
  }

  function renderCompTable(comps) {
    const tbody = $("f-compBody");
    if (!tbody) return;

    tbody.innerHTML = comps.map((c, idx) => `
      <tr>
        <td><input class="in-table" data-k="zone" data-i="${idx}" type="text" value="${escapeHtml(c.zone)}" placeholder="Centro / Playa..." /></td>
        <td><input class="in-table" data-k="m2" data-i="${idx}" type="number" value="${Number(c.m2)||0}" min="10" step="1" /></td>
        <td><input class="in-table" data-k="ask" data-i="${idx}" type="number" value="${Number(c.ask)||0}" min="0" step="1000" /></td>
        <td><input class="in-table" data-k="close" data-i="${idx}" type="number" value="${Number(c.close)||0}" min="0" step="1000" /></td>
        <td><input class="in-table" data-k="dom" data-i="${idx}" type="number" value="${Number(c.dom)||0}" min="0" step="1" /></td>
        <td><input class="in-table" data-k="adjPct" data-i="${idx}" type="number" value="${Number(c.adjPct)||0}" step="0.5" /></td>
        <td>
          <select class="in-table" data-k="conf" data-i="${idx}">
            <option value="alta"  ${c.conf==="alta"?"selected":""}>Alta</option>
            <option value="media" ${c.conf==="media"?"selected":""}>Media</option>
            <option value="baja"  ${c.conf==="baja"?"selected":""}>Baja</option>
          </select>
        </td>
        <td><button class="btn" type="button" data-del="${idx}" style="padding:7px 10px">✕</button></td>
      </tr>
    `).join("");

    tbody.querySelectorAll("input.in-table, select.in-table").forEach((el) => {
      el.addEventListener("input", onCompEdit, { passive: true });
      el.addEventListener("change", onCompEdit, { passive: true });
    });

    tbody.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-del"));
        if (!isFinite(i)) return;
        comps.splice(i, 1);
        saveComps(comps);
        renderCompTable(comps);
        recalcSuggestions(false);
        flipCalculate();
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  let COMPS = loadComps();

  function onCompEdit(e) {
    const el = e.target;
    const k = el.getAttribute("data-k");
    const i = Number(el.getAttribute("data-i"));
    if (!k || !isFinite(i) || !COMPS[i]) return;

    let v;
    if (el.tagName === "SELECT") v = el.value;
    else v = el.value;

    if (["m2","ask","close","dom","adjPct"].includes(k)) v = Number(v || 0);
    COMPS[i][k] = v;

    saveComps(COMPS);
    recalcSuggestions(false);
    flipCalculate();
  }

  /* =======================
     Sugerencias (baseline + comps)
     ======================= */
  function recalcSuggestions(forceReplaceConfirmed) {
    // Si forceReplaceConfirmed=true, marcamos dataset.soft=1 en campos sugeribles
    if (forceReplaceConfirmed) clearAllSoftFlags();

    const m2 = Math.max(1, num("f-m2", 80));
    const microAdj = num("f-microAdjPct", 0) / 100;

    const b = baselineEurM2();
    const bAdj = isFinite(b) ? b * (1 + microAdj) : NaN;

    const stats = computeCompStats(COMPS);

    // eur/m2 sugerido de salida:
    // - Si hay comps >=3 y dispersión razonable, usar comps
    // - si no, baseline
    const useComps = stats.n >= 3 && (isFinite(stats.dispersion) ? stats.dispersion <= 0.22 : true);
    const saleEurM2 = useComps ? stats.eurM2 : bAdj;

    applySoft("f-saleEurM2", isFinite(saleEurM2) ? Math.round(saleEurM2) : NaN, "hint-f-saleEurM2",
      useComps ? `Sugerido por comps (${stats.n}).` : `Sugerido por baseline CCAA 2026 (${fmtNum(bAdj,0)} €/m²).`);

    const salePrice = isFinite(saleEurM2) ? saleEurM2 * m2 : NaN;
    applySoft("f-salePrice", isFinite(salePrice) ? Math.round(salePrice/1000)*1000 : NaN, "hint-f-salePrice",
      useComps ? "Derivado de €/m² de comps." : "Derivado de €/m² baseline.");

    const discPct = isFinite(stats.discPct) ? (stats.discPct * 100) : 2.5;
    applySoft("f-saleDiscPct", Number(discPct.toFixed(1)), "hint-f-saleDiscPct",
      isFinite(stats.discPct) ? "Estimado por diferencia anuncio vs cierre." : "Default conservador (sin cierres suficientes).");

    const months = isFinite(stats.domDays) ? Math.max(1, Math.round((stats.domDays / 30.4) + 1)) : 4;
    applySoft("f-saleMonths", months, "hint-f-saleMonths",
      isFinite(stats.domDays) ? "Estimado desde DOM medio + 1 mes de cierre." : "Default (sin DOM suficiente).");

    // Reforma €/m² (plantilla): si hay dispersión alta, subir un poco la sugerencia
    // Si no tienes comps por estado/calidad, ponemos un default neutro.
    const renoDefault = 900; // editable vía input; es solo sugerencia inicial
    const renoEurM2 = renoDefault;
    applySoft("f-renoEurM2", renoEurM2, "hint-f-renoEurM2",
      "Sugerencia inicial; ajusta según calidades y partidas.");

    // Buffer riesgo: inverso del score
    const score = stats.score;
    const buffer = clamp(10 + (100 - score) * 0.15, 10, 25); // 10%..25%
    applySoft("f-bufferPct", Number(buffer.toFixed(1)), "hint-f-bufferPct",
      `Sugerido por score comps ${score}/100.`);

    const hint = $("f-ccaaHint");
    if (hint) {
      if (isFinite(bAdj)) hint.textContent = `Baseline ${fmtNum(bAdj,0)} €/m² (ajustado por microzona).`;
      else hint.textContent = "Selecciona CCAA para ver el baseline.";
    }

    const compStats = $("f-compStats");
    if (compStats) {
      const eurM2Txt = isFinite(stats.eurM2) ? fmtNum(stats.eurM2,0) + " €/m²" : "—";
      const domTxt = isFinite(stats.domDays) ? fmtNum(stats.domDays,0) + " días" : "—";
      const discTxt = isFinite(stats.discPct) ? fmtNum(stats.discPct*100,1) + "%" : "—";
      const dispTxt = isFinite(stats.dispersion) ? fmtNum(stats.dispersion*100,1) + "%" : "—";
      compStats.textContent = `Comps: ${stats.n} · €/m² adj: ${eurM2Txt} · DOM: ${domTxt} · Desc. anuncio→cierre: ${discTxt} · Dispersión: ${dispTxt} · Score: ${stats.score}/100.`;
    }

    const scoreEl = $("f-compScore");
    if (scoreEl) scoreEl.value = String(score);

    setText("f-suggestState", useComps ? "Sugerencias: comps" : "Sugerencias: baseline");
  }

  /* =======================
     Cálculo IRR (mensual) por bisección
     ======================= */
  function irrMensualBiseccion(flows) {
    let lo = -0.99, hi = 2.0;
    const npv = (r) => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);

    let fLo = npv(lo), fHi = npv(hi);
    if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return NaN;

    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      const fMid = npv(mid);
      if (!isFinite(fMid)) return NaN;
      if (Math.abs(fMid) < 1e-8) return mid;
      if (fLo * fMid <= 0) { hi = mid; fHi = fMid; }
      else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  /* =======================
     Modelo base (inputs)
     ======================= */
  function getBase() {
    const m2 = Math.max(1, num("f-m2", 80));

    const saleEurM2 = num("f-saleEurM2", 0);
    const salePrice = num("f-salePrice", 0);
    const saleDiscPct = num("f-saleDiscPct", 0) / 100;
    const saleMonths = Math.max(0, Math.round(num("f-saleMonths", 4)));
    const renoMonths = Math.max(0, Math.round(num("f-renoMonths", 4)));

    const offer = num("f-offerPrice", 0);
    const itpPct = num("f-itpPct", 0) / 100;
    const buyFixed = num("f-buyFixed", 2000);
    const buyAgencyPct = num("f-buyAgencyPct", 0) / 100;

    const renoTotalManual = num("f-renoTotal", 0);
    const renoEurM2 = num("f-renoEurM2", 0);
    const renoContPct = num("f-renoContPct", 10) / 100;

    const holdingMonthly = num("f-holdingMonthly", 250);

    const ltvBuy = clamp(num("f-ltvBuy", 70) / 100, 0, 1);
    const rateBuy = num("f-rateBuy", 9.0) / 100;

    const financeReno = (str("f-financeReno", "no") === "yes");
    const ltvReno = clamp(num("f-ltvReno", 0) / 100, 0, 1);
    const rateReno = num("f-rateReno", 11.0) / 100;

    const sellAgencyPct = num("f-sellAgencyPct", 3.0) / 100;
    const sellFixed = num("f-sellFixed", 1500);

    const plusvalia = num("f-plusvalia", 0);
   
    const taxMode = str("f-taxMode", "manual");          // "manual" | "pct"
    const taxOtherManual = num("f-tax", 0);              // € si manual
    const taxPct = num("f-taxPct", 25) / 100;            // % si pct (ej. 0.25)

    const bufferPct = num("f-bufferPct", 10) / 100;

    const objMode = str("f-objMode", "profit");
    const targetProfit = num("f-targetProfit", 25000);
    const targetMarginPct = num("f-targetMarginPct", 12) / 100;
    const targetIrrPct = num("f-targetIrrPct", 25) / 100;

    const monthsTotal = Math.max(0, renoMonths + saleMonths);

    const renoBase = (renoTotalManual > 0) ? renoTotalManual : (renoEurM2 * m2);
    const renoTotal = renoBase * (1 + renoContPct);

    const salePriceList = salePrice > 0 ? salePrice : (saleEurM2 * m2);
    const salePriceClose = salePriceList * (1 - saleDiscPct);

    return {
      m2,
      saleEurM2,
      salePriceList,
      salePriceClose,
      saleDiscPct,
      saleMonths,
      renoMonths,
      monthsTotal,

      offer,
      itpPct,
      buyFixed,
      buyAgencyPct,

      renoEurM2,
      renoTotalManual,
      renoTotal,

      holdingMonthly,

      ltvBuy,
      rateBuy,

      financeReno,
      ltvReno,
      rateReno,

      sellAgencyPct,
      sellFixed,

      plusvalia,
      taxMode,
      taxOtherManual,
      taxPct,

      bufferPct,

      objMode,
      targetProfit,
      targetMarginPct,
      targetIrrPct
    };
  }

  /* =======================
     Costes y flujos
     ======================= */
  function computeProject(base, purchasePrice) {
    const months = Math.max(0, base.monthsTotal);

    const itp = purchasePrice * base.itpPct;
    const buyAgency = purchasePrice * base.buyAgencyPct;
    const buyCosts = itp + base.buyFixed + buyAgency;

    const holding = base.holdingMonthly * months;

    const sellAgency = base.salePriceClose * base.sellAgencyPct;
    const sellCosts = sellAgency + base.sellFixed;

    const buffer = base.salePriceClose * base.bufferPct;

    // Financiación: compra + (opcional) reforma.
    const loanBuy = purchasePrice * base.ltvBuy;
    const loanReno = (base.financeReno ? base.renoTotal * base.ltvReno : 0);

    // Intereses aproximados:
    // - Compra: durante todo el periodo (meses totales)
    // - Reforma: draw medio durante obra + 100% durante meses de venta
    const intBuy = loanBuy * base.rateBuy * (months / 12);
    const intReno =
      loanReno * base.rateReno *
      ((Math.max(0, base.renoMonths) * 0.5 + Math.max(0, base.saleMonths) * 1.0) / 12);

    const interest = intBuy + intReno;

     // Impuestos: manual (€) o % del beneficio antes de impuestos (no circular)
      let taxOther = 0;
      
      if (base.taxMode === "manual") {
        taxOther = base.taxOtherManual || 0;
      } else {
        // Total sin impuestos (pero incluyendo plusvalía y buffer)
        const totalWithoutTax =
          purchasePrice +
          buyCosts +
          base.renoTotal +
          holding +
          interest +
          sellCosts +
          base.plusvalia +
          buffer;
      
        const preTaxProfit = base.salePriceClose - totalWithoutTax;
        taxOther = (preTaxProfit > 0) ? (preTaxProfit * (base.taxPct || 0)) : 0;
      }

    const totalCosts =
        purchasePrice +
        buyCosts +
        base.renoTotal +
        holding +
        interest +
        sellCosts +
        base.plusvalia +
        taxOther +
        buffer;

    const profit = base.salePriceClose - totalCosts;
    const margin = (base.salePriceClose > 0) ? (profit / base.salePriceClose) : NaN;

    // Equity invertida aprox: total costes - deuda (no incluye deuda como coste, sino como financiación)
      const debt = loanBuy + loanReno;
      const equityNeeded = Math.max(
        0,
        (purchasePrice + buyCosts + base.renoTotal + holding + interest + sellCosts + base.plusvalia + taxOther + buffer) - debt
      );

    // Flujos mensuales para IRR (aprox)
    // t0: equity inicial (compra + costes compra + parte equity reforma si hay) negativo
    // meses 1..N-1: holding + intereses negativos
    // mes N: venta neta positiva
    const flows = [];

    const equityAtT0 = Math.max(0, (purchasePrice + buyCosts + (base.financeReno ? base.renoTotal * (1 - base.ltvReno) : base.renoTotal)) - loanBuy);
    flows.push(-equityAtT0);

    const monthlyCarry = base.holdingMonthly + (interest / Math.max(1, months));
    for (let t = 1; t <= Math.max(0, months - 1); t++) flows.push(-monthlyCarry);

    const netSale = base.salePriceClose - sellCosts - base.plusvalia - taxOther - buffer;
    // Al final también devolvemos principal (deuda) implícitamente porque equityNeeded se calculó neto,
    // pero para IRR usamos netSale - (purchase + reforma + buyCosts + holding + interest) de forma consistente:
    // Simplificación: flujo final como beneficio + retorno de equity:
    const finalCash = netSale - (purchasePrice + buyCosts + base.renoTotal + holding + interest - debt);
    flows.push(finalCash);

    const irrM = irrMensualBiseccion(flows);
    const irrA = isFinite(irrM) ? (Math.pow(1 + irrM, 12) - 1) : NaN;

    return {
      purchasePrice,
      itp, buyAgency, buyCosts,
      holding,
      sellAgency, sellCosts,
      buffer,
      loanBuy, loanReno, debt,
      intBuy, intReno, interest,
      taxOther,
      totalCosts,
      profit,
      margin,
      equityNeeded,
      irrM, irrA
    };
  }

  /* =======================
     Resolver MAO según objetivo
     ======================= */
  function meetsObjective(base, proj) {
    if (base.objMode === "profit") return proj.profit >= base.targetProfit;
    if (base.objMode === "margin") return proj.margin >= base.targetMarginPct;
    if (base.objMode === "irr") return proj.irrA >= base.targetIrrPct;
    return false;
  }

  function solveMAO(base) {
    // Búsqueda por bisección sobre purchasePrice
    // cota alta: salePriceClose (no pagar más que el cierre)
    // cota baja: 0
    const hi0 = Math.max(0, base.salePriceClose);
    let lo = 0;
    let hi = hi0;

    // Si incluso pagando 0 no cumples objetivo, no hay MAO
    const p0 = computeProject(base, 0);
    if (!meetsObjective(base, p0)) return NaN;

    // Si pagando hi ya cumples, MAO es hi (muy raro)
    const pHi = computeProject(base, hi);
    if (meetsObjective(base, pHi)) return hi;

    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      const pMid = computeProject(base, mid);
      if (meetsObjective(base, pMid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /* =======================
     Escenarios (desde tabla)
     ======================= */
  function scenarioParams() {
    return {
      p: { arv: num("f-sc-arv-p", 0.90), reno: num("f-sc-reno-p", 1.15), dMonths: num("f-sc-months-p", 2), dRate: num("f-sc-rate-p", 1.5) },
      b: { arv: num("f-sc-arv-b", 1.00), reno: num("f-sc-reno-b", 1.00), dMonths: num("f-sc-months-b", 0), dRate: num("f-sc-rate-b", 0.0) },
      o: { arv: num("f-sc-arv-o", 1.05), reno: num("f-sc-reno-o", 0.90), dMonths: num("f-sc-months-o", -1), dRate: num("f-sc-rate-o", -0.5) }
    };
  }

  function applyScenario(base, sp) {
    const b = { ...base };
    b.salePriceClose = base.salePriceClose * sp.arv;
    b.salePriceList = base.salePriceList * sp.arv;

    b.renoTotal = base.renoTotal * sp.reno;

    b.renoMonths = Math.max(0, base.renoMonths); // ya incluido en monthsTotal
    b.saleMonths = Math.max(0, base.saleMonths);

    b.monthsTotal = Math.max(0, base.monthsTotal + sp.dMonths);

    b.rateBuy = Math.max(0, base.rateBuy + (sp.dRate / 100));
    b.rateReno = Math.max(0, base.rateReno + (sp.dRate / 100));
    return b;
  }

  /* =======================
     Sensibilidad rápida (MAO vs ARV)
     ======================= */
  function renderSensitivity(base) {
    const tbody = document.querySelector("#f-sens tbody");
    if (!tbody) return;

    const mults = [0.90, 0.95, 1.00, 1.05, 1.10];
    const rows = mults.map((m) => {
      const b = { ...base, salePriceClose: base.salePriceClose * m, salePriceList: base.salePriceList * m };
      const mao = solveMAO(b);
      return { m, arv: b.salePriceClose, mao };
    });

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${fmtNum(r.m, 2)}x</td>
        <td>${fmtEur(r.arv)}</td>
        <td>${isFinite(r.mao) ? fmtEur(Math.floor(r.mao/1000)*1000) : "—"}</td>
      </tr>
    `).join("");
  }

  /* =======================
     KPIs + tabla escenarios
     ======================= */
  function renderOutputs(out) {
    // KPIs: usar Base
    const b = out.baseRes;
    setHTML("f-kpis", `
      <div class="kpi"><div class="k">MAO (base)</div><div class="v">${isFinite(out.maoBase) ? fmtEur(out.maoBase) : "—"}</div></div>
      <div class="kpi"><div class="k">Beneficio (con tu oferta)</div><div class="v">${fmtEur2(b.profit)}</div></div>
      <div class="kpi"><div class="k">Margen neto</div><div class="v">${fmtPct(b.margin)}</div></div>
      <div class="kpi"><div class="k">IRR anual</div><div class="v">${isFinite(b.irrA) ? fmtPct(b.irrA) : "—"}</div></div>
    `);

    const tbody = document.querySelector("#f-table tbody");
    if (tbody) {
      tbody.innerHTML = out.results.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${fmtEur(r.base.salePriceClose)}</td>
          <td>${r.base.monthsTotal}</td>
          <td>${isFinite(r.mao) ? fmtEur(r.mao) : "—"}</td>
          <td>${fmtEur2(r.res.profit)}</td>
          <td>${isFinite(r.res.irrA) ? fmtPct(r.res.irrA) : "—"}</td>
        </tr>
      `).join("");
    }

    const note = $("f-note");
    if (note) {
      note.textContent =
        `Venta cierre: ${fmtEur(out.base.salePriceClose)} · Meses total: ${out.base.monthsTotal} · ` +
        `Reforma: ${fmtEur(out.base.renoTotal)} · Buffer: ${fmtPct(out.base.bufferPct)}.`;
    }
  }

  /* =======================
     Charts (Canvas)
     ======================= */
  function dprScaleCanvas(canvas) {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(220, Math.round(rect.height || 260));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function clearCanvas(ctx, w, h) { ctx.clearRect(0, 0, w, h); }

  function drawAxes(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawSmall(ctx, txt, x, y, align = "left") {
    ctx.fillStyle = "rgba(170,185,220,.92)";
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = align;
    ctx.fillText(txt, x, y);
  }

  function niceMax(v) {
    if (!isFinite(v) || v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const k = (m <= 1) ? 1 : (m <= 2) ? 2 : (m <= 5) ? 5 : 10;
    return k * p;
  }

  function renderBarScenarios(out) {
    const canvas = $("ch-scenarios");
    if (!canvas) return;
    const { ctx, w, h } = dprScaleCanvas(canvas);
    clearCanvas(ctx, w, h);

    const pad = { l: 44, r: 24, t: 18, b: 34 };
    const x0 = pad.l, y0 = pad.t, x1 = w - pad.r, y1 = h - pad.b;

    const rows = out.results.map(r => ({
      name: r.name,
      arv: r.base.salePriceClose,
      mao: r.mao,
      profit: r.res.profit,
      irr: r.res.irrA
    }));

    const moneyMax = niceMax(Math.max(...rows.map(r => Math.max(r.arv || 0, r.mao || 0, Math.max(0, r.profit || 0)))));
    const irrMax = niceMax(Math.max(0.05, ...rows.map(r => (isFinite(r.irr) ? r.irr : 0.0))));

    drawAxes(ctx, x0, y0, x1, y1);

    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const y = y1 - (i / gridN) * (y1 - y0);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.stroke();
      drawSmall(ctx, fmtEur(moneyMax * (i / gridN)), x0 - 6, y + 4, "right");
      drawSmall(ctx, fmtNum(100 * (irrMax * (i / gridN)), 1) + "%", x1 + 6, y + 4, "left");
    }

    const n = rows.length;
    const groupW = (x1 - x0) / n;
    const barW = Math.min(22, groupW / 5);
    const keys = [{ k: "arv" }, { k: "mao" }, { k: "profit" }];

    rows.forEach((r, idx) => {
      const gx = x0 + idx * groupW + groupW / 2;

      keys.forEach((kk, j) => {
        const v = (kk.k === "profit") ? Math.max(0, r[kk.k] || 0) : (r[kk.k] || 0);
        const bh = (v / moneyMax) * (y1 - y0);
        const x = gx + (j - 1) * (barW + 6) - barW / 2;
        const y = y1 - bh;

        ctx.fillStyle = "rgba(255,255,255,.10)";
        ctx.fillRect(x, y, barW, bh);
        ctx.strokeStyle = "rgba(255,255,255,.20)";
        ctx.strokeRect(x, y, barW, bh);
      });

      drawSmall(ctx, r.name, gx, y1 + 22, "center");
    });

    // Línea IRR
    ctx.beginPath();
    rows.forEach((r, idx) => {
      const gx = x0 + idx * groupW + groupW / 2;
      if (!isFinite(r.irr)) return;
      const py = y1 - (r.irr / irrMax) * (y1 - y0);
      if (idx === 0) ctx.moveTo(gx, py); else ctx.lineTo(gx, py);
    });
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    rows.forEach((r, idx) => {
      const gx = x0 + idx * groupW + groupW / 2;
      if (!isFinite(r.irr)) return;
      const py = y1 - (r.irr / irrMax) * (y1 - y0);
      ctx.beginPath();
      ctx.arc(gx, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fill();
    });

    drawSmall(ctx, "Barras: ARV / MAO / Beneficio  |  Línea: IRR anual", x0, y0 - 4, "left");
  }

  function renderLineSensitivity(out) {
    const canvas = $("ch-sensitivity");
    if (!canvas) return;
    const { ctx, w, h } = dprScaleCanvas(canvas);
    clearCanvas(ctx, w, h);

    const pad = { l: 54, r: 16, t: 18, b: 34 };
    const x0 = pad.l, y0 = pad.t, x1 = w - pad.r, y1 = h - pad.b;

    const base = out.base;
    const mults = [0.90, 0.95, 1.00, 1.05, 1.10];
    const pts = mults.map(mult => {
      const sc = { ...base, salePriceClose: base.salePriceClose * mult, salePriceList: base.salePriceList * mult };
      const mao = solveMAO(sc);
      return { mult, arv: sc.salePriceClose, mao };
    }).filter(p => isFinite(p.mao) && isFinite(p.arv));

    const xMin = Math.min(...pts.map(p => p.arv));
    const xMax = Math.max(...pts.map(p => p.arv));
    const yMax = niceMax(Math.max(...pts.map(p => p.mao)));

    drawAxes(ctx, x0, y0, x1, y1);

    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const y = y1 - (i / gridN) * (y1 - y0);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.stroke();
      drawSmall(ctx, fmtEur(yMax * (i / gridN)), x0 - 6, y + 4, "right");
    }

    function xMap(x) {
      if (xMax === xMin) return x0;
      return x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
    }
    function yMap(y) {
      return y1 - (y / yMax) * (y1 - y0);
    }

    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xMap(p.arv), y = yMap(p.mao);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(255,255,255,.60)";
    ctx.lineWidth = 2;
    ctx.stroke();

    pts.forEach((p) => {
      const x = xMap(p.arv), y = yMap(p.mao);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fill();
      drawSmall(ctx, fmtNum(p.mult, 2) + "x", x, y - 8, "center");
    });

    drawSmall(ctx, "Eje X: ARV (cierre)  |  Eje Y: MAO", x0, y0 - 4, "left");
  }

  function waterfallItemsBase(base, mao, resOffer) {
    // Cascada "de venta a beneficio" usando tu oferta (más intuitivo).
    // Incluye buffer y costes principales.
    const offer = base.offer;

    const itp = offer * base.itpPct;
    const buyAgency = offer * base.buyAgencyPct;
    const buyCosts = itp + base.buyFixed + buyAgency;

    const months = base.monthsTotal;
    const holding = base.holdingMonthly * months;

    const sellAgency = base.salePriceClose * base.sellAgencyPct;
    const sellCosts = sellAgency + base.sellFixed;

    const buffer = base.salePriceClose * base.bufferPct;

    // Intereses aproximados de la evaluación con tu oferta:
    const loanBuy = offer * base.ltvBuy;
    const loanReno = (base.financeReno ? base.renoTotal * base.ltvReno : 0);
    const intBuy = loanBuy * base.rateBuy * (months / 12);
    const intReno = loanReno * base.rateReno * ((base.renoMonths * 0.5 + base.saleMonths * 1.0) / 12);
    const interest = intBuy + intReno;

    const items = [
      { label: "Venta (cierre)", v: base.salePriceClose, type: "in" },
      { label: "Agencia venta", v: -sellAgency, type: "out" },
      { label: "Gastos venta", v: -base.sellFixed, type: "out" },
      { label: "Plusvalía", v: -base.plusvalia, type: "out" },
      { label: "Impuestos", v: -base.taxOther, type: "out" },
      { label: "Buffer", v: -buffer, type: "out" },
      { label: "Compra", v: -offer, type: "out" },
      { label: "ITP", v: -itp, type: "out" },
      { label: "Agencia compra", v: -buyAgency, type: "out" },
      { label: "Gastos compra", v: -base.buyFixed, type: "out" },
      { label: "Reforma", v: -base.renoTotal, type: "out" },
      { label: "Holding", v: -holding, type: "out" },
      { label: "Intereses", v: -interest, type: "out" },
    ];

    const total = items.reduce((s, x) => s + x.v, 0);
    items.push({ label: "Beneficio", v: total, type: "total" });

    return items;
  }

   function waterfallItemsAggregated(base){
     const offer = base.offer;
   
     const itp = offer * base.itpPct;
     const buyAgency = offer * base.buyAgencyPct;
     const buyTotal = offer + itp + buyAgency + base.buyFixed;
   
     const months = base.monthsTotal;
     const holding = base.holdingMonthly * months;
   
     const sellAgency = base.salePriceClose * base.sellAgencyPct;
     const sellTotal = sellAgency + base.sellFixed;
   
     const buffer = base.salePriceClose * base.bufferPct;
   
     const loanBuy = offer * base.ltvBuy;
     const loanReno = (base.financeReno ? base.renoTotal * base.ltvReno : 0);
   
     const intBuy = loanBuy * base.rateBuy * (months / 12);
     const intReno = loanReno * base.rateReno * ((base.renoMonths * 0.5 + base.saleMonths * 1.0) / 12);
     const interest = intBuy + intReno;
   
     const items = [
       { label:"Venta", v: base.salePriceClose, type:"in" },
       { label:"Costes venta", v: -sellTotal, type:"out" },
       { label:"Impuestos", v: -(base.plusvalia + base.taxOther), type:"out" },
       { label:"Buffer", v: -buffer, type:"out" },
       { label:"Compra total", v: -buyTotal, type:"out" },
       { label:"Reforma", v: -base.renoTotal, type:"out" },
       { label:"Holding + int.", v: -(holding + interest), type:"out" },
     ];
   
     const total = items.reduce((s,x)=>s+x.v,0);
     items.push({ label:"Beneficio", v: total, type:"total" });
     return items;
   }

  function renderWaterfallBase(out) {
    const canvas = $("ch-waterfall");
    if (!canvas) return;
    const { ctx, w, h } = dprScaleCanvas(canvas);
    clearCanvas(ctx, w, h);

    const pad = { l: 54, r: 16, t: 20, b: 34 };
    const x0 = pad.l, y0 = pad.t, x1 = w - pad.r, y1 = h - pad.b;

    const isSmall = window.innerWidth < 1200;
      const items = isSmall
        ? waterfallItemsAggregated(out.base)
        : waterfallItemsBase(out.base, out.maoBase, out.baseRes);

    let acc = 0;
    let minAcc = 0;
    let maxAcc = 0;
    for (const it of items) {
      if (it.type === "total") continue;
      acc += it.v;
      minAcc = Math.min(minAcc, acc);
      maxAcc = Math.max(maxAcc, acc);
    }
    const total = items[items.length - 1].v;
    minAcc = Math.min(minAcc, 0, total);
    maxAcc = Math.max(maxAcc, 0, total);
    const span = (maxAcc - minAcc) || 1;

    function yMap(v) {
      return y1 - ((v - minAcc) / span) * (y1 - y0);
    }
 

    drawAxes(ctx, x0, y0, x1, y1);

    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const v = minAcc + (i / gridN) * span;
      const y = yMap(v);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.stroke();
      drawSmall(ctx, fmtEur(v), x0 - 6, y + 4, "right");
    }

    const n = items.length;
    const gap = 8;
    const barW = Math.max(10, Math.min(58, ((x1 - x0) - gap * (n - 1)) / n));

    let cum = 0;
    items.forEach((it, i) => {
      const x = x0 + i * (barW + gap);

      let yTop, yBot;
      if (it.type === "total") {
        yTop = yMap(Math.max(0, it.v));
        yBot = yMap(Math.min(0, it.v));
      } else {
        const start = cum;
        const end = cum + it.v;
        yTop = yMap(Math.max(start, end));
        yBot = yMap(Math.min(start, end));
        cum = end;
      }

      const bh = Math.max(1, yBot - yTop);

      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(x, yTop, barW, bh);
      ctx.strokeStyle = "rgba(255,255,255,.20)";
      ctx.strokeRect(x, yTop, barW, bh);

      const label = it.label.length > 14 ? it.label.slice(0, 14) + "…" : it.label;
      
      if (isSmall) {
        // Etiqueta vertical (móvil)
        ctx.save();
        ctx.translate(x + barW/2, y1 + 30);
        ctx.rotate(-Math.PI/2);
        drawSmall(ctx, label, 0, 0, "left");
        ctx.restore();
      } else {
        // Etiqueta horizontal (desktop)
        drawSmall(ctx, label, x + barW/2, y1 + 22, "center");
      }
                
    });

    drawSmall(ctx, "Cascada basada en tu oferta (incluye buffer).", x0, y0 - 4, "left");
  }

  function renderCharts(out) {
    renderBarScenarios(out);
    renderLineSensitivity(out);
    renderWaterfallBase(out);

    const baseRow = out.results.find(r => r.name === "Base") || out.results[0];
    setText("ch-note",
      `Base: ARV ${fmtEur(baseRow.base.salePriceClose)} · MAO ${isFinite(baseRow.mao) ? fmtEur(baseRow.mao) : "—"} · ` +
      `Beneficio (tu oferta) ${fmtEur2(baseRow.res.profit)} · IRR anual ${isFinite(baseRow.res.irrA) ? fmtPct(baseRow.res.irrA) : "—"}.`
    );
  }

  /* =======================
     Cálculo principal
     ======================= */
  function flipCalculate() {
    const base0 = getBase();

    // Resolver MAO en base (sin escenarios) y redondear a 1.000 €
    const maoRaw = solveMAO(base0);
    const maoBase = isFinite(maoRaw) ? Math.floor(maoRaw / 1000) * 1000 : NaN;

    // Evaluación con tu oferta (base)
    const baseRes = computeProject(base0, base0.offer);

    // Escenarios
    const sp = scenarioParams();
    const sP = applyScenario(base0, sp.p);
    const sB = applyScenario(base0, sp.b);
    const sO = applyScenario(base0, sp.o);

    const results = [
      { name: "Pesimista", base: sP, mao: (isFinite(solveMAO(sP)) ? Math.floor(solveMAO(sP) / 1000) * 1000 : NaN), res: computeProject(sP, base0.offer) },
      { name: "Base",      base: sB, mao: (isFinite(solveMAO(sB)) ? Math.floor(solveMAO(sB) / 1000) * 1000 : NaN), res: computeProject(sB, base0.offer) },
      { name: "Optimista", base: sO, mao: (isFinite(solveMAO(sO)) ? Math.floor(solveMAO(sO) / 1000) * 1000 : NaN), res: computeProject(sO, base0.offer) },
    ];

    const out = { base: base0, maoBase, baseRes, results };

    renderOutputs(out);
    renderSensitivity(base0);
    renderCharts(out);

    return out;
  }

  /* =======================
     Copiar / CSV
     ======================= */
  function copySummary() {
    const out = flipCalculate();
    const base = out.base;
    const row = out.results.find(r => r.name === "Base") || out.results[0];

    const text =
`Flip inmobiliario (Base)
CCAA: ${str("f-ccaa")}
m²: ${base.m2}
Venta cierre: ${fmtEur(base.salePriceClose)}
Meses total: ${base.monthsTotal}
Reforma total: ${fmtEur(base.renoTotal)}
Buffer: ${(base.bufferPct*100).toFixed(1)}%

MAO (Base): ${isFinite(out.maoBase) ? fmtEur(out.maoBase) : "—"}
Tu oferta: ${fmtEur(base.offer)}
Beneficio (tu oferta): ${fmtEur2(row.res.profit)}
Margen neto: ${isFinite(row.res.margin) ? (row.res.margin*100).toFixed(2)+"%" : "—"}
IRR anual: ${isFinite(row.res.irrA) ? (row.res.irrA*100).toFixed(2)+"%" : "—"}`;

    navigator.clipboard?.writeText(text);
  }

  function exportCsv() {
    const out = flipCalculate();
    const rows = [
      ["Escenario","ARV_cierre","Meses","MAO","Beneficio_oferta","IRR_anual_oferta"],
      ...out.results.map(r => [
        r.name,
        Math.round(r.base.salePriceClose),
        r.base.monthsTotal,
        isFinite(r.mao) ? Math.round(r.mao) : "",
        isFinite(r.res.profit) ? r.res.profit.toFixed(2) : "",
        isFinite(r.res.irrA) ? r.res.irrA.toFixed(6) : ""
      ])
    ];
    const csv = rows.map(x => x.join(";")).join("\n");
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
    // Comparables: render inicial
    renderCompTable(COMPS);

    $("f-addComp")?.addEventListener("click", () => {
      COMPS.push(newComp());
      saveComps(COMPS);
      renderCompTable(COMPS);
      recalcSuggestions(false);
      flipCalculate();
    });

    $("f-clearComps")?.addEventListener("click", () => {
      COMPS = [];
      saveComps(COMPS);
      renderCompTable(COMPS);
      recalcSuggestions(true);
      flipCalculate();
    });

    $("f-recalcSuggestions")?.addEventListener("click", () => {
      recalcSuggestions(true); // fuerza reemplazo (soft)
      flipCalculate();
    });

    // Recalcular al cambiar inputs (pero sin reventar rendimiento)
    const idsRecalc = [
      "f-ccaa","f-source","f-m2","f-microAdjPct",
      "f-saleEurM2","f-salePrice","f-saleDiscPct","f-saleMonths",
      "f-offerPrice","f-itpPct","f-buyFixed","f-buyAgencyPct",
      "f-renoEurM2","f-renoTotal","f-renoContPct","f-renoMonths",
      "f-holdingMonthly",
      "f-ltvBuy","f-rateBuy","f-financeReno","f-ltvReno","f-rateReno",
      "f-sellAgencyPct","f-sellFixed","f-plusvalia","f-tax","f-taxPct","f-taxMode",
      "f-objMode","f-targetProfit","f-targetMarginPct","f-targetIrrPct",
      "f-bufferPct",
      "f-sc-arv-p","f-sc-reno-p","f-sc-months-p","f-sc-rate-p",
      "f-sc-arv-b","f-sc-reno-b","f-sc-months-b","f-sc-rate-b",
      "f-sc-arv-o","f-sc-reno-o","f-sc-months-o","f-sc-rate-o"
    ];

    idsRecalc.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => flipCalculate(), { passive: true });
      el.addEventListener("change", () => flipCalculate(), { passive: true });
    });

    // Botones
    $("f-calc")?.addEventListener("click", () => flipCalculate());
    $("f-copy")?.addEventListener("click", () => copySummary());
    $("f-exportCsv")?.addEventListener("click", () => exportCsv());

    // Confirmado vs sugerido
    markConfirmed([
      "f-saleEurM2","f-salePrice","f-saleDiscPct","f-saleMonths",
      "f-renoEurM2","f-bufferPct"
    ]);

    // Resize → recalcula para reescalar canvas
    window.addEventListener("resize", () => flipCalculate());
  }

  /* =======================
     Inicio
     ======================= */
  bind();
  recalcSuggestions(false);
  flipCalculate();

   bind();
recalcSuggestions(false);
flipCalculate();


      // ====== MODO IMPUESTOS (manual / % beneficio) ======
      
      function taxModeRenderUI() {
        const mode = str("f-taxMode", "manual");
      
        const manual = document.getElementById("f-taxManualWrap");
        const pct = document.getElementById("f-taxPctWrap");
      
        if (manual) manual.style.display = (mode === "manual") ? "" : "none";
        if (pct) pct.style.display = (mode === "pct") ? "" : "none";
      }
      
      // Cambiar modo
      document.getElementById("f-taxMode")?.addEventListener("change", () => {
        taxModeRenderUI();
        flipCalculate();
      });
      
      // Cambiar porcentaje
      document.getElementById("f-taxPct")?.addEventListener("input", () => {
        flipCalculate();
      });
      
      // Estado inicial
      taxModeRenderUI();

})();
