'use strict';
let csrf = '', live = false, epoch = 0;
const cards = new Map();
const $ = id => document.getElementById(id);
async function api(route, body) {
  const r = await fetch('/remote/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Remote-CSRF': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) { if (r.status === 401) showLogin(); let message = 'Erro de conexão (' + r.status + ')'; try { message = (await r.json()).error || message; } catch {} throw Error(message); }
  return r.status === 204 || r.status === 202 ? {} : r.json();
}
function clearCards() { for (const c of cards.values()) c.destroy(); cards.clear(); }
function showLogin() { live=false;epoch++;clearCards();$('login').hidden=false;$('controls').hidden=true; }
function connected() { epoch++;live=true;$('login').hidden=true;$('controls').hidden=false;$('status').textContent='Consultando aparelhos…'; }
function error(e) { $('status').textContent=e.message; }
$('login').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));csrf=(await api('login',data)).csrf;e.target.password.value='';connected();}catch(e){error(e);}};
$('pair').onclick=async()=>{try{const d=await api('pair-code',{});$('code').textContent='No novo celular, informe: '+d.code+' (válido por 2 minutos). O aparelho atual permanece pareado.';}catch(e){error(e);}};
$('logout').onclick=async()=>{try{await api('logout',{});showLogin();}catch(e){error(e);}};
function element(tag, parent, text) { const e=document.createElement(tag);if(text)e.textContent=text;parent.appendChild(e);return e; }
function createCard(device) {
  const root=element('article',$('devices'));root.className='device';root.dataset.deviceId=device.id;
  const title=element('h2',root,device.name);
  const state=element('p',root,'Desconectado');state.setAttribute('role','status');
  const screen=element('img',root);screen.alt='Tela de '+device.name;screen.className='screen';screen.hidden=true;screen.draggable=false;screen.tabIndex=0;
  const hint=element('p',root,'Clique na tela para direcionar o teclado a este aparelho. Ctrl+V cola; Enter não confirma.');hint.className='hint';
  const keyboard=element('textarea',root);keyboard.className='remote-keyboard';keyboard.setAttribute('aria-label','Teclado de '+device.name);keyboard.autocomplete='off';keyboard.spellcheck=false;
  const nav=element('nav',root);
  const form=element('form',root);const input=element('input',form);input.name='text';input.placeholder='Texto para '+device.name;input.maxLength=1000;input.autocomplete='off';
  element('button',form,'Inserir texto');
  let imageUrl='',down=null,alive=true,ready=false,queue=Promise.resolve();
  const command=body=>{if(!ready||!alive||!live)return Promise.resolve();const generation=epoch;
    queue=queue.then(async()=>{if(!alive||!ready||!live||epoch!==generation)return;try{await api('command',{...body,deviceId:device.id});}catch(e){state.textContent=e.message;}});return queue;};
  for(const [type,label] of [['back','Voltar'],['home','Início'],['recents','Recentes']]) element('button',nav,label).onclick=()=>command({type});
  const revoke=element('button',root,'Revogar este aparelho');revoke.className='revoke';revoke.onclick=async()=>{
    if(!confirm('Revogar o acesso de '+device.name+'? Será necessário parear esse aparelho novamente.'))return;
    try{await api('disconnect',{deviceId:device.id});card.destroy();cards.delete(device.id);}catch(e){state.textContent=e.message;}
  };
  function flush(){if(keyboard.value)command({type:'insert',text:keyboard.value.slice(0,1000)});keyboard.value='';}
  keyboard.oninput=e=>{if(!e.isComposing)flush();};keyboard.oncompositionend=flush;
  keyboard.onpaste=e=>{e.preventDefault();const text=e.clipboardData?.getData('text/plain');if(text)command({type:'insert',text:text.slice(0,1000)});};
  keyboard.onkeydown=e=>{if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();command({type:e.key==='Backspace'?'backspace':'delete'});}else if(e.key==='Enter')e.preventDefault();else if(e.key==='Escape')keyboard.blur();};
  keyboard.onfocus=()=>{for(const c of cards.values())c.root.classList.remove('selected');root.classList.add('selected');};
  keyboard.onblur=()=>root.classList.remove('selected');
  const point=e=>{const r=screen.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  screen.onfocus=()=>keyboard.focus({preventScroll:true});
  screen.onpointerdown=e=>{if(!ready)return;down=point(e);keyboard.focus({preventScroll:true});screen.setPointerCapture(e.pointerId);};
  screen.onpointercancel=()=>{down=null;};
  screen.onpointerup=e=>{if(!down)return;const end=point(e),start=down;down=null;command(Math.hypot(start.x-end.x,start.y-end.y)<.015?{type:'tap',...end}:{type:'swipe',...start,x2:end.x,y2:end.y});};
  form.onsubmit=e=>{e.preventDefault();command({type:'text',text:input.value});input.value='';};
  const hide=()=>{ready=false;down=null;screen.hidden=true;screen.removeAttribute('src');if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';};
  const card={root,update(d){title.textContent=d.name;state.textContent=d.online?'Conectado: '+d.name:'Desconectado — abra o Remote no aparelho.';if(!d.online)hide();},
    async frame(){const generation=epoch;try{const r=await fetch('/remote/api/frame?deviceId='+encodeURIComponent(device.id));
      if(r.status===401){showLogin();return;}if(!r.ok){hide();return;}const blob=await r.blob();if(!alive||!live||generation!==epoch)return;
      const next=URL.createObjectURL(blob);screen.src=next;screen.hidden=false;ready=true;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=next;
    }catch(e){hide();state.textContent='Sem imagem atual: '+e.message;}},
    destroy(){alive=false;hide();root.remove();}};
  return card;
}
let statusAt=0;
async function tick(){try{if(live){const generation=epoch;
  if(Date.now()-statusAt>2000){const s=await api('status');if(generation!==epoch||!live)return;statusAt=Date.now();
    const rows=s.devices||[];for(const [id,c] of cards)if(!rows.some(d=>d.id===id)){c.destroy();cards.delete(id);}
    for(const d of rows){if(!cards.has(d.id))cards.set(d.id,createCard(d));cards.get(d.id).update(d);}
    $('pair').disabled=rows.length>=2;if(rows.length>=2)$('code').textContent='';$('status').textContent=rows.length+' de 2 aparelhos pareados. Cada tela possui controles independentes.';
  }
  await Promise.all([...cards.values()].map(c=>c.frame()));
}}catch(e){error(e);}finally{setTimeout(tick,150);}}
api('session').then(s=>{csrf=s.csrf;connected();}).catch(()=>{});tick();
