'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const Database = require('better-sqlite3');
const {createRemoteRouter} = require('../src/remote');
const {createPairingStore} = require('../src/remote-pairing-store');
(async () => {
  const db = new Database(':memory:');
  const password = crypto.randomBytes(20).toString('hex'), salt = crypto.randomBytes(16).toString('hex');
  const hash = salt+':'+crypto.scryptSync(password,salt,32).toString('hex');
  const digest = s=>crypto.createHash('sha256').update(s).digest('hex');
  const oldToken=crypto.randomBytes(32).toString('hex');
  db.exec(`CREATE TABLE artauto_remote_pairing(slot INTEGER PRIMARY KEY CHECK(slot=1),token_hash TEXT NOT NULL,device_name TEXT NOT NULL,expires_at INTEGER NOT NULL,password_fingerprint TEXT NOT NULL)`);
  db.prepare('INSERT INTO artauto_remote_pairing VALUES(1,?,?,?,?)').run(digest(oldToken),'Original',Date.now()+86400000,digest(hash));
  let store=createPairingStore(db),server,base,cookie='',csrf='';
  const start=async(passwordHash=hash)=>{const app=express();app.use('/remote',createRemoteRouter({secure:false,passwordHash,pairingStore:store}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/remote/api/';};
  const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));};
  const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-Remote-CSRF':csrf,...extra},body:JSON.stringify(body)});
  const login=async()=>{const r=await post('login',{username:'Admin',password});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf;};
  const deviceGet=(route,token)=>fetch(base+'device/'+route,{headers:{Authorization:'Bearer '+token}});
  const frame=(token,byte)=>fetch(base+'device/frame',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:Buffer.from([255,216,byte,217])});
  try {
    await start();await login();
    assert.equal((await deviceGet('resume',oldToken)).status,200);
    const {code}=await (await post('pair-code',{})).json();
    const second=await (await post('device/pair',{code,name:'Segundo'})).json();
    const status=await (await fetch(base+'status',{headers:{Cookie:cookie}})).json();
    assert.equal(status.devices.length,2);assert(!JSON.stringify(status).includes('tokenHash'));
    assert.equal((await post('pair-code',{})).status,409);
    await frame(oldToken,1);await frame(second.token,2);
    // Older pages must not accidentally control/revoke either phone.
    assert.equal((await post('command',{type:'home'})).status,409);
    assert.equal((await post('disconnect',{})).status,409);
    assert.equal((await post('command',{deviceId:'unknown',type:'home'})).status,409);
    assert.equal((await post('command',{deviceId:'legacy',type:'insert',text:'A'})).status,202);
    assert.equal((await post('command',{deviceId:second.deviceId,type:'insert',text:'B'})).status,202);
    assert.equal((await (await deviceGet('commands',oldToken)).json()).commands[0].text,'A');
    assert.equal((await (await deviceGet('commands',second.token)).json()).commands[0].text,'B');
    for(const [id,byte] of [['legacy',1],[second.deviceId,2]]) {
      const r=await fetch(base+'frame?deviceId='+id,{headers:{Cookie:cookie}});assert.equal(Buffer.from(await r.arrayBuffer())[2],byte);
    }
    assert.equal((await fetch(base+'frame?deviceId=legacy')).status,401);
    const frameResponse=await fetch(base+'frame?deviceId=legacy',{headers:{Cookie:cookie}});
    const frameHash=frameResponse.headers.get('x-frame-hash');
    assert.match(frameHash,/^[a-f0-9]{64}$/);
    const unchanged=await fetch(base+'frame?deviceId=legacy&since='+frameHash,{headers:{Cookie:cookie}});
    assert.equal(unchanged.status,204);assert.equal((await unchanged.arrayBuffer()).byteLength,0);
    await frame(oldToken,3);
    assert.equal((await fetch(base+'frame?deviceId=legacy&since='+frameHash,{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(base+'frame?deviceId='+second.deviceId+'&since='+frameHash,{headers:{Cookie:cookie}})).status,200);
    assert.equal((await post('command',{deviceId:'legacy',type:'home'},{'X-Remote-CSRF':'bad'})).status,403);
    await stop();store=createPairingStore(db);await start();await login();
    assert.equal((await deviceGet('resume',oldToken)).status,200);
    assert.equal((await deviceGet('resume',second.token)).status,200);
    assert.equal((await post('command',{deviceId:'legacy',type:'home'})).status,409);
    await post('disconnect',{deviceId:'legacy'});
    assert.equal((await deviceGet('resume',oldToken)).status,401);
    assert.equal((await deviceGet('resume',second.token)).status,200);
    // Legacy record is never re-imported after revocation/restart.
    await stop();store=createPairingStore(db);await start();
    assert.equal((await deviceGet('resume',oldToken)).status,401);
    assert.equal((await deviceGet('resume',second.token)).status,200);
    await stop();await start('0'.repeat(32)+':'+'0'.repeat(64));
    assert.equal((await deviceGet('resume',second.token)).status,401);
    console.log('REMOTE_2_MULTI_ISOLATION_MIGRATION_RESTART_REVOCATION_OK');
  } finally {if(server?.listening)await stop();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
