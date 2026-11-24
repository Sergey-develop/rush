import * as THREE from 'three'
import type { RenderSegment } from '../types'
import type { MusicLight } from '../audio/response'
import { makeHardware, makeReflection, makeSector, makeSkin } from './station/SurfaceMaps'
import type { Finish, Shape, Skin } from './station/parts'
import { freightCase, serviceDeck } from './station/ServiceDeck'
import { makeBeam, makeDuct, makeFan, makeGrate } from './station/Fabrication'
import { makePortFrame, makeSpaceView } from './station/Observatory'
import { wallEquipment } from './station/WallEquipment'

export type LampLevels = Required<Pick<MusicLight,'kick' | 'snare' | 'hat' | 'tone'>>

/** Convert the measured sound amplitude to linear light power before HDR tone mapping. */
function lampDrive(envelope: number) {
  return 1.12 * envelope * envelope
}

const halfPi = Math.PI / 2
type Lamp = 'amber' | 'blue'
type Buffers = Map<string, number[]>
const skinTypes = ['armour','deck','ceiling','grille','trim','paint','hazard'] as const

export interface StationSurfaces {
  hardware: ReturnType<typeof makeHardware>
  skins: ReadonlyMap<Skin, ReturnType<typeof makeSkin>>
}

export async function prepareStationSurfaces(onProgress: (ratio: number) => void, signal: AbortSignal): Promise<StationSurfaces> {
  const nextTask = async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    signal.throwIfAborted()
  }
  await nextTask()
  const hardware = makeHardware()
  const skins = new Map<Skin, ReturnType<typeof makeSkin>>()
  const total = 1 + skinTypes.length
  onProgress(1 / total)
  for (const skin of skinTypes) {
    await nextTask()
    skins.set(skin, makeSkin(skin))
    onProgress((1 + skins.size) / total)
  }
  return { hardware, skins }
}

/** A cast faceplate with clipped corners, a bevel and its own planar trim UVs. */
function castPlate(cornerX=.041,cornerY=.041) {
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const a=.5-cornerX,b=.5-cornerY
  const outline=[[-a,-.5],[a,-.5],[.5,-b],[.5,b],[a,.5],[-a,.5],[-.5,b],[-.5,-b]]
  const back = outline.map(([x, y]) => point(x, y, -.5))
  const lip = outline.map(([x, y]) => point(x, y, .24))
  const face = outline.map(([x, y]) => point(x * .975, y * .98, .5))
  const pos: number[] = [], uv: number[] = []
  function vertex(p: THREE.Vector3) {
    pos.push(p.x, p.y, p.z)
    uv.push(p.x + .5, p.y + .5)
  }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8
    for (const p of [back[i], back[j], lip[j], back[i], lip[j], lip[i],
      lip[i], lip[j], face[j], lip[i], face[j], face[i]]) vertex(p)
    if (i > 0 && i < 7) for (const p of [face[0], face[i], face[j]]) vertex(p)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}

/** Compiles a segment into world-space transforms only when that segment enters the active set. */
class ModuleWriter {
  readonly buffers: Buffers = new Map()
  private readonly origin = new THREE.Matrix4()
  private readonly wall = new THREE.Matrix4()
  private readonly element = new THREE.Matrix4()
  private readonly rotation = new THREE.Euler()
  private current = this.origin
  private circuit = 0

  constructor(private readonly segment: RenderSegment) {
    this.origin.makeRotationY(segment.yaw).setPosition(segment.x, 0, segment.z)
  }

  private part(shape: Shape, material: Finish, x: number, y: number, z: number,
    width: number, height: number, depth: number, rx = 0, ry = 0, rz = 0, circuit = this.circuit) {
    const key = material === 'amber' || material === 'blue'
      ? shape + '/' + material + '/' + circuit : shape + '/' + material
    let stream = this.buffers.get(key)
    if (!stream) {
      stream = []
      this.buffers.set(key, stream)
    }
    this.rotation.set(rx, ry, rz)
    this.element.makeRotationFromEuler(this.rotation)
    const m = this.element.elements
    for (let k = 0; k < 3; k++) {
      m[k] *= width
      m[k + 4] *= height
      m[k + 8] *= depth
    }
    this.element.setPosition(x, y, z).premultiply(this.current)
    for (let k = 0; k < 16; k++) stream.push(m[k])
  }

  private wallBay(x:number,z:number,yaw:number,width:number,index:number,side:number,variant:number,serviceMark=false) {
    this.wall.makeRotationY(yaw).setPosition(x,0,z).premultiply(this.origin)
    this.current=this.wall
    const p=this.part.bind(this)
    if (variant!==4 || side===0 || width<2.1) {
      p('block','carbon',0,0,-.16,width+.024,6.13,.30)
      p('plate',variant===3||variant===4?'paint':'armour',0,-.04,-.015,width-.025,5.86,.14)
    }

    // The pressure hull reaches the slab through folded shoulders and a removable kick sill.
    p('plate','ceiling',0,2.55,.22,width-.015,1.22,.14,.72)
    p('plate','trim',0,-2.70,.19,width-.014,.91,.16,-.69)
    const upright=(side===1?-1:1)*(width/2-.14)
    const heavy=variant===6||variant===0
    const girder=heavy?.38:.21
    p('beam','steel',upright,-.07,.18,girder,4.04,heavy?.49:.28)
    p('plate','paint',upright,-1.74,.394,girder+.14,.49,.13)
    p('beam','steel',upright,2.32,.45,girder,1.39,heavy?.47:.31,.69)
    p('beam','steel',upright,-2.38,.46,girder+.05,1.30,heavy?.51:.34,-.72)
    p('duct','carbon',upright,-2.83,.64,girder+.27,.30,.69)
    if(side===0) {
      // The blocking bulkhead sits beyond the navigable elbow; arrows remain in front of it.
      p('plate','armour',0,.05,.13,width*.93,3.20,.19)
      p('plate','trim',0,-.65,.24,width*.72,.30,.10)
      p('plate','hazard',width*.19,1.21,.24,width*.25,.20,.07)
    } else if (serviceMark) {
      // Print directly on a closed access panel one bay beyond the observation sleeve.
      // The 2 mm ink layer follows the wall. There is no sign housing or projecting mount.
      const labelW=Math.min(2.68,width*.58)
      const labelX=-width*.5+labelW*.5+Math.min(.53,width*.11)
      p('block','paint',labelX,-.10,.105,labelW+.19,2.50,.105)
      p('block','sector',labelX,-.10,.159,labelW,2.35,.002)
      for(const dx of [-1,1]) for(const dy of [-1,1]) {
        p('tube','steel',labelX+dx*(labelW*.5+.04),-.10+dy*1.20,.169,.048,.015,.048,halfPi)
      }
      const lampX=width*.32
      p('plate','carbon',lampX,.40,.146,.30,.67,.17)
      p('tube','beacon',lampX,.40,.276,.15,.37,.15)
      for(const dy of [-.19,.19]) p('tube','steel',lampX,.40+dy,.276,.205,.066,.205)
    } else {
      const nearWindow=side===-1 && variant===4 && this.segment.yaw===0 && Math.abs(this.segment.x)<.1
        && this.segment.z+z> -11.2 && this.segment.z+z< -4.6
      wallEquipment(p,index,variant,side,width,nearWindow)
    }
    this.current=this.origin
  }

  compile() {
    const s=this.segment
    const bays=Math.max(1,Math.round(s.length/5.8))
    const depth=s.length/bays
    const duties=[0,4,1,6,3,5,2]
    for(let i=0;i<bays;i++) {
      const index=Math.abs(Math.round((s.x*.61-s.z)/5.8)+i)
      const z=-(i+.5)*depth
      this.circuit=index%3
      let variant=duties[(Math.abs(s.id*3)+i)%duties.length]!
      if(s.yaw===0 && Math.abs(s.x)<.1) {
        const worldZ=s.z+z
        if(worldZ< -4.6 && worldZ> -11.2) variant=4
        if(worldZ< -11.2 && worldZ> -18.2) variant=1
      }
      const signDistance=s.yaw===0 && Math.abs(s.x)<.01 ? s.z+14.1 : -1
      const labelAt=signDistance>=0 && signDistance<s.length ? signDistance
        : s.id>=0 && s.id%17===8 && s.length>8 ? s.length*.61 : -1
      const serviceMark=s.kind==='straight' && labelAt>=i*depth && labelAt<(i+1)*depth && variant!==4
      serviceDeck(this.part.bind(this),z,depth,index,variant,s.kind==='left')
      if(s.kind!=='left') this.wallBay(-5,z,halfPi,depth,index,-1,variant,serviceMark)
      if(s.kind!=='right') this.wallBay(5,z,-halfPi,depth,index+3,1,(variant+3+(index%2))%7)
    }
    if(s.kind!=='straight') {
      for(let i=0;i<2;i++) this.wallBay(-2.5+i*5,-s.length,0,5,i+2,0,6)
    } else {
      const crateAt=s.yaw===0 && Math.abs(s.x)<.01 ? s.z+10.97 : -1
      if(crateAt>=0 && crateAt<s.length) freightCase(this.part.bind(this),-3.62,-crateAt)
      else if(s.id>=0 && s.id%17===8 && s.length>8) freightCase(this.part.bind(this),-3.62,-s.length*.61)
    }
    return this.buffers
  }
}

type CachedModule = { layout: RenderSegment; buffers: Buffers }

function sameLayout(a: RenderSegment | undefined, b: RenderSegment) {
  return a && a.x === b.x && a.z === b.z && a.yaw === b.yaw && a.kind === b.kind && a.length === b.length
}

/** Shared materials and one instanced draw per geometry/material pair across all active bays. */
export class Station {
  private readonly root = new THREE.Group()
  private readonly meshes = new Map<string, THREE.InstancedMesh>()
  private readonly shapes: Record<Shape, THREE.BufferGeometry> = {
    block:new THREE.BoxGeometry(),plate:castPlate(),port:makePortFrame(),tube:new THREE.CylinderGeometry(.5,.5,1,12),
    beam:makeBeam(),fan:makeFan(),duct:makeDuct(),grate:makeGrate(),
    ring:new THREE.TorusGeometry(.434,.066,6,24).scale(1,1,7.55),
    cable: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,0,-.5), new THREE.Vector3(0,-.035,-.35),
      new THREE.Vector3(.045,-.13,.035), new THREE.Vector3(.02,-.065,.35), new THREE.Vector3(0,0,.5),
    ]), 7, .046, 6, false),
  }
  private readonly materials: Record<Finish, THREE.Material>
  private readonly textures: THREE.Texture[] = []
  private readonly environment = makeReflection()
  private readonly oldEnvironment: THREE.Texture | null
  private readonly modules = new Map<number, CachedModule>()
  private readonly lampBanks: Record<Lamp, THREE.MeshBasicMaterial[]>
  // Linear drives are also used by the local light pools and fog.
  readonly drives: LampLevels = {kick:0, snare:0, hat:0, tone:0}
  private readonly fill = new THREE.HemisphereLight(0xcad6d8,0x79736b)
  private readonly warmKey = new THREE.DirectionalLight(0xf8c398)
  private readonly coolKey = new THREE.DirectionalLight(0xb0c9d7)
  private readonly oldEnvironmentGain: number

  constructor(private readonly scene: THREE.Scene, prepared?: StationSurfaces, textureManager?: THREE.LoadingManager) {
    this.oldEnvironment = scene.environment
    this.oldEnvironmentGain = scene.environmentIntensity
    if (!scene.environment) scene.environment = this.environment
    const hardware = prepared?.hardware ?? makeHardware()
    this.textures.push(...new Set(Object.values(hardware)))
    const makeMetal = (color: number, roughness: number, metalness: number) =>
      new THREE.MeshStandardMaterial({
        ...hardware, color, roughness, metalness, envMapIntensity: .83,
        normalScale: new THREE.Vector2(.64, .64),
      })
    const skins = {} as Record<Skin, THREE.MeshStandardMaterial>
    for (const skin of skinTypes) {
      const maps = prepared?.skins.get(skin) ?? makeSkin(skin)
      this.textures.push(...new Set(Object.values(maps)))
      const mat = new THREE.MeshStandardMaterial({
        ...maps,color:skin==='hazard'?0xd5d1c9:(skin==='ceiling'||skin==='paint'?0xa3a4a1:0xbcbdbb),metalness:1,roughness:1,
        emissive:0xffffff,emissiveIntensity:.16,envMapIntensity:.86,
        normalScale:new THREE.Vector2(.77,.77),
      })
      skins[skin] = mat
    }
    const sign = makeSector('03'), space = makeSpaceView(textureManager)
    this.textures.push(sign, ...space.textures)
    const luminous = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) })
    this.materials = {
      ...skins,
      steel:makeMetal(0xe2e1db,.95,.96),carbon:makeMetal(0x878984,1,.60),
      rubber:new THREE.MeshStandardMaterial({color:0x252626,roughness:.87,metalness:.035}),
      chrome:makeMetal(0xffffff,.70,1),bronze:makeMetal(0xecbb87,.90,.93),
      blue: luminous(.30, 1.09, 3.7), amber: luminous(3.9, 1.23, .30),
      beacon: luminous(3.9, 1.23, .30), sill: luminous(3.9, 1.23, .30),
      sector:new THREE.MeshStandardMaterial({map:sign,emissiveMap:sign,emissive:0xded7c6,emissiveIntensity:.24,roughness:.68,metalness:.29}),
      space: space.material,
    }
    const amber = this.materials.amber as THREE.MeshBasicMaterial
    const blue = this.materials.blue as THREE.MeshBasicMaterial
    this.lampBanks = { amber: [amber, amber.clone(), amber.clone()], blue: [blue, blue.clone(), blue.clone()] }
    this.warmKey.position.set(-3, 4, 6)
    this.coolKey.position.set(4, -2, -3)
    this.root.add(this.fill, this.warmKey, this.coolKey)
    this.setFlightLighting(false)
    scene.add(this.root)
  }

  setFlightLighting(flight: boolean) {
    // Maintain a steady minimum exposure for navigation. Only the actual fixtures flash.
    this.fill.intensity = flight ? .22 : .40
    this.warmKey.intensity = flight ? .27 : .52
    this.coolKey.intensity = flight ? .21 : .34
    this.scene.environmentIntensity = flight ? .39 : .66
    for (const finish of ['armour','deck','ceiling','grille','trim','paint','hazard'] as const) {
      const metal = this.materials[finish] as THREE.MeshStandardMaterial
      metal.emissiveIntensity = flight ? .08 : .20
    }
  }

  /** Position a small pool just inside the chosen bank's real diffuser. */
  positionPractical(target: THREE.Vector3, eye: THREE.Vector3, yaw: number, lamp: Lamp | 'sill' | 'beacon', lowMount=false, followTurn=false) {
    const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw)
    const near = lowMount ? 4 : lamp === 'amber' ? 7 : 11
    const preferredSide = lamp === 'amber' ? -3.9 : 3.9
    let best = Infinity
    for (const module of this.modules.values()) for (const [key,fixtures] of module.buffers) {
      if (key.split('/')[1] !== lamp) continue
      for (let i = 12; i < fixtures.length; i += 16) {
        const x = fixtures[i], y = fixtures[i + 1], z = fixtures[i + 2]
        if(lowMount && y> -1.65) continue
        const dx = x - eye.x, dz = z - eye.z
        const ahead = dx * sideZ - dz * sideX, side = dx * sideX + dz * sideZ
        if (ahead < (followTurn ? -3 : .35) || ahead > 40 || Math.abs(side) > (followTurn ? 11 : 5.1)) continue
        const offAxis=Math.max(0,Math.abs(side)-5.1)+Math.max(0,.35-ahead)
        const cost = Math.abs(ahead - near) + .40 * Math.abs(side - preferredSide) + .08 * Math.abs(y) + 2.5*offAxis
          + (!lowMount && y< -1.65 ? 5 : 0)
        if (cost >= best) continue
        best = cost
        // Anchor the bulb inside its mounting bay. Camera yaw selects a fixture but
        // must not slide the same bulb (and invalidate its six shadow faces) while banking.
        const mountX=Math.cos(module.layout.yaw), mountZ=-Math.sin(module.layout.yaw)
        const wallOffset=(x-module.layout.x)*mountX+(z-module.layout.z)*mountZ
        target.set(x - mountX*wallOffset*.085, y*.86, z - mountZ*wallOffset*.085)
      }
    }
    return Number.isFinite(best)
  }

  setMenuLampLevels(warm: number, cool: number, elapsed: number) {
    // Each pair of service circuits changes gradually along the wall.
    for (let bank=0;bank<3;bank++) {
      const drift = .046*Math.sin(elapsed*.52+bank*2.09)
      this.lampBanks.amber[bank].color.multiplyScalar(warm+drift)
      this.lampBanks.blue[bank].color.multiplyScalar(cool-drift)
    }
  }

  update(segments: readonly RenderSegment[], time: number, pulse: number, light?: MusicLight) {
    const {drives} = this
    drives.kick = lampDrive(light?.kick ?? light?.warmFlash ?? light?.beatFlash ?? 0)
    drives.snare = lampDrive(light?.snare ?? 0)
    drives.hat = lampDrive(light?.hat ?? light?.coolFlash ?? light?.highs ?? 0)
    drives.tone = lampDrive(light?.tone ?? light?.mids ?? 0)
    const sill = this.materials.sill as THREE.MeshBasicMaterial
    const beacon = this.materials.beacon as THREE.MeshBasicMaterial
    if (light) {
      sill.color.setRGB(3.25,1.82,.57).multiplyScalar(.012 + 1.7*drives.tone)
      beacon.color.setRGB(4.5,1.9,1.45).multiplyScalar(.010 + 2.1*drives.snare)
    } else {
      sill.color.setRGB(3.26,.98,.216)
      beacon.color.setRGB(3.26,.98,.216)
    }
    for (let bank=0;bank<3;bank++) {
      const warmWeight = bank===1 ? .72 : 1
      const kick = light ? .012 + 2.8*drives.kick*warmWeight : .90
      const hat = bank===0 ? drives.hat : Math.max(0,(drives.hat-.09)/.91)
      this.lampBanks.amber[bank].color.setRGB(3.62,light ? .64 : 1.09+Math.sin(time*1.65)*.018,.14)
        .multiplyScalar(kick)
      this.lampBanks.blue[bank].color.setRGB(.29,1.46+(light ? drives.hat : pulse)*.25,3.7)
        .multiplyScalar(light ? .012+2.1*hat : .90)
    }
    if (segments.length === this.modules.size && segments.every(s => sameLayout(this.modules.get(s.id)?.layout, s))) return
    const active = new Set<number>()
    const totals = new Map<string, number>()
    for (const s of segments) {
      active.add(s.id)
      if (!sameLayout(this.modules.get(s.id)?.layout, s)) {
        this.modules.set(s.id, { layout: { ...s }, buffers: new ModuleWriter(s).compile() })
      }
      for (const [key, stream] of this.modules.get(s.id)!.buffers) totals.set(key, (totals.get(key) ?? 0) + stream.length / 16)
    }
    for (const id of this.modules.keys()) if (!active.has(id)) this.modules.delete(id)
    for (const mesh of this.meshes.values()) mesh.count = 0
    for (const [key, count] of totals) {
      let mesh = this.meshes.get(key)
      if (!mesh || mesh.instanceMatrix.count < count) {
        if (mesh) {
          this.root.remove(mesh)
          mesh.dispose()
        }
        const [shape, finish, bank] = key.split('/') as [Shape, Finish, string?]
        const capacity = 2 ** Math.ceil(Math.log2(Math.max(32, count * 1.25)))
        const material = bank === undefined ? this.materials[finish] : this.lampBanks[finish as Lamp][Number(bank)]
        mesh = new THREE.InstancedMesh(this.shapes[shape], material, capacity)
        mesh.receiveShadow=finish!=='amber' && finish!=='blue' && finish!=='sill' && finish!=='beacon' && finish!=='space'
        // The major housings and ribs provide the lamp shadows. Fine grilles and wiring
        // still receive them without being drawn six more times for a point-light cube.
        mesh.castShadow=mesh.receiveShadow && (shape==='duct'||shape==='beam'||shape==='plate'||shape==='port'||shape==='block')
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.frustumCulled = false
        mesh.name = 'Station ' + key
        mesh.count = 0
        this.meshes.set(key, mesh)
        this.root.add(mesh)
      }
    }
    for (const { buffers } of this.modules.values()) for (const [key, stream] of buffers) {
      const mesh = this.meshes.get(key)!
      mesh.instanceMatrix.array.set(stream, mesh.count * 16)
      mesh.count += stream.length / 16
    }
    for (const mesh of this.meshes.values()) {
      mesh.visible = mesh.count > 0
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16)
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose() {
    this.scene.remove(this.root)
    if (this.scene.environment === this.environment) this.scene.environment = this.oldEnvironment
    this.scene.environmentIntensity = this.oldEnvironmentGain
    for (const mesh of this.meshes.values()) mesh.dispose()
    for (const geometry of Object.values(this.shapes)) geometry.dispose()
    for (const mat of Object.values(this.materials)) mat.dispose()
    for (const lamps of Object.values(this.lampBanks)) for (const mat of lamps.slice(1)) mat.dispose()
    for (const tex of this.textures) tex.dispose()
    this.environment.dispose()
    this.meshes.clear()
    this.modules.clear()
  }
}
