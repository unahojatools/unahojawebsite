function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

const DURACION = [
  { min: 360, max: 539, dias: 120 },
  { min: 540, max: 719, dias: 180 },
  { min: 720, max: 899, dias: 240 },
  { min: 900, max: 1079, dias: 300 },
  { min: 1080, max: 1259, dias: 360 },
  { min: 1260, max: 1439, dias: 420 },
  { min: 1440, max: 1619, dias: 480 },
  { min: 1620, max: 1799, dias: 540 },
  { min: 1800, max: 1979, dias: 600 },
  { min: 1980, max: 2159, dias: 660 },
  { min: 2160, max: Infinity, dias: 720 }
];

function duracionPrestacion(diasCot){
  const t=DURACION.find(x=>diasCot>=x.min && diasCot<=x.max);
  return t ? t.dias : 0;
}
function cuantiaDiaria(baseDiaria, dia){ return baseDiaria*(dia<=180?0.70:0.60); }

function run(){
  const cot=Number(document.getElementById("s-cot").value||0);
  const base=Number(document.getElementById("s-base").value||0);
  const hijos=Number(document.getElementById("s-hijos").value||0);
  const jornada=Number(document.getElementById("s-jornada").value||1);

  const dur=duracionPrestacion(cot);

  // Estimación mensual simplificada (30 días)
  const q1=cuantiaDiaria(base,1)*30;
  const q2=cuantiaDiaria(base,181)*30;

  // Topes orientativos de ejemplo (ajustables)
  const maxBase=(hijos===0?1200:hijos===1?1400:1600)*jornada;
  const minBase=(hijos===0?560:750)*jornada;

  const q1Adj=clamp(q1,minBase,maxBase);
  const q2Adj=clamp(q2,minBase,maxBase);

  document.getElementById("s-kpis").innerHTML=`
    <div class="kpi"><div class="k">Duración</div><div class="v">${dur} días</div></div>
    <div class="kpi"><div class="k">Cuantía inicial</div><div class="v">${fmtEur(q1Adj)}</div></div>
    <div class="kpi"><div class="k">Desde día 181</div><div class="v">${fmtEur(q2Adj)}</div></div>
    <div class="kpi"><div class="k">Jornada</div><div class="v">${Math.round(jornada*100)}%</div></div>
  `;
  return {cot,base,hijos,jornada,dur,q1Adj,q2Adj};
}

document.getElementById("s-calc")?.addEventListener("click", ()=>run());
document.getElementById("s-copy")?.addEventListener("click", ()=>{
  const r=run();
  const text=`Prestación (orientativo)\nCotización: ${r.cot} días\nDuración: ${r.dur} días\nCuantía inicial: ${fmtEur(r.q1Adj)}/mes\nDesde día 181: ${fmtEur(r.q2Adj)}/mes`;
  navigator.clipboard?.writeText(text);
});
run();
