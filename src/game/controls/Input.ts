import { MAX_HEIGHT, type FlightInput } from '../types'
import type { GameSettings } from '../contracts'
import { tiltHeight } from './tilt'

const directionKeys = new Set(['KeyW','ArrowUp','KeyS','ArrowDown'])

export class Input {
  private readonly held = new Set<string>()
  private readonly listeners = new AbortController()
  private drag?: {id:number,y:number,height:number,moved:boolean}
  private target?: number
  private boostPointer?: number
  private touchTilt?: number
  private readonly options: ()=>GameSettings
  constructor(private readonly canvas: HTMLCanvasElement, active:()=>boolean, altitude:()=>number,
    settings:()=>GameSettings, togglePause:()=>boolean) {
    this.options=settings
    const opt = {signal:this.listeners.signal}
    window.addEventListener('keydown',e=>{
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const focus = e.target as HTMLElement|null
      if (focus?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false])')) return
      if (e.code==='Escape' && !e.repeat) {
        if (togglePause()) e.preventDefault()
        return
      }
      if (!active()) return
      const throttle = e.code==='ShiftLeft' || e.code==='ShiftRight'
      if (!throttle && (settings().desktopControl==='mouse' || !directionKeys.has(e.code))) return
      e.preventDefault()
      if (!e.repeat) this.held.add(e.code)
    },opt)
    window.addEventListener('keyup',e=>this.held.delete(e.code),opt)
    window.addEventListener('pointermove',e=>{
      if (e.pointerType!=='mouse') return
      if ((e.buttons & 1)===0) this.boostPointer=undefined
      const options=settings()
      if (!active() || options.desktopControl!=='mouse' || !e.movementY) return
      const sign=options.invert ? -1 : 1
      const dy=e.movementY * 10 * options.sensitivity / Math.max(180,canvas.clientHeight)
      const y=(this.target ?? altitude()) - sign*dy
      this.target=Math.max(-MAX_HEIGHT,Math.min(MAX_HEIGHT,y))
      if (e.clientY<=1) this.target=sign*MAX_HEIGHT
      else if (e.clientY>=canvas.clientHeight-2) this.target=-sign*MAX_HEIGHT
    },opt)
    canvas.addEventListener('pointerdown',e=>{
      if (!e.isPrimary || e.button!==0) return
      if (e.pointerType==='mouse') {
        // Holding the throttle during countdown also works on the first flight frame.
        this.boostPointer=e.pointerId
        if (active()) canvas.setPointerCapture(e.pointerId)
        return
      }
      if (!active()) return
      this.drag={id:e.pointerId,y:e.clientY,height:this.target ?? altitude(),moved:false}
      canvas.setPointerCapture(e.pointerId)
    },opt)
    canvas.addEventListener('pointermove',e=>{
      if (e.pointerId!==this.drag?.id || !active()) return
      const dy=e.clientY-this.drag.y
      this.drag.moved ||= Math.abs(dy)>6
      if (!this.drag.moved) return
      this.target=this.drag.height-dy/Math.max(180,canvas.clientHeight)*10*settings().sensitivity*(settings().invert?-1:1)
    },opt)
    const release = (e: PointerEvent)=>{
      const drag=this.drag
      if (drag && drag.id===e.pointerId) this.touchTilt=tiltHeight(settings().sensitivity,settings().invert)
      if (e.type==='pointerup' && drag?.id===e.pointerId && drag && !drag.moved &&
          Math.abs(e.clientY-drag.y)<=6 && active()) {
        const rect=canvas.getBoundingClientRect()
        this.target=Math.max(-MAX_HEIGHT,Math.min(MAX_HEIGHT,(.5-(e.clientY-rect.top)/rect.height)*2*MAX_HEIGHT))
      }
      if (e.pointerId===this.drag?.id) this.drag=undefined
      if (e.pointerId===this.boostPointer) this.boostPointer=undefined
    }
    window.addEventListener('pointerup',release,opt)
    window.addEventListener('pointercancel',release,opt)
    canvas.addEventListener('lostpointercapture',release,opt)
    window.addEventListener('blur',()=>this.clear(),opt)
  }
  read(): FlightInput {
    const options=this.options()
    const tilt=tiltHeight(options.sensitivity,options.invert)
    const boost=this.held.has('ShiftLeft') || this.held.has('ShiftRight') || this.boostPointer!==undefined
    const up=this.held.has('KeyW') || this.held.has('ArrowUp')
    const down=this.held.has('KeyS') || this.held.has('ArrowDown')
    if (options.desktopControl!=='mouse' && (up || down)) {
      this.target=undefined
      this.touchTilt=tilt
      const vertical=(Number(up)-Number(down))*(options.invert ? -1 : 1)
      return {vertical, verticalSensitivity:options.sensitivity, boost}
    }
    if (!this.drag && tilt!==undefined && (this.touchTilt===undefined || Math.abs(tilt-this.touchTilt)>.18)) {
      this.touchTilt=undefined
      this.target=tilt
    }
    return {vertical:0,targetY:this.target,boost}
  }
  clear() {
    this.held.clear()
    const id=this.boostPointer ?? this.drag?.id
    if (id!==undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    this.boostPointer=undefined
    this.drag=undefined;this.target=undefined;this.touchTilt=undefined
  }
  dispose() { this.clear();this.listeners.abort() }
}
