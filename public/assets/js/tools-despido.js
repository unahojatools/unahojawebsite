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
  const ini = new Date(startISO), fin = new Date(endISO);
  const finPre = new Date(Math.min(fin.getTime(), corte.getTime()));
  const iniPost = new Date(Math.max(ini.getTime(), corte.getTime()));
  const pre = Math.max(0, Math.floor((finPre - ini) / 86400000));
  const post = Math.max(0, Math.floor((fin - iniPost) / 86400000));
  const diasIndPre = (pre/365)*45;
  const diasIndPost = (post/365)*33;
  return { diasIndPre, diasIndPost, totalDias: diasIndPre + diasIndPost };
}
