import assert from 'node:assert/strict'

export async function checkMobileTilt(browser,url,wav) {
  const context = await browser.newContext({
    isMobile:true, hasTouch:true, viewport:{width:390,height:780}, deviceScaleFactor:1,
  })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    const tilt = beta => cdp.send('DeviceOrientation.setDeviceOrientationOverride',{alpha:0,beta,gamma:0})
    const button = name => page.getByRole('button',{name,exact:true})
    const state = async () => {
      const {result} = await cdp.send('Runtime.evaluate',{
        expression:"(getEventListeners(window).deviceorientation || []).length",includeCommandLineAPI:true,
      })
      return result.value
    }
    const coarse = async () => {
      await button('К старту').waitFor()
      assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),true)
    }
    await page.route(/\.(mp3|wav|ogg|flac|m4a)(\?|$)/i,route=>route.request().resourceType()==='fetch'
      ? route.fulfill({body:wav,contentType:'audio/wav'}) : route.continue())
    // Model both mobile APIs explicitly. Recent Chromium versions expose requestPermission too.
    await page.addInitScript(()=>{
      window.motionRequests=[]
      Object.defineProperty(DeviceOrientationEvent,'requestPermission',{
        configurable:true, value:sessionStorage.getItem('qa:motionPermission') ? async()=>{
          window.motionRequests.push(navigator.userActivation.isActive)
          return window.motionRequests.length===1 ? 'denied' : 'granted'
        } : undefined,
      })
    })
    await tilt(40)
    await page.goto(url+'?qa=1')
    await coarse()
    assert.equal(await state(),1,'A fresh touch profile starts listening before its first tap.')
    await tilt(41)
    await button('К старту').tap()
    const enabled = button('Наклон · вкл.')
    assert.equal(await enabled.getAttribute('aria-pressed'),'true')
    await page.getByText(/Поднимите верхний край/).waitFor()
    await button('Играть').tap()
    await page.waitForFunction(()=>window.corridorStatus?.().phase==='countdown')
    await tilt(60)
    await page.waitForFunction(()=>window.corridorStatus().flight.y>.65,undefined,{timeout:8000})
    await tilt(18)
    await page.waitForFunction(()=>window.corridorStatus().flight.y<-.4,undefined,{timeout:3000})

    await page.reload()
    await coarse()
    await button('Настройки').tap()
    await enabled.tap()
    await button('Наклон · выкл.').waitFor()
    assert.equal(await state(),0)
    await page.reload()
    await coarse()
    assert.equal(await state(),0,'A disabled tilt preference survives reload.')
    await button('Настройки').tap()
    const disabled = button('Наклон · выкл.')
    assert.equal(await disabled.getAttribute('aria-pressed'),'false')
    await disabled.tap()
    await tilt(42)
    await page.getByText(/Поднимите верхний край/).waitFor()
    assert.equal(await state(),1)

    // Chromium has no native iOS permission sheet; exercise its gesture API contract.
    await page.evaluate(()=>sessionStorage.setItem('qa:motionPermission','1'))
    await page.reload()
    await coarse()
    assert.deepEqual(await page.evaluate(()=>window.motionRequests),[])
    await button('К старту').tap()
    await page.getByText(/Нет данных датчика/).waitFor()
    assert.deepEqual(await page.evaluate(()=>window.motionRequests),[true])
    assert.equal(await state(),0)
    await button('Повторить подключение').tap()
    await tilt(43)
    await page.getByText(/Поднимите верхний край/).waitFor()
    assert.deepEqual(await page.evaluate(()=>window.motionRequests),[true,true])
    assert.equal(await state(),1)
    console.log('OK — mobile tilt moves the pilot, persists disable and retries a denied sensor grant.')
  } finally {
    await context.close()
  }
}
