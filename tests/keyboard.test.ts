import assert from 'node:assert/strict'
import test from 'node:test'
import { Input } from '../src/game/controls/Input'
import { Flight } from '../src/game/core/Flight'
import type { GameSettings } from '../src/game/contracts'

test('keyboard controls the pilot by held direction, independent of mouse movement and key repeat', () => {
  const host = new EventTarget()
  Object.defineProperty(globalThis,'window',{configurable:true,value:host})
  const canvas = Object.assign(new EventTarget(),{
    clientHeight:500, setPointerCapture() {}, hasPointerCapture() { return false },
  })
  const flight = new Flight()
  const settings: GameSettings = {volume:1,quality:'high',muted:false,invert:false,sensitivity:1}
  let active = true
  const input = new Input(canvas as unknown as HTMLCanvasElement,()=>active,()=>flight.state.y,()=>settings,()=>false)
  const key = (type:string,code:string,repeat=false) => {
    const event = Object.assign(new Event(type,{cancelable:true}),{code,repeat})
    host.dispatchEvent(event)
    return event
  }
  try {
    for (const [code,sign] of [['KeyW',1],['ArrowUp',1],['KeyS',-1],['ArrowDown',-1]] as const) {
      flight.reset()
      assert.equal(key('keydown',code).defaultPrevented,true)
      key('keydown',code,true)
      flight.advance(.15,input.read())
      assert.ok(sign * flight.state.y > .4)
      key('keyup',code)
      const height = flight.state.y
      host.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',movementY:200,buttons:0}))
      flight.advance(.30,input.read())
      assert.equal(flight.state.y,height)
    }
    key('keydown','KeyW')
    key('keydown','ArrowUp')
    key('keyup','KeyW')
    assert.equal(input.read().vertical,1)
    key('keydown','KeyS')
    assert.equal(input.read().vertical,0)
    key('keyup','ArrowUp')
    assert.equal(input.read().vertical,-1)
    settings.invert=true
    settings.sensitivity=.5
    flight.reset()
    flight.advance(.1,input.read())
    const slow = flight.state.y
    assert.ok(slow>0)
    settings.sensitivity=1.5
    flight.reset()
    flight.advance(.1,input.read())
    assert.ok(Math.abs(flight.state.y - 3*slow)<1e-9)
    key('keydown','ShiftRight')
    assert.equal(input.read().boost,true)
    canvas.dispatchEvent(Object.assign(new Event('pointerdown'),{isPrimary:true,pointerType:'mouse',pointerId:3,button:0}))
    key('keyup','ShiftRight')
    assert.equal(input.read().boost,true)
    host.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:3}))
    assert.equal(input.read().boost,false)
    key('keydown','ShiftLeft')
    host.dispatchEvent(new Event('blur'))
    assert.equal(input.read().boost,false)
    assert.equal(input.read().vertical,0)
    active=false
    assert.equal(key('keydown','ArrowDown').defaultPrevented,false)
    active=true
    key('keydown','ArrowDown',true)
    assert.equal(input.read().vertical,0)

    // Settings are changed from pause. Engine clears the previous mode's keys and height target.
    input.clear()
    flight.reset()
    settings.desktopControl='mouse'
    settings.invert=false
    settings.sensitivity=.5
    assert.equal(key('keydown','ArrowUp').defaultPrevented,false)
    assert.equal(input.read().vertical,0)
    const move=(dy:number) => host.dispatchEvent(Object.assign(new Event('pointermove'),{
      pointerType:'mouse',movementY:dy,clientY:250,buttons:0,
    }))
    move(-50)
    assert.equal(input.read().targetY,.5)
    flight.advance(.5,input.read())
    assert.equal(flight.state.y,.5)
    settings.sensitivity=1.5
    settings.invert=true
    move(-50)
    assert.equal(input.read().targetY,-1)
    key('keydown','ShiftLeft')
    assert.equal(input.read().boost,true)
    input.clear()
    settings.desktopControl='keyboard'
    move(50)
    assert.equal(input.read().targetY,undefined)
    assert.equal(input.read().boost,false)
    key('keydown','KeyS')
    assert.equal(input.read().vertical,1)
  } finally {
    input.dispose()
    Reflect.deleteProperty(globalThis,'window')
  }
})
