'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const elements=new Map(),commands=[],keyboards=[];
function element(){return {dataset:{},classList:{add(){},remove(){}},value:'',appendChild(){},remove(){},setAttribute(){},removeAttribute(){},focus(){},blur(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}};}
const context={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement(tag){const el=element();if(tag==='textarea')keyboards.push(el);return el;}},fetch:async(url,options)=>{if(url.endsWith('/command'))commands.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({csrf:'test'}),blob:async()=>({})};},URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},setTimeout(){},FormData:class{},console};
(async()=>{
  vm.runInNewContext(fs.readFileSync(require.resolve('../remote-panel/panel.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  await vm.runInNewContext("(async()=>{const a=createCard({id:'a',name:'A'}),b=createCard({id:'b',name:'B'});cards.set('a',a);cards.set('b',b);await a.frame();await b.frame();})()",context);
  const [a,b]=keyboards;
  a.value='á';a.oninput({isComposing:false});
  a.onpaste({preventDefault(){},clipboardData:{getData(){return '123';}}});
  a.onkeydown({key:'Backspace',preventDefault(){}});
  a.onkeydown({key:'Delete',preventDefault(){}});
  a.onkeydown({key:'Enter',preventDefault(){}});
  a.value='ç';a.oninput({isComposing:true});a.oncompositionend();a.oninput({isComposing:false});
  b.value='segundo';b.oninput({isComposing:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(commands.filter(c=>c.deviceId==='a').map(c=>c.type),['insert','insert','backspace','delete','insert']);
  assert.deepEqual(commands.filter(c=>c.deviceId==='a'&&c.type==='insert').map(c=>c.text),['á','123','ç']);
  assert.deepEqual(commands.filter(c=>c.deviceId==='b'),[{type:'insert',text:'segundo',deviceId:'b'}]);
  vm.runInNewContext('showLogin()',context);
  b.value='nao enviar';b.oninput({isComposing:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(commands.length,6);
  console.log('REMOTE_KEYBOARD_TWO_DEVICE_INPUT_PASTE_COMPOSITION_LOGOUT_TESTS_OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
