function fmtDate(d){ return new Date(d).toISOString().slice(0,10); }
function esFinDeSemana(d){ const day=d.getDay(); return day===0||day===6; }

// Dataset mínimo de ejemplo (amplíalo si quieres “completo” por CCAA)
const HOLIDAYS_2026 = {
  MD: ["2026-01-01","2026-01-06","2026-05-01","2026-12-25"],
  VC: ["2026-01-01","2026-01-06","2026-03-19","2026-05-01","2026-12-25"],
  CT: ["2026-01-01","2026-01-06","2026-04-06","2026-05-01","2026-12-25"],
  AN: ["2026-01-01","2026-01-06","2026-02-28","2026-05-01","2026-12-25"],
  PV: ["2026-01-01","2026-01-06","2026-12-25"]
};

function isInhabil(d, ccaa){
  const list = HOLIDAYS_2026[ccaa] || [];
  return esFinDeSemana(d) || list.includes(fmtDate(d));
}

function contarHabiles(startISO, endISO, ccaa, includeStart){
  const a=new Date(startISO), b=new Date(endISO);
  if (b<a) return 0;
  let count=0;
  let cur=new Date(a);
  if (!includeStart) cur.setDate(cur.getDate()+1);
  while (cur<=b){
    if (!isInhabil(cur, ccaa)) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

function sumarHabiles(startISO, n, ccaa, includeStart){
  let d=new Date(startISO);
  let remaining=n;
  if (!includeStart) d.setDate(d.getDate()+1);
  while (remaining>0){
    if (!isInhabil(d, ccaa)) remaining--;
    if (remaining>0) d.setDate(d.getDate()+1);
  }
  return fmtDate(d);
}

function habilesCalcular(){
  const ccaa=document.getElementById("c-ccaa").value;
  const start=document.getElementById("c-start").value;
  const end=document.getElementById("c-end").value;
  const n=Number(document.getElementById("c-n").value||0);
  const includeStart=document.getElementById("c-incStart").value==="si";

  const hab=contarHabiles(start,end,ccaa,includeStart);
  const target=n>0?sumarHabiles(start,n,ccaa,includeStart):"—";

  document.getElementById("c-kpis").innerHTML=`
    <div class="kpi"><div class="k">Días hábiles</div><div class="v">${hab}</div></div>
    <div class="kpi"><div class="k">Fecha al sumar N</div><div class="v">${target}</div></div>
    <div class="kpi"><div class="k">CCAA</div><div class="v">${ccaa}</div></div>
    <div class="kpi"><div class="k">Incluye inicio</div><div class="v">${includeStart?"Sí":"No"}</div></div>
  `;
  return {ccaa,start,end,n,includeStart,hab,target};
}

document.getElementById("c-calc")?.addEventListener("click", ()=>habilesCalcular());
document.getElementById("c-copy")?.addEventListener("click", ()=>{
  const r=habilesCalcular();
  const text=`Días hábiles 2026\nCCAA: ${r.ccaa}\nIntervalo: ${r.start} → ${r.end}\nHábiles: ${r.hab}\nSumar N=${r.n}: ${r.target}`;
  navigator.clipboard?.writeText(text);
});

document.getElementById("c-exportIcs")?.addEventListener("click", ()=>{
  const ccaa=document.getElementById("c-ccaa").value;
  const holidays=HOLIDAYS_2026[ccaa]||[];
  const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//UnaHojaTools//DiasHabiles//ES
CALSCALE:GREGORIAN
${holidays.map(d=>`BEGIN:VEVENT
DTSTART;VALUE=DATE:${d.replaceAll("-","")}
DTEND;VALUE=DATE:${d.replaceAll("-","")}
SUMMARY:Festivo (${ccaa})
END:VEVENT`).join("\n")}
END:VCALENDAR`;

  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`festivos_2026_${ccaa}.ics`;
  a.click();
});

habilesCalcular();
