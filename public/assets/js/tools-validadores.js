function cleanAlnum(s){ return (s||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(); }
function letraDniDesdeNumero(num8){
  const letras="TRWAGMYFPDXBNJZSQVHLCKE";
  return letras[Number(num8)%23];
}
function mod97(numStr){
  let r=0;
  for(const ch of numStr){ r=(r*10+(ch.charCodeAt(0)-48))%97; }
  return r;
}
