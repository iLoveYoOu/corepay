'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createRemoteRouter } = require('../src/remote');
(async () => {
  const salt = crypto.randomBytes(16).toString('hex'), password = crypto.randomBytes(20).toString('hex');
  const app = express(); app.use('/remote', createRemoteRouter({ secure: false, passwordHash: salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex') }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/remote/api/';
  let cookie='',csrf='';
  const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-Remote-CSRF':csrf,...extra},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(base+'status')).status,401);
    assert.equal((await post('login',{username:'Admin',password:'wrong'})).status,401);
    const login=await post('login',{username:'Admin',password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
    assert.equal((await post('pair-code',{}, {'X-Remote-CSRF':''})).status,403);
    const {code}=await (await post('pair-code',{})).json();
    assert.equal((await post('device/pair',{code:'00000000'})).status,401);
    const {token}=await (await post('device/pair',{code,name:'Test Android'})).json();
    assert.equal((await post('device/pair',{code})).status,401);
    const auth={Authorization:'Bearer '+token};
    assert.equal((await post('command',{type:'tap',x:.5,y:.5})).status,409);
    assert.equal((await fetch(base+'device/frame',{method:'POST',headers:{...auth,'Content-Type':'image/jpeg'},body:Buffer.from([255,216,255,217])})).status,204);
    assert.equal((await post('command',{type:'tap',x:2,y:.5})).status,400);
    assert.equal((await post('command',{type:'tap',x:.5,y:.5})).status,202);
    const command=await (await fetch(base+'device/commands',{headers:auth})).json();assert.equal(command.commands.length,1);
    assert.equal((await (await fetch(base+'device/commands',{headers:auth})).json()).commands.length,0);
    assert.equal((await post('disconnect',{})).status,204);
    assert.equal((await fetch(base+'device/commands',{headers:auth})).status,401);
    assert.equal((await fetch(base+'frame',{headers:{Cookie:cookie}})).status,404);
    assert.equal((await post('logout',{})).status,204);
    assert.equal((await fetch(base+'status',{headers:{Cookie:cookie}})).status,401);
    console.log('REMOTE_AUTH_PAIRING_COMMAND_REVOCATION_TESTS_OK');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
