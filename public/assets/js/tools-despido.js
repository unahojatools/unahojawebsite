function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
function daysBetween(aISO, bISO){
  const a = new Date(aISO), b = new Date(bISO);
  return Math.max(0, Math.ceil((b - a) / 86400000));
}
function yearsFraction(startISO, endISO){ return daysBetween(startISO, endISO) / 365; }

function indemnImprocedenteTramos(startISO, endISO){
  const corte = new Date("2012-02-12");
  const ini = new Date(startISO);
  const fin = new Date(endISO);

  const finPre = new Date(Math.min(fin.getTime(), corte.getTime()));
  const iniPost = new Date(Math.max(ini.getTime(), corte.getTime()));

  const pre = Math.max(0, Math.floor((finPre - ini) / 86400000));
  const post = Math.max(0, Math.floor((fin - iniPost) / 86400000));

  const diasIndPre = (pre/365) * 45;
  const diasIndPost = (post/365) * 33;
  return { diasIndPre, diasIndPost, totalDias: diasIndPre + diasIndPost };
}

function despidoCalcular(){
  const start = document.getElementById("d-start").value;
  const end = document.getElementById("d-end").value;
  const type = document.getElementById("d-type").value;
  const salarioMensual = Number(document.getElementById("d-salary").value||0);
  const pagas = Number(document.getElementById("d-pagas").value||12);
  const vacUsed = Number(document.getElementById("d-vacUsed").value||0);

  const salarioDiario = (salarioMensual * pagas) / 365;
  const anios = yearsFraction(start, end);

  let diasInd = 0;
  const detalle = [];

  if (type === "improcedente"){
    const tr = indemnImprocedenteTramos(start, end);
    diasInd = tr.totalDias;
    detalle.push(`Tramo anterior a 12/02/2012: ${tr.diasIndPre.toFixed(2)} días.`);
    detalle.push(`Tramo posterior: ${tr.diasIndPost.toFixed(2)} días.`);
  } else if (type === "objetivo"){
    diasInd = anios * 20;
    detalle.push(`Años: ${anios.toFixed(3)} × 20 días/año = ${diasInd.toFixed(2)} días.`);
  } else {
    detalle.push("Solo finiquito (sin indemnización).");
  }

  const indemnEur = (type === "solo_finiquito") ? 0 : (diasInd * salarioDiario);

  const year = new Date(end).getFullYear();
  const yearStart = `${year}-01-01`;
  const diasTrans = daysBetween(yearStart, end);
  const mesesAprox = diasTrans / 30.4167;
  const vacDev = mesesAprox * 2.5;
  const vacPend = Math.max(0, vacDev - vacUsed);
  const vacEur = vacPend * salarioDiario;

  const total = indemnEur + vacEur;

  document.getElementById("d-kpis").innerHTML = `
    <div class="kpi"><div class="k">Salario diario</div><div class="v">${fmtEur(salarioDiario)}</div></div>
    <div class="kpi"><div class="k">Indemnización</div><div class="v">${fmtEur(indemnEur)}</div></div>
    <div class="kpi"><div class="k">Vacaciones pendientes</div><div class="v">${vacPend.toFixed(1)} días</div></div>
    <div class="kpi"><div class="k">Total</div><div class="v">${fmtEur(total)}</div></div>
  `;

  document.getElementById("d-detail").innerHTML = `
    <strong>Indemnización</strong><br/>
    ${detalle.map(x=>`• ${x}`).join("<br/>")}<br/><br/>
    <strong>Vacaciones</strong><br/>
    • Devengadas: ${vacDev.toFixed(1)} días<br/>
    • Disfrutadas: ${vacUsed.toFixed(1)} días<br/>
    • Pendientes: ${vacPend.toFixed(1)} días (${fmtEur(vacEur)})
  `;

  return { start, end, type, salarioMensual, pagas, salarioDiario, indemnEur, vacPend, vacEur, total };
}

document.getElementById("d-calc")?.addEventListener("click", ()=>despidoCalcular());
document.getElementById("d-copy")?.addEventListener("click", ()=>{
  const r = despidoCalcular();
  const text =
`Despido y finiquito (orientativo)
Tipo: ${r.type}
Fechas: ${r.start} → ${r.end}
Salario mensual: ${fmtEur(r.salarioMensual)} (${r.pagas} pagas)
Indemnización: ${fmtEur(r.indemnEur)}
Vacaciones pendientes: ${r.vacPend.toFixed(1)} días (${fmtEur(r.vacEur)})
Total: ${fmtEur(r.total)}`;
  navigator.clipboard?.writeText(text);
});

despidoCalcular();
