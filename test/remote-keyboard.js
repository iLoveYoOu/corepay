'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const elements=new Map();const commands=[];
function element(){return {style:{},value:'',setAttribute(){},removeAttribute(){},focus(){},insertAdjacentElement(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}};}
let keyboard;
const context={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return [];},createElement(tag){const el=element();if(tag==='textarea')keyboard=el;return el;},body:{appendChild(){}}},fetch:async(url,options)=>{if(url.endsWith('/command'))commands.push(JSON.parse(options.body));return {ok:true,status:202,json:async()=>({csrf:'test'})};},URL:{revokeObjectURL(){}},setTimeout(){},FormData:class{},console};
(async()=>{
  vm.runInNewContext(fs.readFileSync(require.resolve('../remote-panel/panel.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  keyboard.value='á';keyboard.oninput({isComposing:false});
  keyboard.onpaste({preventDefault(){},clipboardData:{getData(){return '123';}}});
  keyboard.onkeydown({key:'Backspace',preventDefault(){}});
  keyboard.onkeydown({key:'Delete',preventDefault(){}});
  keyboard.onkeydown({key:'Enter',preventDefault(){}});
  keyboard.value='ç';keyboard.oninput({isComposing:true});keyboard.oncompositionend();keyboard.oninput({isComposing:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(commands.map(c=>c.type),['insert','insert','backspace','delete','insert']);
  assert.deepEqual(commands.filter(c=>c.type==='insert').map(c=>c.text),['á','123','ç']);
  console.log('REMOTE_KEYBOARD_INPUT_PASTE_COMPOSITION_TESTS_OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
