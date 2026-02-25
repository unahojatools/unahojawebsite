function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
function fmtPct(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"percent", maximumFractionDigits:2 }).format(n);
}

function cuotaMensualSistemaFrances(principal, tinAnualPct, meses) {
  const r = (tinAnualPct / 100) / 12;
  if (r === 0) return principal / meses;
  return principal * (r / (1 - Math.pow(1 + r, -meses)));
}

function irrMensualBiseccion(flows){
  let lo = -0.99, hi = 1.5;
  const npv = (r) => flows.reduce((s, cf, t)=> s + cf / Math.pow(1+r, t), 0);
  let fLo=npv(lo), fHi=npv(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo*fHi > 0) return NaN;

  for (let i=0;i<80;i++){
    const mid=(lo+hi)/2, fMid=npv(mid);
    if (Math.abs(fMid) < 1e-8) return mid;
    if (fLo*fMid <= 0){ hi=mid; fHi=fMid; } else { lo=mid; fLo=fMid; }
  }
  return (lo+hi)/2;
}

function hipotecaCalcular(){
  const P = Number(document.getElementById("h-principal").value||0);
  const years = Number(document.getElementById("h-years").value||0);
  const tin = Number(document.getElementById("h-tin").value||0);
  const upfront = Number(document.getElementById("h-upfront").value||0);
  const monthlyFees = Number(document.getElementById("h-monthlyFees").value||0);
  const extra = Number(document.getElementById("h-extra").value||0);

  const n = Math.max(1, Math.round(years*12));
  const cuota = cuotaMensualSistemaFrances(P, tin, n);
  const r = (tin/100)/12;

  let saldo=P, totalInteres=0, totalPagado=0;
  const annual=[];
  let year=1, accPago=0, accInt=0, accAmort=0;

  const flows=[P - upfront];

  for (let m=1;m<=n;m++){
    const interes=saldo*r;
    const amort=cuota-interes;
    let amortTotal=amort;

    if (extra>0 && (m%12===1) && m>1) amortTotal += extra;

    saldo=Math.max(0, saldo-amortTotal);

    totalInteres += interes;
    const pagoMes = (cuota + monthlyFees) + ((extra>0 && (m%12===1) && m>1) ? extra : 0);
    totalPagado += pagoMes;

    accPago += pagoMes;
    accInt += interes;
    accAmort += amortTotal;

    flows.push(-pagoMes);

    if (m%12===0 || saldo<=0){
      annual.push({ year, pago: accPago, interes: accInt, amort: accAmort, saldo });
      year++; accPago=0; accInt=0; accAmort=0;
    }
    if (saldo<=0) break;
  }

  const irrM = irrMensualBiseccion(flows);
  const tae = isFinite(irrM) ? (Math.pow(1+irrM,12)-1) : NaN;

  document.getElementById("h-kpis").innerHTML = `
    <div class="kpi"><div class="k">Cuota mensual</div><div class="v">${fmtEur(cuota)}</div></div>
    <div class="kpi"><div class="k">Intereses</div><div class="v">${fmtEur(totalInteres)}</div></div>
    <div class="kpi"><div class="k">Coste total</div><div class="v">${fmtEur(totalPagado + upfront)}</div></div>
    <div class="kpi"><div class="k">TAE aproximada</div><div class="v">${isFinite(tae)?fmtPct(tae):"—"}</div></div>
  `;

  document.querySelector("#h-table tbody").innerHTML = annual.map(a=>`
    <tr>
      <td>${a.year}</td><td>${fmtEur(a.pago)}</td><td>${fmtEur(a.interes)}</td><td>${fmtEur(a.amort)}</td><td>${fmtEur(a.saldo)}</td>
    </tr>
  `).join("");

  return { P, years, tin, upfront, monthlyFees, extra, cuota, totalInteres, totalPagado, tae };
}

document.getElementById("h-calc")?.addEventListener("click", ()=>hipotecaCalcular());
document.getElementById("h-copy")?.addEventListener("click", ()=>{
  const r = hipotecaCalcular();
  const text =
`Simulador de hipoteca
Capital: ${fmtEur(r.P)}
Plazo: ${r.years} años
TIN: ${r.tin}%
Cuota: ${fmtEur(r.cuota)}
Intereses: ${fmtEur(r.totalInteres)}
Coste total: ${fmtEur(r.totalPagado + r.upfront)}
TAE aprox.: ${isFinite(r.tae)?(r.tae*100).toFixed(2)+"%":"—"}`;
  navigator.clipboard?.writeText(text);
});
document.getElementById("h-exportCsv")?.addEventListener("click", ()=>{
  const r = hipotecaCalcular();
  const rows = [
    ["Campo","Valor"],
    ["Capital",r.P],["Plazo (años)",r.years],["TIN (%)",r.tin],
    ["Cuota mensual",r.cuota],["Intereses",r.totalInteres],
    ["Coste total",r.totalPagado + r.upfront],["TAE aprox.",r.tae]
  ];
  const csv = rows.map(x=>x.join(";")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hipoteca_resumen.csv";
  a.click();
});
hipotecaCalcular();
