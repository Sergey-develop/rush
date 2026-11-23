import { LoadingManager } from 'three'
import { Music } from './audio/Music'
import type { MusicLight } from './audio/response'
import type { GameFrame, GameSettings, Phase } from './contracts'
import { Input } from './controls/Input'
import { Flight } from './core/Flight'
import { World } from './scene/World'
import { prepareStationSurfaces } from './scene/Station'
import { TURN_WARNING_DISTANCE } from './types'

export class Engine {
  private readonly music = new Music()
  private readonly flight = new Flight({bpm:this.music.bpm,beatmap:this.music.events,seed:0x43525553})
  private world?: World
  private menuPreparation?: Promise<void>
  private menuReady = false
  private readonly input: Input
  private readonly observe = new AbortController()
  private readonly reference = new URLSearchParams(location.search).get('view')==='reference'
  private phase: Phase = 'menu'
  private beforePause: 'playing'|'countdown' = 'playing'
  private pausedAt = 0
  private settings: GameSettings = {quality:'high', volume:.65, muted:false, sensitivity:1, invert:false}
  private timer = 0
  private previous = 0
  private animation = 0
  private lastUI = 0
  private generation = 0
  private disposed = false
  private starting = false
  private resumePending = false
  private lastPulse = 0
  private lastLight?: MusicLight
  private simulationTime = 0
  private impactAge?: number
  private reason: GameFrame['reason'] = null
  private sampleFrames = 0
  private sampleStart = 0
  private fps = 0

  constructor(private readonly canvas:HTMLCanvasElement,private readonly onFrame:(frame: GameFrame)=>void) {
    this.input = new Input(canvas,()=>this.phase==='playing',()=>this.flight.state.y,()=>this.settings,
      ()=>{
        if (this.phase==='paused') { void this.resume();return true }
        if (this.phase==='playing' || this.phase==='countdown') { this.pause();return true }
        return false
      })
    document.addEventListener('visibilitychange',()=>{ if (document.hidden) this.pause() },{signal:this.observe.signal})
    window.addEventListener('blur',()=>this.pause(),{signal:this.observe.signal})
    canvas.addEventListener('contextmenu',event=>{
      if(this.phase==='playing') {event.preventDefault();this.armImpulse()}
    },{signal:this.observe.signal})
    this.publish()
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
      Object.defineProperty(window,'corridorStatus',{configurable:true,value:()=>({
        phase:this.phase, seconds:this.simulationTime, audio:this.music.elapsed, duration:this.music.duration,
        reason:this.reason, impactAge:this.impactAge, fps:this.fps,
        bpm:this.music.bpm, track:this.music.title, beat:this.simulationTime*this.music.bpm/60, audioResponse:this.lastLight,
        flight:{...this.flight.state}, gpu:this.world?.diagnostics() ?? {triangles:0,calls:0}
      })})
    }
  }

  prepareMenu(onProgress: (ratio: number) => void = () => {}) {
    this.menuPreparation ??= this.loadMenu(onProgress).catch(error => {
      this.world?.dispose()
      this.world = undefined
      this.menuPreparation = undefined
      throw error
    })
    return this.menuPreparation
  }

  private async loadMenu(onProgress: (ratio: number) => void) {
    const signal = this.observe.signal
    onProgress(.04)
    const surfaces = await prepareStationSurfaces(ratio => onProgress(.04 + .60 * ratio), signal)
    const manager = new LoadingManager()
    const texturesReady = new Promise<void>(resolve => { manager.onLoad = resolve })
    manager.onProgress = (_, loaded, total) => onProgress(.74 + .16 * loaded / total)
    signal.throwIfAborted()
    const world = new World(this.canvas, surfaces, manager)
    this.world = world
    world.setQuality(this.settings.quality)
    onProgress(.74)
    await texturesReady
    signal.throwIfAborted()
    onProgress(.92)
    await document.fonts.ready
    signal.throwIfAborted()
    world.render(null, this.reference ? 1.25 : this.timer, .21)
    onProgress(.96)
    await world.waitForFirstFrame(signal)
    signal.throwIfAborted()
    this.menuReady = true
    onProgress(1)
    this.animation = requestAnimationFrame(this.tick)
  }

  revealMenu() {
    if (this.phase === 'menu') this.world?.enterMenu()
  }

  private publish() {
    const s=this.flight.state
    this.onFrame({
      phase:this.phase,countdown: Math.max(1,Math.min(3,Math.ceil(-this.simulationTime))),
      score:s.score,combo:s.combo,distance:s.distance,bpm:this.music.bpm,
      charge:s.charge,armed:s.armed,grazes:s.grazes,breaks:s.breaks,
      pulse:this.lastLight ? Math.min(1,.74*this.lastLight.beatFlash+.30*this.lastLight.transient+.18*this.lastLight.highs) : this.lastPulse,
      altitude:s.y,reason:this.reason,speed:s.speed,boostLevel:s.boostLevel,track:this.music.title,
      hint:s.next && s.next.distance <= TURN_WARNING_DISTANCE ? s.next.kind : null,
    })
  }

  async start() {
    if (this.disposed || this.starting || (this.phase!=='menu' && this.phase!=='over')) return
    const token=++this.generation
    this.starting=true
    try {
      await Promise.all([this.music.prepare(), this.menuReady ? undefined : this.prepareMenu()])
      if (!this.world || this.disposed || token!==this.generation) return
      this.flight.reset(this.music.pace)
      this.input.clear()
      this.simulationTime=-3
      this.impactAge=undefined
      this.reason=null
      this.lastPulse=0
      this.lastLight=undefined
      this.world.render(this.flight,0,0)
      this.music.start(3)
      this.phase='countdown'
      this.publish()
      if (document.hidden) this.pause()
    } finally {
      if (token===this.generation) this.starting=false
    }
  }
  pause() {
    if (this.phase!=='playing' && this.phase!=='countdown') return
    this.stepFlight()
    if (this.reason) return
    this.beforePause = this.phase==='countdown'?'countdown':'playing'
    this.pausedAt=this.simulationTime
    this.phase='paused'
    this.input.clear()
    void this.music.suspend()
    this.publish()
  }
  armImpulse() {
    if (this.phase==='playing') { this.flight.armImpulse(); this.publish() }
  }
  async resume() {
    if (this.phase!=='paused' || this.resumePending) return
    const token=this.generation
    this.resumePending=true
    try {
      await this.music.resume()
      if (token!==this.generation || this.disposed) return
      this.phase=this.beforePause
      this.simulationTime=this.pausedAt
      this.publish()
    } finally { this.resumePending=false }
  }
  menu() {
    this.generation++
    this.starting=false
    this.music.stop()
    this.input.clear()
    this.flight.reset()
    this.phase='menu'
    this.simulationTime=0
    this.impactAge=undefined
    this.reason=null
    this.lastPulse=0
    this.lastLight=undefined
    this.revealMenu()
    this.world?.render(null,this.timer,0)
    this.publish()
  }

  setSettings(settings: GameSettings) {
    this.settings={...settings}
    this.music.levels(settings.volume,settings.muted)
    this.world?.setQuality(settings.quality)
  }

  private stepFlight() {
    if (this.phase!=='playing' && this.phase!=='countdown') return
    this.simulationTime=Math.min(this.music.elapsed,this.music.duration)
    if (this.simulationTime<0) { this.lastPulse=0;return }
    if (this.phase==='countdown') this.phase='playing'
    const passed=this.flight.state.passed
    const {grazes,breaks}=this.flight.state
    this.flight.advance(this.simulationTime,this.input.read())
    this.lastLight=this.music.sampleLight(this.simulationTime)
    this.lastPulse=this.lastLight.beatFlash
    if (this.flight.state.dead || this.simulationTime>=this.music.duration) {
      const collision=this.flight.state.dead
      this.reason=collision?'barrier':'finished'
      this.phase=collision?'impact':'over'
      if(collision) {
        this.impactAge=0
        this.music.hit()
      } else this.music.stop()
      this.input.clear()
      this.publish()
    } else if (this.flight.state.breaks>breaks || this.flight.state.grazes>grazes) {
      this.music.fieldContact(this.flight.state.breaks>breaks)
    } else if (this.flight.state.passed>passed) this.music.pass(this.flight.state.combo)
  }

  private tick = (now: number) => {
    if (this.disposed || !this.world) return
    this.animation=requestAnimationFrame(this.tick)
    if (document.hidden) { this.previous=0;return }
    const delta=this.previous?(now-this.previous)/1000:0
    this.previous=now
    if (!this.sampleStart) this.sampleStart=now
    this.sampleFrames++
    if (now-this.sampleStart>1200) {
      this.fps=this.sampleFrames*1000/(now-this.sampleStart)
      this.sampleFrames=0
      this.sampleStart=now
    }
    this.timer+=Math.min(.12,delta)
    // The opaque poster covers the station throughout the menu and its dialogs.
    if (this.phase==='menu' && !this.reference) return
    if (!this.reference) this.world.monitorFrame(delta)
    if(this.impactAge!==undefined) {
      this.impactAge=Math.min(2,this.impactAge+delta)
      if(this.phase==='impact' && this.impactAge>=.68) {
        this.phase='over'
        this.publish()
      }
    }
    this.stepFlight()
    if (this.phase==='menu') {
      const t=this.reference?1.25:this.timer
      this.world.render(null,t,.21+.16*Math.sin(t*2.7))
    } else if ((this.phase!=='paused' && this.phase!=='over') || (this.impactAge!==undefined && this.impactAge<2) || now-this.lastUI>=100) {
      this.world.render(this.flight,Math.max(0,this.simulationTime),this.lastPulse,this.lastLight,this.impactAge,this.phase==='playing')
    }
    if (this.phase!=='menu' && this.phase!=='over' && this.phase!=='paused' && now-this.lastUI>=33) {
      this.lastUI=now
      this.publish()
    } else if (this.phase==='over' || this.phase==='paused') {
      if (now-this.lastUI>=100) this.lastUI=now
    }
  }

  dispose() {
    this.disposed=true
    this.generation++
    cancelAnimationFrame(this.animation)
    this.observe.abort()
    this.input.dispose()
    this.music.dispose()
    this.world?.dispose()
    this.world = undefined
    if (import.meta.env.DEV) Reflect.deleteProperty(window,'corridorStatus')
  }
}
