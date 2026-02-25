function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
const RATES = {
  legal: { 2025: 0.0325, 2026: 0.0325 },
  demora:{ 2025: 0.040625, 2026: 0.040625 }
};
