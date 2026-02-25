function fmtEur(n){
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(n);
}
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
