import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Fields } from './Fields'
import { BoostFlow } from './BoostFlow'
import { Station, type StationSurfaces } from './Station'
import { CorridorAir } from './station/CorridorAir'
import type { Flight } from '../core/Flight'
import { gapBounds, MAX_HEIGHT, MAX_BOOST_SPEED_GAIN, SPEED, START_SPEED, type RenderBarrier, type RenderSegment } from '../types'
import type { MusicLight } from '../audio/response'

const previewSegments: RenderSegment[] = [
  {id:-100,kind:'straight', x:0,z:7,yaw:0,length:18},
  {id:-99,kind:'straight', x:0,z:-11,yaw:0,length:20},
  {id:-98,kind:'right',x:0,z:-31,yaw:0,length:10},
  {id:-97,kind:'straight',x:5,z:-36,yaw:-Math.PI/2,length:21},
]
const previewFields: RenderBarrier[] = [
  {id:-1,kind:'center',x:0,z:-13,yaw:0,distance:13},
]

import { createRival } from './Rival'

export class World {
  private readonly rival=createRival()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(64,1,.065,155)
  private readonly renderer: THREE.WebGLRenderer
  private readonly station: Station
  private readonly fields: Fields
  private readonly boostFlow: BoostFlow
  private boostOptics = 0
  private boostArmed = false
  private boostUpdatedAt = 0
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly spill = new THREE.PointLight(0xd05eff,44,17,2)
  private readonly cockpit = new THREE.PointLight(0xadaaff,22,16,2)
  private readonly emergency = new THREE.PointLight(0xff7038,0,13,2)
  private readonly deckLamp = new THREE.PointLight(0xff8d42,0,7.5,2)
  private readonly air: CorridorAir
  private readonly outputPass = new OutputPass()
  private readonly viewport: ResizeObserver
  private quality: 'high'|'low' = 'high'
  private menu = true
  private width = 0
  private height = 0
  private scale = 1
  private slowFrames = 0
  private lampMode?: 'music'|'steady'
  private readonly lampAnchor = new THREE.Vector3()
  private lampYaw = 0
  private hasWarmFixture=false
  private hasCoolFixture=false
  private hasDeckFixture=false
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly referenceMenu = new URLSearchParams(location.search).get('view') === 'reference'
  private menuEnteredAt?: number

  constructor(private readonly canvas: HTMLCanvasElement, prepared?: StationSurfaces, textureManager?: THREE.LoadingManager) {
    this.renderer = new THREE.WebGLRenderer({canvas,alpha:false,antialias:false,powerPreference:'high-performance'})
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.04
    this.renderer.info.autoReset = false
    this.renderer.shadowMap.enabled=true
    this.renderer.shadowMap.type=THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate=false
    this.emergency.castShadow=true
    this.emergency.shadow.mapSize.set(384,384)
    this.emergency.shadow.camera.near=.18
    this.emergency.shadow.camera.far=13
    this.emergency.shadow.bias=-.00055
    this.emergency.shadow.normalBias=.032
    this.scene.background = new THREE.Color(0x0e151e)
    this.scene.fog = new THREE.FogExp2(0x131c25,.014)
    this.scene.add(this.spill,this.cockpit,this.emergency,this.deckLamp)
    this.scene.add(this.rival.craft)
    this.camera.rotation.order = 'YXZ'
    this.station = new Station(this.scene, prepared, textureManager)
    this.fields = new Fields(this.scene)
    this.boostFlow = new BoostFlow(this.scene)
    const floatTargets=this.renderer.extensions.has('EXT_color_buffer_float')
    const targetType=floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType
    const hdr=new THREE.WebGLRenderTarget(1,1,{type:targetType,
      depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)})
    this.composer = new EffectComposer(this.renderer,hdr)
    this.composer.addPass(new RenderPass(this.scene,this.camera))
    this.air=new CorridorAir(this.camera,[this.emergency,this.cockpit,this.deckLamp,this.spill],targetType)
    this.composer.addPass(this.air)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(480,270),.35,.37,.90)
    this.bloom.enabled=floatTargets
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.outputPass)
    this.viewport = new ResizeObserver(()=>this.resize())
    this.viewport.observe(canvas)
    this.resize()
  }

  private resize() {
    this.width = Math.max(1,this.canvas.clientWidth || window.innerWidth)
    this.height = Math.max(1,this.canvas.clientHeight || window.innerHeight)
    const resolution = Math.min(window.devicePixelRatio || 1,this.quality==='high' ? 1.5 : 1.0)
    const maxPixels = this.quality==='high' ? 2073600 : 730000
    const pixelRatio = Math.min(resolution,Math.sqrt(maxPixels/(this.width*this.height))) * this.scale
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(this.width,this.height,false)
    this.boostFlow.resize(this.width,this.height)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(this.width,this.height)
    this.updateProjection()
  }

  private updateProjection() {
    const aspect = this.width/this.height
    this.camera.aspect = aspect
    this.camera.fov = this.menu ? (aspect < .9 ? 83 : 64) : this.flightFov()
    if (this.menu && aspect > 1.08) {
      this.camera.setViewOffset(this.width,this.height,-this.width*.238,-this.height*.099,this.width,this.height)
    } else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
  }
  private flightFov() {
    const portrait = this.camera.aspect < 1
    return (portrait ? 82 : 69) + this.boostOptics * (portrait ? 8 : 10.5)
  }

  private updateBoost(flight: Flight|null, enabled: boolean) {
    const now = performance.now()
    const dt = Math.min(.12, (now-this.boostUpdatedAt)/1000)
    this.boostUpdatedAt = now
    const state = flight?.state
    const speed = state ? THREE.MathUtils.clamp((state.speed-START_SPEED)/(SPEED+MAX_BOOST_SPEED_GAIN-START_SPEED),0,1) : 0
    if (!state || !enabled || this.reducedMotion.matches) {
      this.boostArmed = false
      this.boostOptics = 0
    } else {
      if (state.boosting) this.boostArmed = true
      const target = this.boostArmed ? state.boostLevel * (.84+.16*speed) : 0
      this.boostOptics = THREE.MathUtils.damp(this.boostOptics,target,16,dt)
      if (this.boostOptics < .001 && !state.boosting) this.boostOptics = 0
    }
    if (flight) {
      const fov = this.flightFov()
      if (Math.abs(fov-this.camera.fov) > .005 || (!this.boostOptics && this.camera.fov!==fov)) {
        this.camera.fov = fov
        this.camera.updateProjectionMatrix()
      }
    }
    this.boostFlow.update(state?.x ?? 0,state?.z ?? 0,state?.yaw ?? 0,state?.distance ?? 0,speed,this.boostOptics)
  }
  setQuality(quality: 'high'|'low') {
    if (this.quality===quality) return
    this.quality = quality
    this.renderer.shadowMap.enabled=quality==='high'
    this.bloom.enabled=quality==='high' && this.renderer.extensions.has('EXT_color_buffer_float')
    this.air.setQuality(quality==='low')
    this.renderer.shadowMap.needsUpdate=true
    this.scale = 1
    this.slowFrames = 0
    this.resize()
  }
  monitorFrame(delta: number) {
    // Drop render resolution only after sustained slow frames; simulation always follows audio time.
    if (delta > .030 && delta < .8) this.slowFrames++
    else if (delta < .023) this.slowFrames = Math.max(0,this.slowFrames-2)
    if (this.slowFrames > 85 && this.scale>.66) {
      this.scale = Math.max(.65,this.scale-.12)
      this.slowFrames = 0
      this.resize()
    }
  }
  private positionLamps(followTurn: boolean) {
    const eye=this.camera.position, yaw=this.camera.rotation.y
    this.hasWarmFixture=this.station.positionPractical(this.emergency.position,eye,yaw,'amber',false,followTurn)
    this.hasCoolFixture=this.station.positionPractical(this.cockpit.position,eye,yaw,'blue',false,followTurn)
    this.hasDeckFixture=this.station.positionPractical(this.deckLamp.position,eye,yaw,'amber',true,followTurn)
    this.renderer.shadowMap.needsUpdate=this.hasWarmFixture
  }
  private recoil(flight: Flight, elapsed: number, field?: RenderBarrier) {
    const t=Math.max(0,elapsed), s=flight.state
    // The contact plane stays fixed. A damped spring expels the eye towards the incoming corridor.
    const spring=Math.exp(-7.1*t)
    const retreat=.18+2.44*(1-spring*Math.cos(10.5*t))
    this.camera.position.x+=Math.sin(s.yaw)*retreat
    this.camera.position.z+=Math.cos(s.yaw)*retreat
    if(this.reducedMotion.matches || !field || t>1.2) return
    const gap=gapBounds(field.kind)
    const normal=s.y<(gap.bottom+gap.top)/2 ? 1 : -1
    const kick=Math.sin(t*15)*spring*normal
    this.camera.position.y=THREE.MathUtils.clamp(s.y+.19*kick,-MAX_HEIGHT,MAX_HEIGHT)
    this.camera.rotation.x+=.105*kick
    this.camera.rotation.z+=.044*Math.sin(19*t)*spring*normal
  }
  /** Start the visible arrival after any offscreen shader and texture warmup. */
  enterMenu() {
    this.menuEnteredAt = undefined
  }

  /** Let the first frame finish on the GPU while the lightweight arrival screen is visible. */
  async waitForFirstFrame(signal: AbortSignal) {
    const gl = this.renderer.getContext()
    if (!(gl instanceof WebGL2RenderingContext)) return
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!fence) return
    gl.flush()
    try {
      while (true) {
        await new Promise<void>(resolve => setTimeout(resolve, 16))
        signal.throwIfAborted()
        if (gl.isContextLost()) throw new Error('При подготовке станции потеряно соединение с графическим устройством.')
        const state = gl.clientWaitSync(fence, 0, 0)
        if (state !== gl.TIMEOUT_EXPIRED) break
      }
    } finally {
      gl.deleteSync(fence)
    }
  }

  private positionMenuCamera(elapsed: number | undefined) {
    this.camera.position.set(.47,-.58,-3.30)
    this.camera.rotation.set(.012,.022,-.021,'YXZ')
    if (elapsed === undefined) return

    // A short dolly settles on the established framing. Its end velocity is zero.
    const u = Math.min(1,elapsed/1.65)
    const approach = 1-u*u*u*(10+u*(-15+6*u))
    const slide = .069*Math.sin(elapsed*.24) + .021*Math.sin(elapsed*.43)
    const depth = .059*Math.sin(elapsed*.29) - .025*Math.sin(elapsed*.17)
    this.camera.position.x += -.16*approach + slide
    this.camera.position.y += -.035*approach + .014*Math.sin(elapsed*.26)
    this.camera.position.z += .46*approach + depth
    // Keep the distant gate centred while the foreground sill moves across the glass.
    this.camera.rotation.y += -.007*approach + slide*.042
    this.camera.rotation.x += .002*approach-.0006*Math.sin(elapsed*.26)
  }

  render(flight: Flight|null,time: number,pulse: number,light?: MusicLight,impactAge?: number,showBoost = false) {
    if (this.menu !== !flight) {
      this.menu = !flight
      if (this.menu) this.enterMenu()
      this.updateProjection()
      this.station.setFlightLighting(!!flight)
      this.lampMode = undefined
      const background = this.scene.background as THREE.Color
      background.setHex(flight ? 0x0c1219 : 0x0e151e)
      this.scene.fog!.color.copy(background)
    }
    this.updateBoost(flight,showBoost && impactAge === undefined)
    let menuTime: number | undefined
    if (!flight) {
      if (this.referenceMenu || this.reducedMotion.matches) {
        time = 1.25
        pulse = .21 + .16*Math.sin(time*2.7)
      } else {
        this.menuEnteredAt ??= time
        menuTime = Math.max(0,time-this.menuEnteredAt)
      }
    }
    const segments = flight?.segments ?? previewSegments
    const barriers = flight?.barriers ?? previewFields
    const spectrum = flight ? light : undefined
    this.station.update(segments,time,pulse,spectrum)
    const warmGain = menuTime === undefined ? 1 : .94 + .14*Math.sin(menuTime*.43)
    const coolGain = menuTime === undefined ? 1 : .93 + .105*Math.sin(menuTime*.35+1.7)
    if (menuTime !== undefined) this.station.setMenuLampLevels(warmGain,coolGain,menuTime)
    this.fields.update(barriers,segments,time+Math.min(.72,Math.max(0,impactAge ?? 0)),pulse,spectrum)
    const {craft,pose}=this.rival
    craft.visible=!!flight && flight.rivalPose(pose)
    if(craft.visible) {
      craft.position.set(pose.x,pose.y,pose.z)
      craft.rotation.set(0,pose.yaw,pose.roll,'YXZ')
    }
    if (flight) {
      const s = flight.state
      // Ease the eye back along the flight axis. The pilot and the obstacle checks
      // stay at the sampled route position even while banking into a corner.
      const pullback = .30 * this.boostOptics
      this.camera.position.set(s.x + Math.sin(s.yaw) * pullback, s.y, s.z + Math.cos(s.yaw) * pullback)
      this.camera.rotation.set(0,s.yaw,s.roll,'YXZ')
      if (impactAge !== undefined) this.recoil(flight,impactAge,barriers.find(b=>Math.abs(b.distance-s.distance)<.03))
    } else {
      this.positionMenuCamera(menuTime)
    }
    const {x,z} = this.camera.position
    const yaw = this.camera.rotation.y
    const next = barriers.find(b=>!flight || b.distance >= flight.state.distance-7)
    this.spill.position.set(next?.x ?? x,-1.18,next?.z ?? z-8)
    this.spill.intensity = next ? 42+pulse*13 : 0
    if (spectrum) {
      const {bass, mids, highs, beatFlash} = spectrum
      const moved=this.lampAnchor.distanceToSquared(this.camera.position)
      const turning=Math.abs(yaw-this.lampYaw)>.24
      if (this.lampMode!=='music' || ((moved>14 || turning) && beatFlash<.12) || moved>64) {
        // These are fixed circuits: amber kick lamps and blue upper percussion.
        // Transfer the small pool as the camera passes the physical mount, between hits.
        this.positionLamps(true)
        this.lampMode='music'
        this.lampAnchor.copy(this.camera.position)
        this.lampYaw=yaw
      }
      const warmFlash=spectrum.warmFlash??beatFlash, coolFlash=spectrum.coolFlash??beatFlash
      this.emergency.color.setRGB(1,.17+.12*bass,.042)
      this.emergency.intensity=this.hasWarmFixture ? warmFlash*(43+32*bass) : 0
      this.cockpit.color.setRGB(.10,.33+.14*highs,1)
      this.cockpit.intensity=this.hasCoolFixture ? coolFlash*(25+23*highs) : 0
      this.deckLamp.intensity=this.hasDeckFixture ? warmFlash*(9+8*bass) : 0
      this.spill.color.setRGB(.48+.22*mids,.11+.045*highs,.91)
      this.spill.intensity=next ? 4.2+1.5*mids+4.8*beatFlash : 0
    } else {
      if(this.lampMode!=='steady') {
        this.positionLamps(false)
        this.lampMode='steady'
      }
      this.emergency.color.setHex(0xff9b55)
      this.emergency.intensity=this.hasWarmFixture ? (flight?6:18*warmGain) : 0
      this.cockpit.color.setHex(0x9bcfff)
      this.cockpit.intensity=this.hasCoolFixture ? (flight?5:13*coolGain) : 0
      this.deckLamp.intensity=this.hasDeckFixture ? (flight?2.5:13*warmGain) : 0
      this.spill.color.setHex(0xd05eff)
      if (flight) this.spill.intensity = next ? 7 : 0
    }
    if(flight && impactAge !== undefined) {
      const contactGlow=Math.exp(-9*Math.max(0,impactAge))
      this.spill.position.y=flight.state.y
      this.spill.intensity+=28*contactGlow
    }
    this.air.setTime(time+(impactAge??0))
    this.renderer.info.reset()
    this.composer.render()
  }
  diagnostics() {
    const info = this.renderer.info
    return {calls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,
      camera:{ x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z,pitch:this.camera.rotation.x,yaw:this.camera.rotation.y,roll:this.camera.rotation.z,fov:this.camera.fov },
      boostOptics: this.boostOptics,
      geometries:info.memory.geometries,pixelRatio:this.renderer.getPixelRatio(),programs:info.programs?.length}
  }
  dispose() {
    this.viewport.disconnect()
    this.station.dispose()
    this.rival.dispose()
    this.fields.dispose()
    this.boostFlow.dispose()
    this.air.dispose()
    this.bloom.dispose()
    this.emergency.shadow.dispose()
    this.outputPass.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
