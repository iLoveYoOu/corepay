'use strict';
let csrf = '', live = false, imageUrl = '', down = null;
const $ = id => document.getElementById(id);
async function api(route, body) {
  const r = await fetch('/remote/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Remote-CSRF': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) { if (r.status === 401) showLogin(); let message = 'Erro de conexão (' + r.status + ')'; try { message = (await r.json()).error || message; } catch {} throw Error(message); }
  return r.status === 204 || r.status === 202 ? {} : r.json();
}
function showLogin(){live=false;$('login').hidden=false;$('controls').hidden=true;$('screen').removeAttribute('src');if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';}
function connected(){live=true;$('login').hidden=true;$('controls').hidden=false;$('screen').hidden=true;$('status').textContent='Celular desconectado — pareie o aparelho para começar.';}
function error(e){$('status').textContent=e.message;}
$('login').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));csrf=(await api('login',data)).csrf;e.target.password.value='';connected();}catch(e){error(e);}};
$('pair').onclick=async()=>{try{const d=await api('pair-code',{});$('code').textContent='No celular, informe: '+d.code+' (válido por 2 minutos)';}catch(e){error(e);}};
$('disconnect').onclick=async()=>{try{await api('disconnect',{});$('screen').removeAttribute('src');$('status').textContent='Acesso desativado; pareie novamente para conectar.';}catch(e){error(e);}};
$('logout').onclick=async()=>{try{await api('logout',{});showLogin();}catch(e){error(e);}};
async function command(body){try{await api('command',body);}catch(e){error(e);}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command({type:b.dataset.action}));
const point=e=>{const r=$('screen').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
$('screen').tabIndex=0;
// Only this dedicated input receives PC typing; login and other fields stay local.
const keyboard=document.createElement('textarea');
keyboard.setAttribute('aria-label','Teclado do celular remoto');
keyboard.autocomplete='off';keyboard.spellcheck=false;
keyboard.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px';
document.body.appendChild(keyboard);
const keyboardHint=document.createElement('p');
keyboardHint.textContent='Clique no campo do celular e digite no teclado do PC. Ctrl+V cola; Backspace/Delete apagam. Enter não confirma. Campos protegidos usam o teclado do celular.';
$('screen').insertAdjacentElement('afterend',keyboardHint);
let keyboardQueue=Promise.resolve();
function keyboardCommand(body){keyboardQueue=keyboardQueue.then(()=>live?command(body):undefined);}
keyboard.oninput=e=>{if(e.isComposing)return;if(keyboard.value)keyboardCommand({type:'insert',text:keyboard.value.slice(0,1000)});keyboard.value='';};
keyboard.oncompositionend=()=>{if(keyboard.value)keyboardCommand({type:'insert',text:keyboard.value.slice(0,1000)});keyboard.value='';};
keyboard.onpaste=e=>{e.preventDefault();const text=e.clipboardData?.getData('text/plain');if(text)keyboardCommand({type:'insert',text:text.slice(0,1000)});};
keyboard.onkeydown=e=>{if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();keyboardCommand({type:e.key==='Backspace'?'backspace':'delete'});}else if(e.key==='Enter'){e.preventDefault();}else if(e.key==='Escape'){keyboard.blur();$('screen').focus();}};
$('screen').onfocus=()=>keyboard.focus({preventScroll:true});
$('screen').onpointerdown=e=>{down=point(e);keyboard.focus({preventScroll:true});$('screen').setPointerCapture(e.pointerId);};
$('screen').onpointercancel=()=>{down=null;};
$('screen').onpointerup=e=>{if(!down)return;const end=point(e),start=down;down=null;command(Math.hypot(start.x-end.x,start.y-end.y)<.015?{type:'tap',...end}:{type:'swipe',...start,x2:end.x,y2:end.y});};
$('typing').onsubmit=e=>{e.preventDefault();command({type:'text',text:e.target.text.value});e.target.text.value='';};
let statusAt=0;
async function tick(){if(live){try{if(Date.now()-statusAt>2000){const s=await api('status');statusAt=Date.now();$('status').textContent=s.online?'Conectado: '+s.name:'Celular desconectado — abra o Remote no aparelho.';}const r=await fetch('/remote/api/frame');if(r.ok){const next=URL.createObjectURL(await r.blob());$('screen').src=next;$('screen').hidden=false;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=next;}else if(r.status===401){showLogin();}else{$('screen').hidden=true;$('screen').removeAttribute('src');}}catch(e){error(e);}}setTimeout(tick,100);}
api('session').then(s=>{csrf=s.csrf;connected();}).catch(()=>{});tick();
