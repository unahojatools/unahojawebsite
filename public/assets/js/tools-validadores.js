function cleanAlnum(s){ return (s||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(); }

function letraDniDesdeNumero(num8){
  const letras="TRWAGMYFPDXBNJZSQVHLCKE";
  return letras[Number(num8)%23];
}

function validarDniNie(input){
  const s=cleanAlnum(input);
  if(!s) return {ok:false,msg:"Introduce un DNI o NIE."};

  const nie=s.match(/^([XYZ])(\d{7})([A-Z])$/);
  if(nie){
    const map={X:"0",Y:"1",Z:"2"};
    const num=map[nie[1]]+nie[2];
    const letra=letraDniDesdeNumero(num);
    const ok=letra===nie[3];
    return {ok,tipo:"NIE",esperado:`${nie[1]}${nie[2]}${letra}`,msg:ok?"Válido.":"No válido."};
  }

  const dni=s.match(/^(\d{8})([A-Z])$/);
  if(dni){
    const letra=letraDniDesdeNumero(dni[1]);
    const ok=letra===dni[2];
    return {ok,tipo:"DNI",esperado:`${dni[1]}${letra}`,msg:ok?"Válido.":"No válido."};
  }

  const only=s.match(/^(\d{8})$/);
  if(only){
    const letra=letraDniDesdeNumero(only[1]);
    return {ok:false,tipo:"DNI",esperado:`${only[1]}${letra}`,msg:"Falta la letra."};
  }

  return {ok:false,msg:"Formato no reconocido."};
}

// mod97 incremental
function mod97(numStr){
  let r=0;
  for(const ch of numStr){
    r=(r*10+(ch.charCodeAt(0)-48))%97;
  }
  return r;
}

function validarIbanES(iban){
  const clean=cleanAlnum(iban);
  if(!clean) return {ok:false,msg:"Introduce un IBAN."};
  if(!clean.startsWith("ES")) return {ok:false,msg:"Este validador está orientado a IBAN ES."};
  if(clean.length!==24) return {ok:false,msg:`Longitud inválida (${clean.length}).`,clean};

  const moved=clean.slice(4)+clean.slice(0,4);
  let expanded="";
  for(const c of moved){
    if(c>="A" && c<="Z") expanded+=String(c.charCodeAt(0)-55);
    else expanded+=c;
  }
  const ok=mod97(expanded)===1;
  return {ok,msg:ok?"Válido.":"No válido.",clean};
}

function run(){
  const r1=validarDniNie(document.getElementById("v-id").value);
  const r2=validarIbanES(document.getElementById("v-iban").value);

  document.getElementById("v-out").innerHTML=`
    <strong>DNI/NIE</strong><br/>
    <span class="${r1.ok?"ok":"bad"}">${r1.ok?"✅ Válido":"❌ No válido"}</span>
    ${r1.tipo?` <span class="pill">${r1.tipo}</span>`:""}<br/>
    ${r1.msg}${r1.esperado?` Sugerencia: <span style="font-family:var(--mono)">${r1.esperado}</span>`:""}
    <br/><br/>
    <strong>IBAN ES</strong><br/>
    <span class="${r2.ok?"ok":"bad"}">${r2.ok?"✅ Válido":"❌ No válido"}</span><br/>
    ${r2.msg}${r2.clean?` IBAN: <span style="font-family:var(--mono)">${r2.clean}</span>`:""}
  `;
  return {r1,r2};
}

document.getElementById("v-calc")?.addEventListener("click", ()=>run());
document.getElementById("v-copy")?.addEventListener("click", ()=>{
  const r=run();
  const text=`Validadores\nDNI/NIE: ${r.r1.ok?"Válido":"No válido"}${r.r1.esperado?` | ${r.r1.esperado}`:""}\nIBAN: ${r.r2.ok?"Válido":"No válido"}${r.r2.clean?` | ${r.r2.clean}`:""}`;
  navigator.clipboard?.writeText(text);
});

run();
