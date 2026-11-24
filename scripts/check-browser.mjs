import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { checkMobileTilt } from './mobile-controls.mjs'
import { createServer } from 'vite'

// Launch against a disposable origin so a test run never changes a player's saved records.
const server = await createServer({logLevel:'error', server:{host:'127.0.0.1', port:0, hmr:false}})
let browser
let page
try {
  await server.listen()
  const url = server.resolvedUrls.local[0]
  const args = {headless:true, args:['--enable-gpu','--enable-unsafe-swiftshader',...(process.platform==='win32'?['--use-angle=d3d11']:[])]}
  if (process.env.CHROME_PATH) browser=await chromium.launch({...args,executablePath:process.env.CHROME_PATH})
  else {
    try { browser=await chromium.launch({...args,channel:'chrome'}) }
    catch { browser=await chromium.launch({...args,channel:'msedge'}) }
  }
  const captureFlag = process.argv.indexOf('--screenshots')
  const folder = captureFlag < 0 ? undefined : resolve(process.argv[captureFlag+1] || 'visual-check')
  if (folder) await mkdir(folder,{recursive:true})
  page=await browser.newPage({viewport:{width:1671,height:941},deviceScaleFactor:1})
  page.setDefaultTimeout(25000)
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{ if(message.type()==='error') errors.push(message.text()) })
  const button=(name)=>page.getByRole('button',{name,exact:true})
  const until=async(phase)=>{
    await page.waitForFunction(p=>window.corridorStatus?.().phase===p,phase,{timeout:30000})
    console.log('State:',phase)
  }
  const read=()=>page.evaluate(()=>window.corridorStatus())
  const cursor=locator=>locator.evaluate(element=>getComputedStyle(element).cursor)
  const checkPosterBehindDialog=async()=>{
    await page.getByRole('dialog').waitFor()
    const layers=await page.locator('.poster-art--covered').evaluate(async poster=>{
      await Promise.all(poster.getAnimations().map(animation=>animation.finished))
      const z=selector=>Number(getComputedStyle(poster.querySelector(selector)).zIndex)
      const wordmark=[...poster.querySelectorAll('.poster-wordmark__plate')].find(plate=>plate.getBoundingClientRect().width>0)
      return {
        visible:poster.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
        ordered:z('.poster-press')<z('.poster-wordmark') && z('.poster-wordmark')<z('.poster-craft-position'),
        letters:wordmark?.querySelectorAll('.poster-wordmark__glyph').length,
      }
    })
    assert.deepEqual(layers,{visible:true,ordered:true,letters:4})
  }
  const completeDigits=async()=>{
    const numbers=page.locator('.run-result strong .result-digits')
    await numbers.first().waitFor()
    const actual=await numbers.evaluateAll(boxes=>boxes.map(box=>{
      const text=box.querySelector('.result-digits__ink')
      const bounds=box.getBoundingClientRect(), ink=text.getBoundingClientRect()
      return {value:text.textContent.replace(/\s/g,''), fits:ink.width>0 &&
        ink.left>=bounds.left-.6 && ink.right<=bounds.right+.6}
    }))
    const {flight}=await read()
    assert.deepEqual(actual,[{value:String(Math.round(flight.score)),fits:true},
      {value:String(Math.round(flight.distance))+'м',fits:true}])
  }

  await page.goto(url+'?qa=1&view=reference')
  await page.getByText('HEADPHONES RECOMMENDED',{exact:true}).waitFor()
  await page.getByRole('progressbar',{name:'Подготовка станции'}).waitFor()
  await until('menu')
  await page.waitForFunction(()=>window.corridorStatus().gpu.triangles>0)
  await page.getByRole('region',{name:'Загрузка Corridor Rush'}).waitFor({state:'detached'})
  await button('К старту').waitFor()
  assert.equal(await cursor(button('К старту')),'pointer')
  await page.locator('.main-menu').evaluate(async menu => {
    await Promise.all(menu.getAnimations({subtree:true})
      .filter(animation=>animation.animationName==='poster-nav-in').map(animation=>animation.finished))
  })
  if (folder) await page.screenshot({path:resolve(folder,'menu.png')})
  await button('Настройки').click()
  await checkPosterBehindDialog()
  const desktopControl=page.getByRole('switch',{name:'Управление с клавиатуры'})
  const settingsScroll=()=>page.locator('.race-body').evaluate(body=>body.scrollTop)
  const initialScroll=await settingsScroll()
  assert.equal(await desktopControl.getAttribute('aria-checked'),'true')
  await desktopControl.click()
  assert.equal((await desktopControl.textContent()).trim(),'Мышь')
  assert.equal(await settingsScroll(),initialScroll)
  await desktopControl.click()
  assert.match(await desktopControl.innerText(),/W\/S/)
  assert.equal(await settingsScroll(),initialScroll)
  await button('Низкая').click()
  await button('Назад').click()
  await button('Весь рейтинг').click()
  await checkPosterBehindDialog()
  await button('Всё время').click()
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:960,height:540})

  // Old installs recorded first launch automatically. Only an explicit opt-out skips the rules.
  await page.evaluate(()=>localStorage.setItem('corridor-rush:briefing:v1','1'))
  await button('К старту').click()
  await page.getByRole('dialog',{name:'Как играть'}).waitFor()
  assert.equal((await read()).phase,'menu')
  assert.equal((await read()).audio,0)
  await page.keyboard.press('Escape')
  await button('К старту').click()
  await page.getByRole('dialog',{name:'Как играть'}).waitFor()
  if (folder) await page.screenshot({path:resolve(folder,'briefing.png'),animations:'disabled'})
  await button('Играть').click()
  await until('countdown')
  await page.mouse.move(480,270)
  await page.keyboard.press('Escape')
  await until('paused')
  const frozen=(await read()).flight.distance
  await page.waitForTimeout(220)
  assert.equal((await read()).flight.distance,frozen)
  await page.getByRole('dialog').waitFor({state:'visible'})
  await button('Настройки').click()
  await checkPosterBehindDialog()
  await button('Назад').click()
  assert.equal(await cursor(button('Продолжить')),'pointer')
  await button('Продолжить').click()
  await page.mouse.move(480,270)
  await until('playing')
  const arc=page.locator('canvas.cockpit-arc')
  await arc.waitFor()
  assert.equal(await cursor(page.locator('.flight-canvas')),'none')
  assert.equal(await cursor(button('Пауза')),'none')
  const etched=await arc.evaluate(canvas=>{
    const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height)
    return canvas.getBoundingClientRect().top>innerHeight*.70 && data.some((value,index)=>index%4===3 && value>60)
  })
  assert.ok(etched,'The lower cockpit arc should be painted during flight.')
  await page.mouse.move(480,240)
  assert.equal((await read()).flight.y,0)
  const lightCheck=page.evaluate(()=>new Promise(resolve=>{
    const ranges={bass:[1,0],mids:[1,0],highs:[1,0],energy:[1,0],beatFlash:[1,0],beatIndex:[Infinity,0],kick:[1,0]}
    const sample=()=>{
      const status=window.corridorStatus()
      const levels=status.audioResponse
      if(levels) for(const [key,range] of Object.entries(ranges)) {
        range[0]=Math.min(range[0],levels[key])
        range[1]=Math.max(range[1],levels[key])
      }
      if(status.phase==='impact' || status.phase==='over') resolve(ranges)
      else requestAnimationFrame(sample)
    }
    sample()
  }))
  const flyTo = async (key,target) => {
    const up=key==='w' || key==='ArrowUp'
    await page.keyboard.down(key)
    try {
      await page.waitForFunction(({up,target})=>{
        const y=window.corridorStatus().flight.y
        return up ? y>=target : y<=target
      },{up,target},{timeout:2500})
    } finally { await page.keyboard.up(key) }
  }
  await flyTo('w',.25)
  await flyTo('ArrowDown',0)
  await flyTo('s',-.45)
  await flyTo('ArrowUp',-.16)
  await page.keyboard.down('Shift')
  await page.waitForFunction(()=>window.corridorStatus().flight.boostLevel>.55)
  assert.equal((await read()).flight.boosting,true)
  assert.equal(await cursor(page.locator('.flight-canvas')),'none')
  await page.keyboard.up('Shift')
  await page.waitForFunction(()=>window.corridorStatus().flight.boostLevel<.1)
  // The corner follows the route independently of the current speed.
  await page.waitForFunction(()=>window.corridorStatus().flight.passed===2)
  // Freeze rendering after the first corner. Audio alone would carry the level pilot
  // through the next (upper) barrier before they had a chance to steer.
  const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('No frame after the simulated stall')),5000)
    requestAnimationFrame(()=>{
      const before=window.corridorStatus()
      const deadline=performance.now()+1800
      while (performance.now()<deadline) { /* simulate a blocked main thread */ }
      requestAnimationFrame(()=>{
        clearTimeout(timeout)
        resolve({before,after:window.corridorStatus()})
      })
    })
  }))
  assert.equal(recovery.before.flight.next.kind,'top')
  assert.equal(recovery.after.phase,'playing')
  assert.equal(recovery.after.flight.passed,recovery.before.flight.passed)
  assert.ok(Math.abs(recovery.after.audio-recovery.before.seconds)<.2)
  assert.ok(Math.abs(recovery.after.seconds-recovery.after.audio)<.12)
  assert.ok(Math.abs(recovery.after.flight.distance-recovery.before.flight.distance)<2)
  assert.ok(Math.abs(recovery.after.flight.score-recovery.before.flight.score)<10)
  await flyTo('ArrowUp',1.6)
  await page.waitForFunction(()=>window.corridorStatus().flight.passed===4)
  await until('impact')
  assert.equal(await page.getByRole('dialog').isVisible(),false)
  const impact=(await read()).flight
  await until('over') // Holding the upper lane hits the bottom gate.
  await button('Ещё раз').waitFor()
  assert.equal(await cursor(button('Ещё раз')),'pointer')
  const death=await read()
  const range=await lightCheck
  assert.ok(range.mids[1]-range.mids[0]>.08 || range.highs[1]-range.highs[0]>.08)
  assert.ok(range.energy[1]>0 && range.bass[1]>0)
  assert.ok(range.beatIndex[1]>range.beatIndex[0] && range.kick[1]>range.kick[0],JSON.stringify(range))
  assert.ok(range.beatFlash[0]<.1 && range.beatFlash[1]>range.beatFlash[0],JSON.stringify(range))
  assert.equal(death.flight.reason,'barrier')
  assert.equal(death.flight.combo,4)
  assert.equal(death.flight.distance,impact.distance)
  assert.ok(death.flight.score>0)
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('corridor-rush/runs/1'))[0].score),death.flight.score)
  await button('Ещё раз').click()
  const rules=page.getByRole('dialog',{name:'Как играть'})
  await rules.waitFor()
  const skipRules=rules.getByLabel('Больше не показывать')
  assert.equal(await skipRules.isChecked(),false)
  await skipRules.check()
  await rules.getByRole('button',{name:'Играть',exact:true}).click()
  await until('countdown')
  assert.equal((await read()).flight.distance,0)
  await page.keyboard.press('Escape')
  await until('paused')
  await button('Главное меню').click()
  await until('menu')
  assert.equal(await page.getByRole('progressbar').count(),0)
  await button('Играть').waitFor()
  await button('Как играть').click()
  await page.getByRole('dialog',{name:'Как играть'}).waitFor()
  await button('Назад').click()
  await button('Рейтинг').click()
  assert.ok(await page.getByRole('dialog').getByText('Пилот',{exact:true}).isVisible())
  if (folder) {
    await page.setViewportSize({width:1272,height:704})
    await page.goto(url+'tests/reference.html')
    await page.waitForSelector('body[data-rendered=true]')
    await page.screenshot({path:resolve(folder,'flight.png')})
    await page.setViewportSize({width:1122,height:1402})
    await page.goto(url+'?qa=1&view=reference')
    await until('menu')
    await button('Настройки').click()
    await button('Высокая').click()
    await button('Назад').click()
    await button('Играть').click()
    await page.waitForFunction(()=>{
      const state=window.corridorStatus()
      return state.phase==='countdown' && state.seconds>=-1.85 && state.seconds< -1
    })
    await page.screenshot({path:resolve(folder,'countdown.png')})
    await until('over')
    await page.getByRole('dialog').waitFor({state:'visible'})
    await completeDigits()
    await page.screenshot({path:resolve(folder,'result.png'),animations:'disabled'})
  }
  // Use a real local-file selection and a short song to reach the Web Audio end boundary.
  const rate=12000, samples=rate*2.4, wav=Buffer.alloc(44+samples*2)
  wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8)
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22)
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28)
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples*2,40)
  for(let i=0;i<samples;i++) wav.writeInt16LE(Math.round(6200*Math.sin(i*2*Math.PI*70/rate)*Math.exp(-((i/rate)% .37)*31)),44+i*2)
  await page.setViewportSize({width:960,height:540})
  await page.goto(url+'?qa=1')
  await until('menu')
  const bundledTitle=(await read()).track
  const customTitle='Ночной полёт'
  const songPanel=page.getByRole('dialog',{name:'Своя песня'})
  const selectFile=async(file)=>{
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),
      songPanel.getByRole('button',{name:'Выбрать файл',exact:true}).click()])
    await chooser.setFiles(file)
  }
  await button('Своя песня').click()
  await songPanel.getByText(bundledTitle,{exact:true}).waitFor()
  await selectFile({name:customTitle+'.wav',mimeType:'audio/wav',buffer:wav})
  await songPanel.getByText(customTitle,{exact:true}).waitFor()
  assert.equal((await read()).track,customTitle)
  await selectFile({name:'повреждённый.wav',mimeType:'audio/wav',buffer:Buffer.from('Invalid WAV')})
  await songPanel.getByRole('alert').waitFor()
  assert.ok(await songPanel.getByText(customTitle,{exact:true}).isVisible())
  assert.equal((await read()).track,customTitle)
  await button('Назад').click()
  const beforeFinish=await page.evaluate(()=>JSON.parse(localStorage.getItem('corridor-rush/runs/1')).length)
  await button('Настройки').click()
  await page.getByRole('textbox').fill('Финишер')
  await button('Назад').click()
  await button('Играть').click()
  await until('countdown')
  await page.mouse.move(480,270)
  await until('playing')
  let steering=null, peakBass=0
  const deadline=Date.now()+60000
  while(Date.now()<deadline) {
    const s=await read()
    if(s.phase==='over') break
    assert.notEqual(s.phase,'impact')
    peakBass=Math.max(peakBass,s.audioResponse?.kick ?? 0)
    const next=s.flight.next?.kind
    if(next==='top'||next==='bottom'||next==='center') {
      const y=next==='top'?2:next==='bottom'?-2:0
      const error=y-s.flight.y
      const key=Math.abs(error)<.28 ? null : error>0 ? 'w' : 's'
      if (steering!==key) {
        if (steering) await page.keyboard.up(steering)
        if (key) await page.keyboard.down(key)
        steering=key
      }
    }
    await page.waitForTimeout(35)
  }
  if (steering) await page.keyboard.up(steering)
  const finished=await read()
  assert.equal(finished.reason,'finished')
  assert.equal(finished.track,customTitle)
  assert.ok(peakBass>.03,'The uploaded bass pulses must drive the flight lighting.')
  assert.ok(Math.abs(finished.duration-samples/rate)<.001,'Flight duration follows the imported recording.')
  assert.equal(finished.seconds,finished.duration)
  assert.equal(finished.audio,finished.duration)
  await page.getByRole('heading',{name:'Трек пройден'}).waitFor()
  await completeDigits()
  assert.equal((await read()).flight.score,finished.flight.score)
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('corridor-rush/runs/1')).length),beforeFinish+1)
  if(folder) await page.screenshot({path:resolve(folder,'finished.png')})
  await button('Ещё раз').click()
  await until('countdown')
  assert.equal((await read()).flight.distance,0)
  await until('playing')
  assert.equal((await read()).track,customTitle)
  await page.keyboard.press('Escape')
  await until('paused')
  await button('Главное меню').click()
  await button('Своя песня').click()
  await songPanel.getByRole('button',{name:'Вернуть встроенную песню',exact:true}).click()
  await songPanel.getByText(bundledTitle,{exact:true}).waitFor()
  assert.equal((await read()).track,bundledTitle)
  await button('Назад').click()
  await button('Как играть').click()
  const preference=page.getByRole('checkbox',{name:'Больше не показывать'})
  assert.equal(await preference.isChecked(),true)
  await preference.uncheck()
  await button('Назад').click()
  await button('К старту').click()
  await page.getByRole('dialog',{name:'Как играть'}).waitFor()
  await button('Назад').click()
  await button('Настройки').click()
  await desktopControl.click()
  await page.reload()
  await button('Настройки').click()
  assert.equal(await desktopControl.getAttribute('aria-checked'),'false')
  await button('Назад').click()
  await button('К старту').click()
  assert.ok(await page.getByText('Ведите мышь вверх или вниз, чтобы попасть в проём.').isVisible())
  await page.mouse.move(480,270)
  await button('Играть').press('Enter')
  await until('playing')
  assert.equal((await read()).flight.y,0)
  await page.mouse.move(480,160)
  await page.waitForFunction(()=>window.corridorStatus().flight.y>1,undefined,{timeout:2000})
  await checkMobileTilt(browser,url,wav)
  assert.deepEqual(errors,[])
  console.log('OK — menu, ranking, W/S and arrow steering, Shift boost, music-driven lights, collision recoil, score, local song selection, restart and song completion.')
} catch (error) {
  if (page) console.error(await page.evaluate(()=>({text:document.body.innerText,diagnostics:window.corridorStatus?.()})).catch(()=>undefined))
  throw error
} finally {
  await browser?.close()
  server.httpServer?.closeIdleConnections()
  await server.close()
}
