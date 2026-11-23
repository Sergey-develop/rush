import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleTilt, tiltHeight, stopTilt, tiltState } from '../src/game/controls/tilt'

test('tilt calibrates at the held angle and again after rotating the screen',async()=>{
  const host=Object.assign(new EventTarget(),{DeviceOrientationEvent:{},setTimeout})
  const orientation={angle:0}
  Object.defineProperty(globalThis,'window',{configurable:true,value:host})
  Object.defineProperty(globalThis,'screen',{configurable:true,value:{orientation}})
  const sample=(beta:number,gamma:number)=>host.dispatchEvent(Object.assign(new Event('deviceorientation'),{beta,gamma}))
  try {
    await toggleTilt()
    sample(45,0)
    assert.equal(tiltHeight(1,false),0)
    sample(57,0)
    assert.ok(tiltHeight(1,false)!>0 && tiltHeight(1,true)!<0)
    sample(33,0)
    assert.ok(tiltHeight(1,false)!<0)
    orientation.angle=90
    sample(0,-30)
    assert.equal(tiltHeight(1,false),0)
    sample(0,-45)
    assert.ok(tiltHeight(1,false)!>0)
    await toggleTilt()
    assert.equal(tiltHeight(1,false),undefined)
    Object.assign(host.DeviceOrientationEvent,{requestPermission:async()=>'denied'})
    await toggleTilt()
    assert.equal(tiltState.value,'unavailable')
  } finally { stopTilt(); Reflect.deleteProperty(globalThis,'window'); Reflect.deleteProperty(globalThis,'screen') }
})
