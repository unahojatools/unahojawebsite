function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}

// Tabla de ejemplo. Actualízala cuando cambien tipos.
const RATES = {
  legal: { 2024: 0.0325, 2025: 0.0325, 2026: 0.0325 },
  demora:{ 2024: 0.040625, 2025: 0.040625, 2026: 0.040625 }
};

function interesPorTramos(principal, startISO, endISO, ratesByYear, baseDays, cap){
  const ini=new Date(startISO), fin=new Date(endISO);
  if(fin<=ini) return { total:0, tramos:[], final:principal };

  let d=new Date(ini);
  let total=0;
  let capital=principal;
  const tramos=[];

  while(d<fin){
    const y=d.getFullYear();
    const endYear=new Date(y+1,0,1);
    const d2=new Date(Math.min(fin.getTime(), endYear.getTime()));
    const dias=Math.ceil((d2-d)/86400000);
    const tipo=ratesByYear[y];
    if(tipo==null) throw new Error("Falta tipo para el año "+y);

    let interes=0;
    if(cap==="simple"){
      interes=capital*tipo*(dias/baseDays);
      total+=interes;
    } else {
      const factor=1+(tipo*(dias/baseDays));
      const before=capital;
      capital=capital*factor;
      interes=capital-before;
      total+=interes;
    }
    tramos.push({ periodo:`${y}`, dias, tipo, interes });
    d=d2;
  }

  const final = (cap==="compuesta") ? capital : (principal + total);
  return { total, tramos, final };
}

function run(){
  const principal=Number(document.getElementById("i-principal").value||0);
  const type=document.getElementById("i-type").value;
  const start=document.getElementById("i-start").value;
  const end=document.getElementById("i-end").value;
  const base=Number(document.getElementById("i-base").value||365);
  const cap=document.getElementById("i-cap").value;

  const out=interesPorTramos(principal,start,end,RATES[type],base,cap);

  document.getElementById("i-kpis").innerHTML=`
    <div class="kpi"><div class="k">Interés</div><div class="v">${fmtEur(out.total)}</div></div>
    <div class="kpi"><div class="k">Total</div><div class="v">${fmtEur(out.final)}</div></div>
    <div class="kpi"><div class="k">Base</div><div class="v">${base}</div></div>
    <div class="kpi"><div class="k">Tipo</div><div class="v">${type}</div></div>
  `;

  document.querySelector("#i-table tbody").innerHTML=out.tramos.map(t=>`
    <tr><td>${t.periodo}</td><td>${t.dias}</td><td>${(t.tipo*100).toFixed(4)}%</td><td>${fmtEur(t.interes)}</td></tr>
  `).join("");

  return { principal,type,start,end,base,cap,out };
}

document.getElementById("i-calc")?.addEventListener("click", ()=>{
  try{ run(); } catch(e){ alert(e.message||String(e)); }
});
document.getElementById("i-copy")?.addEventListener("click", ()=>{
  const r=run();
  const text=`Intereses (${r.type})\nPrincipal: ${fmtEur(r.principal)}\nPeriodo: ${r.start} → ${r.end}\nInterés: ${fmtEur(r.out.total)}\nTotal: ${fmtEur(r.out.final)}`;
  navigator.clipboard?.writeText(text);
});
document.getElementById("i-exportCsv")?.addEventListener("click", ()=>{
  const r=run();
  const rows=[["Periodo","Dias","Tipo","Interes"], ...r.out.tramos.map(t=>[t.periodo,t.dias,t.tipo,t.interes])];
  const csv=rows.map(x=>x.join(";")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="intereses_tramos.csv";
  a.click();
});
run();
