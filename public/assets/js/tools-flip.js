/* ============================================================
   UnaHojaTools — Flip
   - Cálculo local (sin backend)
   - Sugerido vs Confirmado
   - Comparables -> defaults a campos posteriores
   - MAO por bisección (objetivo: profit/margin/IRR)
   ============================================================ */

function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n);
}
function fmtEur2(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
function fmtPct(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"percent", maximumFractionDigits:2 }).format(n);
}
function fmtNum(n, d=0){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits:d }).format(n);
}
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function $(id){ return document.getElementById(id); }
function num(id){
  const v = Number($(id)?.value ?? 0);
  return isFinite(v) ? v : 0;
}
function str(id){ return String($(id)?.value ?? ""); }

function setSuggested(id, value, sourceLabel){
  const el = $(id);
  if (!el) return;
  if (el.dataset.state === "confirmed") return;
  el.value = (value ?? "");
  el.dataset.state = "suggested";
  if (sourceLabel) el.dataset.source = sourceLabel;
  const hint = $("hint-" + id);
  if (hint) hint.textContent = sourceLabel ? ("Sugerido: " + sourceLabel) : "Sugerido";
}
function setConfirmed(el){
  if (!el) return;
  el.dataset.state = "confirmed";
  delete el.dataset.source;
  const hint = $("hint-" + el.id);
  if (hint) hint.textContent = "Confirmado";
}
function clearStateHint(id){
  const hint = $("hint-" + id);
  if (hint) hint.textContent = "";
}

/* ============================================================
   Baselines mercado (€/m²) — 2026
   ============================================================ */

const MARKET = {
  idealista_jan2026: {
    label: "Baseline idealista (ene 2026) por CCAA",
    ccaa: {
      "Andalucía": 2784,
      "Aragón": 1617,
      "Asturias": 1714,
      "Baleares": 5194,
      "Canarias": 3200,
      "Cantabria": 2047,
      "Castilla y León": 1287,
      "Castilla-La Mancha": 1048,
      "Cataluña": 2776,
      "Ceuta": 2447,
      "Comunitat Valenciana": 2422,
      "Euskadi": 3460,
      "Extremadura": 1040,
      "Galicia": 1505,
      "La Rioja": 1451,
      "Madrid": 4585,
      "Melilla": 2048,
      "Murcia": 1696,
      "Navarra": 1867,
      "España": 2650
    }
  },
  fotocasa_feb2026: {
    label: "Baseline Fotocasa (feb 2026) por CCAA",
    ccaa: {
      "Andalucía": 2797,
      "Aragón": 1876,
      "Asturias": 2274,
      "Baleares": 5317,
      "Canarias": 3356,
      "Cantabria": 2543,
      "Castilla y León": 1713,
      "Castilla-La Mancha": 1357,
      "Cataluña": 3313,
      "Comunitat Valenciana": 2649,  // “Valencia” en tabla
      "Euskadi": 3709,               // “País Vasco” en tabla
      "Extremadura": 1312,
      "Galicia": 2178,
      "La Rioja": 1815,
      "Madrid": 5297,
      "Murcia": 1945,
      "Navarra": 2309,
      "España": 2950
      // Ceuta/Melilla no vienen en esa tabla; se gestiona como fallback
    }
  }
};

/* ============================================================
   Comparables — render y lectura
   ============================================================ */

let compAutoId = 0;

function compRowHtml(id){
  return `
    <tr data-comp="${id}">
      <td><input class="in-table" type="text" data-k="zone" placeholder="Barrio/zona"></td>
      <td><input class="in-table" type="number" data-k="m2" min="1" step="1" value=""></td>
      <td><input class="in-table" type="number" data-k="ask" min="0" step="1000" value=""></td>
      <td><input class="in-table" type="number" data-k="close" min="0" step="1000" value=""></td>
      <td><input class="in-table" type="number" data-k="dom" min="0" step="1" value=""></td>
      <td><input class="in-table" type="number" data-k="adj" step="0.1" value="0"></td>
      <td>
        <select class="in-table" data-k="conf">
          <option value="high">Alta</option>
          <option value="mid" selected>Media</option>
          <option value="low">Baja</option>
        </select>
      </td>
      <td style="text-align:right">
        <button class="btn btn-del" type="button" data-del="${id}">✕</button>
      </td>
    </tr>
  `;
}

function addCompRow(){
  const id = (++compAutoId);
  $("f-compBody").insertAdjacentHTML("beforeend", compRowHtml(id));
}

function clearComps(){
  $("f-compBody").innerHTML = "";
  compAutoId = 0;
}

function readComps(){
  const rows = Array.from(document.querySelectorAll("#f-compBody tr"));
  const comps = [];
  for (const tr of rows){
    const get = (k) => tr.querySelector(`[data-k="${k}"]`)?.value ?? "";
    const zone = String(get("zone")).trim();
    const m2 = Number(get("m2")||0);
    const ask = Number(get("ask")||0);
    const close = Number(get("close")||0);
    const dom = Number(get("dom")||0);
    const adj = Number(get("adj")||0);
    const conf = String(get("conf")||"mid");

    const priceEff = (close>0 ? close : ask);
    if (!(m2>0 && priceEff>0)) continue;

    const eurM2 = (priceEff / m2) * (1 + (adj/100));
    const disc = (ask>0 && close>0 && close<=ask) ? (ask-close)/ask : NaN;

    const w =
      conf==="high" ? 1.0 :
      conf==="low"  ? 0.4 : 0.7;

    comps.push({ zone, m2, ask, close, dom:(dom>0?dom:NaN), adj, conf, eurM2, disc, w });
  }
  return comps;
}

function percentile(arr, p){
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x,y)=>x-y);
  const idx = (a.length-1)*p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo===hi) return a[lo];
  const t = idx-lo;
  return a[lo]*(1-t)+a[hi]*t;
}

function std(arr){
  if (arr.length<2) return 0;
  const m = arr.reduce((s,x)=>s+x,0)/arr.length;
  const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/(arr.length-1);
  return Math.sqrt(v);
}

function computeCompsStats(){
  const comps = readComps();
  const eur = comps.map(c=>c.eurM2);
  const dom = comps.map(c=>c.dom).filter(x=>isFinite(x) && x>0);
  const disc = comps.map(c=>c.disc).filter(x=>isFinite(x) && x>=0 && x<1);

  const wSum = comps.reduce((s,c)=>s+c.w,0);
  const wMean = wSum>0 ? comps.reduce((s,c)=>s+c.w*c.eurM2,0)/wSum : NaN;

  const mean = eur.length ? eur.reduce((s,x)=>s+x,0)/eur.length : NaN;
  const cv = (isFinite(mean) && mean>0) ? std(eur)/mean : NaN;

  // Score simple: cantidad + dispersión
  const nScore = clamp(comps.length/8, 0, 1);
  const dScore = isFinite(cv) ? clamp(1 - (cv/0.15), 0, 1) : 0; // 0.15 ~ dispersión “alta”
  const score = Math.round(100*(0.55*nScore + 0.45*dScore));

  const buffer =
    score>=80 ? 3 :
    score>=60 ? 6 :
    score>=40 ? 9 : 12;

  return {
    n: comps.length,
    wMeanEurM2: wMean,
    p25: percentile(eur, 0.25),
    p50: percentile(eur, 0.50),
    p75: percentile(eur, 0.75),
    domP50: percentile(dom, 0.50),
    discP50: percentile(disc, 0.50),
    cv,
    score,
    buffer
  };
}

/* ============================================================
   IRR y MAO
   ============================================================ */

function irrMensualBiseccion(flows){
  let lo = -0.99, hi = 1.5;
  const npv = (r) => flows.reduce((s, cf, t)=> s + cf / Math.pow(1+r, t), 0);

  let fLo = npv(lo), fHi = npv(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || (fLo*fHi > 0)) return NaN;

  for (let i=0; i<90; i++){
    const mid = (lo+hi)/2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-8) return mid;
    if (fLo*fMid <= 0){ hi = mid; fHi=fMid; }
    else { lo = mid; fLo=fMid; }
  }
  return (lo+hi)/2;
}

function buildEquityFlows(params){
  const {
    purchasePrice,
    itpPct,
    buyFixed,
    buyAgencyPct,
    renoTotal,
    renoMonths,
    holdingMonthly,
    saleMonths,
    salePriceClose,
    sellAgencyPct,
    sellFixed,
    plusvalia,
    taxOther,
    ltvBuy,
    rateBuy,
    financeReno,
    ltvReno,
    rateReno,
    bufferPct
  } = params;

  const monthsReform = Math.max(0, Math.round(renoMonths));
  const monthsSale = Math.max(0, Math.round(saleMonths));
  const totalMonths = monthsReform + monthsSale;

  // Compra
  const buyTaxes = purchasePrice * (itpPct/100);
  const buyAgency = purchasePrice * (buyAgencyPct/100);
  const acquisitionCosts = buyTaxes + buyFixed + buyAgency;

  // Reforma + contingencia ya aplicada fuera
  const renoPerMonth = monthsReform>0 ? (renoTotal / monthsReform) : 0;

  // Financiación
  const loanBuy = purchasePrice * (ltvBuy/100);
  const equityBuy = purchasePrice - loanBuy;

  const loanReno = financeReno ? (renoTotal * (ltvReno/100)) : 0;
  const equityRenoTotal = renoTotal - loanReno;

  const rBuyM = (rateBuy/100)/12;
  const rRenoM = (rateReno/100)/12;

  // Venta
  const sellAgency = salePriceClose * (sellAgencyPct/100);
  const buffer = salePriceClose * (bufferPct/100); // buffer aplicado como “colchón” contra el resultado

  const netSaleCashBeforeDebt =
    salePriceClose
    - sellAgency
    - sellFixed
    - plusvalia
    - taxOther
    - buffer;

  // Flujos de equity
  const flows = [];

  // Mes 0: equity downpayment + gastos compra (no financiados)
  flows.push(-(equityBuy + acquisitionCosts));

  // Meses 1..monthsReform: aportación de equity a reforma + holding + intereses
  for (let m=1; m<=monthsReform; m++){
    const equityRenoM = monthsReform>0 ? (equityRenoTotal / monthsReform) : 0;

    // Draw de préstamo reforma: lineal durante meses obra
    const renoOutstanding = (monthsReform>0) ? (loanReno * (m/monthsReform)) : 0;

    const interest = (loanBuy*rBuyM) + (renoOutstanding*rRenoM);
    const out = equityRenoM + holdingMonthly + interest;
    flows.push(-out);
  }

  // Meses de venta: holding + intereses (préstamo reforma ya 100% dispuesto si existe)
  for (let m=1; m<=monthsSale; m++){
    const interest = (loanBuy*rBuyM) + (loanReno*rRenoM);
    const out = holdingMonthly + interest;
    flows.push(-out);
  }

  // Mes final: cobro neto y repago principal de deuda
  const debtRepay = loanBuy + loanReno;
  const equityIn = netSaleCashBeforeDebt - debtRepay;
  flows.push(equityIn);

  return { flows, totalMonths, acquisitionCosts, buyTaxes, buyAgency, sellAgency, buffer, loanBuy, loanReno };
}

function evaluateAtPurchase(purchasePrice, base){
  const p = { ...base, purchasePrice };
  const { flows, totalMonths, acquisitionCosts, buyTaxes, buyAgency, sellAgency, buffer, loanBuy, loanReno } = buildEquityFlows(p);
  const irrM = irrMensualBiseccion(flows);
  const irrA = isFinite(irrM) ? (Math.pow(1+irrM, 12) - 1) : NaN;

  const equityOut = -flows.filter(x=>x<0).reduce((s,x)=>s+x,0);
  const equityProfit = flows.reduce((s,x)=>s+x,0);

  // Unlevered profit aproximado (sin financiación): venta - (compra + gastos compra + reforma + holding + gastos venta + impuestos + buffer)
  const unleveredCost =
    purchasePrice
    + (purchasePrice*(p.itpPct/100) + p.buyFixed + purchasePrice*(p.buyAgencyPct/100))
    + p.renoTotal
    + (p.holdingMonthly * (p.renoMonths + p.saleMonths))
    + (p.salePriceClose*(p.sellAgencyPct/100) + p.sellFixed)
    + p.plusvalia + p.taxOther
    + buffer;

  const unleveredProfit = p.salePriceClose - unleveredCost;

  return {
    irrA,
    irrM,
    equityOut,
    equityProfit,
    totalMonths,
    acquisitionCosts,
    buyTaxes,
    buyAgency,
    sellAgency,
    buffer,
    loanBuy,
    loanReno,
    unleveredProfit
  };
}

function solveMAO(base){
  const mode = str("f-objMode");
  const targetProfit = num("f-targetProfit");
  const targetMarginPct = num("f-targetMarginPct");
  const targetIrrPct = num("f-targetIrrPct")/100;

  const sale = base.salePriceClose;
  const profitGoal = (mode==="margin") ? sale*(targetMarginPct/100) : targetProfit;

  // f(price) = metric - target
  function f(price){
    const r = evaluateAtPurchase(price, base);
    if (mode==="irr") return (r.irrA - targetIrrPct);
    return (r.equityProfit - profitGoal);
  }

  // Intervalo razonable
  let lo = 0;
  let hi = Math.max(1, sale*0.98);

  let fLo = f(lo);
  let fHi = f(hi);

  // Si incluso a 0 no llegas al objetivo, no hay MAO (NaN)
  if (!isFinite(fLo) || fLo < 0) return NaN;

  // Si a hi aún cumples, sube hi un poco (pero acotado)
  for (let k=0; k<10 && isFinite(fHi) && fHi > 0; k++){
    hi *= 1.10;
    if (hi > sale*1.20) break;
    fHi = f(hi);
  }

  // Si no hay cambio de signo, bisección no es aplicable
  if (!isFinite(fHi) || fLo*fHi > 0) return NaN;

  for (let i=0; i<80; i++){
    const mid = (lo+hi)/2;
    const fMid = f(mid);
    if (!isFinite(fMid)) break;
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo*fMid <= 0){ hi = mid; fHi=fMid; }
    else { lo = mid; fLo=fMid; }
  }
  return (lo+hi)/2;
}

/* ============================================================
   Sugerencias: baseline + comps -> campos
   ============================================================ */

function getBaselineEurM2(sourceKey, ccaa){
  const src = MARKET[sourceKey];
  if (!src) return NaN;
  const v = src.ccaa[ccaa];
  if (isFinite(v)) return v;
  // fallback: si Fotocasa no trae Ceuta/Melilla, usa idealista
  if (sourceKey==="fotocasa_feb2026"){
    const v2 = MARKET.idealista_jan2026.ccaa[ccaa];
    if (isFinite(v2)) return v2;
  }
  return NaN;
}

function applySuggestions(){
  const ccaa = str("f-ccaa");
  const sourceKey = str("f-source");
  const m2 = Math.max(1, num("f-m2"));
  const microAdj = num("f-microAdjPct")/100;

  const baseline = getBaselineEurM2(sourceKey, ccaa);
  const stats = computeCompsStats();

  // Reforma €/m² (plantilla) sugerida (editable)
  // Midpoints orientativos (no “dato real”, solo plantilla)
  // - integral media-baja: 500
  // - integral media: 850
  // - alta/premium: 1100
  // Se deja en 850 por defecto para no sesgar a extremos.
  setSuggested("f-renoEurM2", 850, "Plantilla €/m² (editable)");

  // Sale discount default si no hay cierres suficientes
  const disc = isFinite(stats.discP50) ? (stats.discP50*100) : 3.0;

  // Meses venta: si hay DOM mediano, usa DOM/30 + 1 mes escrituras; si no, 3
  const saleMonths =
    isFinite(stats.domP50) ? Math.max(1, Math.ceil(stats.domP50/30) + 1) : 3;

  // €/m² sugerido: comps (si n>=3) else baseline
  const eurM2FromComps = (stats.n >= 3 && isFinite(stats.wMeanEurM2)) ? stats.wMeanEurM2 : NaN;
  const eurM2 = isFinite(eurM2FromComps) ? eurM2FromComps : baseline;

  // Ajuste microzona
  const eurM2Adj = isFinite(eurM2) ? eurM2*(1+microAdj) : NaN;

  // Precio cierre sugerido:
  // - Si comps: wMean * m² (y luego aplicamos descuento “informativo” para listing)
  // - Si baseline: baseline * m²
  const saleClose = isFinite(eurM2Adj) ? (eurM2Adj*m2) : NaN;

  // Buffer sugerido por score
  const bufferPct = isFinite(stats.buffer) ? stats.buffer : 8;

  // Hints de CCAA y baseline
  const srcLabel = MARKET[sourceKey]?.label ?? "Baseline";
  if ($("f-ccaaHint")){
    const v = isFinite(baseline) ? fmtNum(baseline,0)+" €/m²" : "—";
    $("f-ccaaHint").textContent = `${srcLabel}: ${v} (${ccaa})`;
  }

  // Aplica sugeridos (si no confirmados)
  setSuggested("f-saleEurM2", isFinite(eurM2Adj) ? Math.round(eurM2Adj) : "", stats.n>=3 ? "Comparables (media ponderada)" : "Baseline CCAA 2026");
  setSuggested("f-salePrice", isFinite(saleClose) ? Math.round(saleClose) : "", stats.n>=3 ? "€/m² comps × m²" : "€/m² CCAA × m²");
  setSuggested("f-saleDiscPct", disc.toFixed(1), isFinite(stats.discP50) ? "Mediana (cierre vs anuncio)" : "Default");
  setSuggested("f-saleMonths", saleMonths, isFinite(stats.domP50) ? "DOM mediano + 1 mes" : "Default");

  setSuggested("f-bufferPct", bufferPct, stats.n>=3 ? ("Por score comps ("+stats.score+")") : "Default por falta de comps");

  // Score comps (solo visual)
  if ($("f-compScore")) $("f-compScore").value = isFinite(stats.score) ? stats.score : 0;

  // Stats comps
  if ($("f-compStats")){
    if (stats.n===0){
      $("f-compStats").textContent = "Añade comparables para precargar métricas (mínimo recomendado: 3).";
    } else {
      const txt =
        `Comps válidos: ${stats.n}. ` +
        `€/m² P50: ${fmtNum(stats.p50,0)} (P25: ${fmtNum(stats.p25,0)}, P75: ${fmtNum(stats.p75,0)}). ` +
        `Dispersión (CV): ${isFinite(stats.cv)?fmtNum(stats.cv,2):"—"}. ` +
        `Score: ${stats.score}/100 → buffer sugerido: ${stats.buffer}%.`;
      $("f-compStats").textContent = txt;
    }
  }
}

/* ============================================================
   Cálculo principal
   ============================================================ */

function getScenarioParams(tag){
  return {
    arvMult: num(`f-sc-arv-${tag}`),
    renoMult: num(`f-sc-reno-${tag}`),
    monthsDelta: Math.round(num(`f-sc-months-${tag}`)),
    rateDelta: num(`f-sc-rate-${tag}`)
  };
}

function flipCalculate(){
  // recalcula sugerencias antes de calcular (pero respeta confirmados)
  applySuggestions();

  const m2 = Math.max(1, num("f-m2"));
  const saleEurM2 = num("f-saleEurM2");
  const salePrice = num("f-salePrice");
  const saleDiscPct = num("f-saleDiscPct"); // informativo para listing si se usa después
  const saleMonths = Math.max(0, Math.round(num("f-saleMonths")));

  const offerPrice = num("f-offerPrice");
  const itpPct = num("f-itpPct");
  const buyFixed = num("f-buyFixed");
  const buyAgencyPct = num("f-buyAgencyPct");

  const renoEurM2 = num("f-renoEurM2");
  const renoTotalManual = num("f-renoTotal");
  const renoContPct = num("f-renoContPct")/100;
  const renoMonths = Math.max(0, Math.round(num("f-renoMonths")));
  const holdingMonthly = num("f-holdingMonthly");

  const ltvBuy = clamp(num("f-ltvBuy"), 0, 100);
  const rateBuy = num("f-rateBuy");
  const financeReno = (str("f-financeReno")==="yes");
  const ltvReno = clamp(num("f-ltvReno"), 0, 100);
  const rateReno = num("f-rateReno");

  const sellAgencyPct = num("f-sellAgencyPct");
  const sellFixed = num("f-sellFixed");
  const plusvalia = num("f-plusvalia");
  const taxOther = num("f-tax");

  const bufferPct = num("f-bufferPct");

  const renoBase = (renoTotalManual>0) ? renoTotalManual : (renoEurM2*m2);
  const renoTotal = renoBase * (1 + renoContPct);

  const base = {
    purchasePrice: offerPrice,
    itpPct, buyFixed, buyAgencyPct,
    renoTotal, renoMonths,
    holdingMonthly,
    saleMonths,
    salePriceClose: salePrice,
    sellAgencyPct, sellFixed,
    plusvalia, taxOther,
    ltvBuy, rateBuy,
    financeReno, ltvReno, rateReno,
    bufferPct
  };

  const scenarios = [
    { name:"Pesimista", tag:"p", p:getScenarioParams("p") },
    { name:"Base", tag:"b", p:getScenarioParams("b") },
    { name:"Optimista", tag:"o", p:getScenarioParams("o") }
  ];

  const results = [];

  for (const s of scenarios){
    const saleAdj = base.salePriceClose * (s.p.arvMult || 1);
    const renoAdj = base.renoTotal * (s.p.renoMult || 1);

    const monthsTotalBase = base.renoMonths + base.saleMonths;
    const monthsTotalAdj = Math.max(0, monthsTotalBase + (s.p.monthsDelta || 0));

    // Reparto simple: ajusta meses de venta, manteniendo meses de obra si no quieres tocar obra.
    const renoMonthsAdj = base.renoMonths;
    const saleMonthsAdj = Math.max(0, monthsTotalAdj - renoMonthsAdj);

    const rateBuyAdj = Math.max(0, base.rateBuy + (s.p.rateDelta || 0));
    const rateRenoAdj = Math.max(0, base.rateReno + (s.p.rateDelta || 0));

    const scBase = {
      ...base,
      salePriceClose: saleAdj,
      renoTotal: renoAdj,
      renoMonths: renoMonthsAdj,
      saleMonths: saleMonthsAdj,
      rateBuy: rateBuyAdj,
      rateReno: rateRenoAdj
    };

    const rOffer = evaluateAtPurchase(scBase.purchasePrice, scBase);
    const mao = solveMAO(scBase);

    results.push({
      name: s.name,
      arv: scBase.salePriceClose,
      months: rOffer.totalMonths,
      mao,
      profit: rOffer.equityProfit,
      irrA: rOffer.irrA
    });
  }

  // KPIs (base)
  const baseRes = results.find(x=>x.name==="Base") || results[0];
  const diff = (isFinite(baseRes.mao) ? (offerPrice - baseRes.mao) : NaN);
  const ok = isFinite(diff) ? (diff <= 0) : false;

  $("f-kpis").innerHTML = `
    <div class="kpi">
      <div class="k">MAO (Base)</div>
      <div class="v">${isFinite(baseRes.mao)?fmtEur(baseRes.mao):"—"}</div>
      <div class="small">${isFinite(diff)?(ok?'<span class="ok">Tu oferta está dentro</span>':'<span class="bad">Tu oferta supera el MAO</span>'):""}</div>
    </div>
    <div class="kpi">
      <div class="k">Beneficio neto (Base, con tu oferta)</div>
      <div class="v">${fmtEur(baseRes.profit)}</div>
      <div class="small">Equity-only (incluye intereses/holding).</div>
    </div>
    <div class="kpi">
      <div class="k">IRR anual (Base, con tu oferta)</div>
      <div class="v">${isFinite(baseRes.irrA)?fmtPct(baseRes.irrA):"—"}</div>
      <div class="small">IRR sobre flujos mensuales.</div>
    </div>
    <div class="kpi">
      <div class="k">€/m² salida y descuento</div>
      <div class="v">${isFinite(saleEurM2)?fmtNum(saleEurM2,0):"—"}</div>
      <div class="small">Desc. negociación: ${isFinite(saleDiscPct)?fmtNum(saleDiscPct,1)+"%":"—"}</div>
    </div>
  `;

  // Tabla escenarios
  document.querySelector("#f-table tbody").innerHTML = results.map(r=>`
    <tr>
      <td>${r.name}</td>
      <td>${fmtEur(r.arv)}</td>
      <td>${fmtNum(r.months,0)}</td>
      <td>${isFinite(r.mao)?fmtEur(r.mao):"—"}</td>
      <td>${fmtEur(r.profit)}</td>
      <td>${isFinite(r.irrA)?fmtPct(r.irrA):"—"}</td>
    </tr>
  `).join("");

  // Nota resumen
  const listPrice = (saleDiscPct>=0 && saleDiscPct<100) ? (salePrice / (1 - saleDiscPct/100)) : NaN;
  $("f-note").textContent =
    `Precio publicación orientativo: ${isFinite(listPrice)?fmtEur(listPrice):"—"} (cierre ${fmtEur(salePrice)}). ` +
    `Reforma total (con contingencia): ${fmtEur(renoTotal)}. Meses totales (base): ${fmtNum(renoMonths+saleMonths,0)}.`;

  // Sensibilidad rápida MAO vs ARV (sobre escenario Base)
  const sensMults = [0.90, 0.95, 1.00, 1.05, 1.10];
  const sensRows = sensMults.map(mult=>{
    const sc = { ...base, salePriceClose: base.salePriceClose*mult };
    const mao = solveMAO(sc);
    return { mult, arv: sc.salePriceClose, mao };
  });

  document.querySelector("#f-sens tbody").innerHTML = sensRows.map(x=>`
    <tr>
      <td>${fmtNum(x.mult,2)}</td>
      <td>${fmtEur(x.arv)}</td>
      <td>${isFinite(x.mao)?fmtEur(x.mao):"—"}</td>
    </tr>
  `).join("");

  return { base, results };
}

/* ============================================================
   Eventos
   ============================================================ */

function wireConfirmOnEdit(){
  const els = Array.from(document.querySelectorAll("input,select,textarea"));
  for (const el of els){
    // Ignora campos disabled
    if (el.disabled) continue;

    el.addEventListener("change", ()=>{
      // Si el usuario cambia algo, se considera confirmado
      if (el.id && el.id.startsWith("f-")){
        setConfirmed(el);
      }
    });
  }
}

function wireCompsEvents(){
  $("f-addComp")?.addEventListener("click", ()=>{
    addCompRow();
  });

  $("f-clearComps")?.addEventListener("click", ()=>{
    clearComps();
    // Recalcular sugerencias tras vaciar
    applySuggestions();
    flipCalculate();
  });

  $("f-compBody")?.addEventListener("click", (e)=>{
    const btn = e.target?.closest("[data-del]");
    if (!btn) return;
    const id = btn.getAttribute("data-del");
    const row = document.querySelector(`#f-compBody tr[data-comp="${id}"]`);
    row?.remove();
    applySuggestions();
  });

  $("f-compBody")?.addEventListener("input", ()=>{
    // Mientras editas comps, recomputa sugerencias (sin pisar confirmados)
    applySuggestions();
  });
}

function init(){
  // Defaults iniciales
  if ($("f-ccaa")) $("f-ccaa").value = "Comunitat Valenciana";
  if ($("f-source")) $("f-source").value = "idealista_jan2026";

  // 3 filas vacías por defecto
  clearComps();
  addCompRow(); addCompRow(); addCompRow();

  // Wire
  wireConfirmOnEdit();
  wireCompsEvents();

  $("f-recalcSuggestions")?.addEventListener("click", ()=>{
    // Al recalcular, no tocamos confirmados; solo re-evaluamos sugeridos
    applySuggestions();
    flipCalculate();
  });

  $("f-calc")?.addEventListener("click", ()=>flipCalculate());

  // Cambios de mercado recalculan sugerencias y resultados
  ["f-ccaa","f-source","f-m2","f-microAdjPct"].forEach(id=>{
    $(id)?.addEventListener("change", ()=>{
      applySuggestions();
      flipCalculate();
    });
  });

  // Export CSV
  $("f-exportCsv")?.addEventListener("click", ()=>{
    const out = flipCalculate();
    const rows = [
      ["Campo","Valor"],
      ["CCAA", str("f-ccaa")],
      ["Fuente baseline", str("f-source")],
      ["m2", num("f-m2")],
      ["Venta (cierre)", num("f-salePrice")],
      ["Oferta", num("f-offerPrice")],
      ["Reforma total", out.base.renoTotal],
      ["Meses (obra)", out.base.renoMonths],
      ["Meses (venta)", out.base.saleMonths],
      ["LTV compra", out.base.ltvBuy],
      ["Tipo compra", out.base.rateBuy],
      ["Buffer %", out.base.bufferPct],
      ["---","---"],
      ["Escenario","ARV","Meses","MAO","Beneficio (oferta)","IRR anual (oferta)"],
      ...out.results.map(r=>[r.name, r.arv, r.months, r.mao, r.profit, r.irrA])
    ];

    const csv = rows.map(r=>r.map(x=>String(x).replaceAll(";","")).join(";")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flip_resumen.csv";
    a.click();
  });

  // Copiar resumen
  $("f-copy")?.addEventListener("click", ()=>{
    const out = flipCalculate();
    const baseRes = out.results.find(x=>x.name==="Base") || out.results[0];
    const text =
`Calculadora de flip inmobiliario
CCAA: ${str("f-ccaa")}
Venta (cierre): ${fmtEur(out.base.salePriceClose)}
Tu oferta: ${fmtEur(out.base.purchasePrice)}
MAO (Base): ${isFinite(baseRes.mao)?fmtEur(baseRes.mao):"—"}
Beneficio (Base, con tu oferta): ${fmtEur(baseRes.profit)}
IRR anual (Base, con tu oferta): ${isFinite(baseRes.irrA)?(baseRes.irrA*100).toFixed(2)+"%":"—"}
Meses totales (Base): ${(out.base.renoMonths + out.base.saleMonths)} meses
Buffer riesgo: ${out.base.bufferPct}%`;
    navigator.clipboard?.writeText(text);
  });

  // Primer render
  applySuggestions();
  flipCalculate();
}

init();
