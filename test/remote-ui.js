'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { chromium } = require('playwright');
const { createRemoteRouter } = require('../src/remote');
(async()=>{
  const salt=crypto.randomBytes(16).toString('hex'), password=crypto.randomBytes(20).toString('hex');
  const app=express();app.use('/remote',createRemoteRouter({secure:false,passwordHash:salt+':'+crypto.scryptSync(password,salt,32).toString('hex')}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1050,height:800}});
    await page.goto('http://127.0.0.1:'+server.address().port+'/remote');
    await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.locator('#controls').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Parear celular'}).click();
    await page.waitForFunction(()=>/\d{8}/.test(document.getElementById('code').textContent));
    assert.match(await page.locator('#code').textContent(),/válido por 2 minutos/);
    await page.route('**/remote/api/status',route=>route.fulfill({json:{devices:[{id:'a',name:'Android A',online:true},{id:'b',name:'Android B',online:true}]}}));
    await page.route('**/remote/api/frame?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="420"><rect width="240" height="420" fill="#20343d"/><text x="30" y="210" fill="white">Tela de teste</text></svg>'}));
    await page.locator('.device').nth(1).waitFor();
    await page.locator('.screen').nth(1).waitFor({state:'visible'});
    const first=await page.locator('.device').nth(0).boundingBox(),second=await page.locator('.device').nth(1).boundingBox();
    assert.equal(first.y,second.y);assert.ok(second.x>first.x);
    assert.equal(await page.locator('#pair').isDisabled(),true);
    await page.screenshot({path:require('path').join(__dirname,'../../../remote-panel-preview.png')});
    await page.setViewportSize({width:390,height:844});
    const mobileFirst=await page.locator('.device').nth(0).boundingBox(),mobileSecond=await page.locator('.device').nth(1).boundingBox();
    assert.ok(mobileSecond.y>mobileFirst.y);
    await page.getByRole('button',{name:'Sair',exact:true}).click();await page.locator('#login').waitFor({state:'visible'});
    console.log('REMOTE_BROWSER_LOGIN_TWO_CARDS_RESPONSIVE_LOGOUT_TESTS_OK');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
