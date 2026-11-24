import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Flight } from '../core/Flight'
import type { Pickup } from '../types'
import type { StationSurfaces } from './Station'

const graphite = 0x545d62, alloy = 0xccd0c7, ceramic = 0xffead1, copper = 0xc67c43
const plasma = 0xff8539, ice = 0x60e9ff
type Painting = [THREE.BufferGeometry, number]

// The housings and their inset running lights use one draw call apiece.
function paintedMesh(parts: Painting[], material: THREE.Material) {
  const geometry = parts.map(([part, hex]) => {
    const surface = part.index ? part.toNonIndexed() : part
    if (surface !== part) part.dispose()
    const tint = new THREE.Color(hex)
    const colours = new Float32Array(surface.getAttribute('position').count * 3)
    for (let i=0; i<colours.length; i+=3) tint.toArray(colours,i)
    surface.setAttribute('color', new THREE.Float32BufferAttribute(colours,3))
    return surface
  })
  const merged = mergeGeometries(geometry)!
  for (const part of geometry) part.dispose()
  return new THREE.Mesh(merged,material)
}

function casting(outline: number[][], depth: number) {
  const shape = new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)))
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:1})
    .translate(0,0,-depth/2)
}

// The nozzle faces the approaching pilot, along the module's local +Z axis.
function nozzle(x: number, z: number, front: number, rear: number, length: number) {
  return new THREE.CylinderGeometry(front,rear,length,16).rotateX(Math.PI/2).translate(x,0,z)
}

function impulseDrive(metal: THREE.Material, light: THREE.Material, exhaust: THREE.Material) {
  const armour: Painting[] = [], inserts: Painting[] = []
  const wing = [[0,.75],[.13,.61],[.18,.05],[.53,-.23],[.46,-.40],[.08,-.25],[0,-.39],
    [-.08,-.25],[-.46,-.40],[-.53,-.23],[-.18,.05],[-.13,.61]]
  armour.push([casting(wing,.11).rotateX(-Math.PI/2),alloy])
  const canopy = [[0,.70],[.09,.50],[.12,-.18],[0,-.05],[-.12,-.18],[-.09,.50]]
  armour.push([casting(canopy,.075).rotateX(-Math.PI/2).translate(0,.082,0),ceramic])
  const vent = [[-.038,.41],[.038,.41],[.045,.10],[0,.02],[-.045,.10]]
  inserts.push([casting(vent,.015).rotateX(-Math.PI/2).translate(0,.128,0),plasma])

  // The outer rails connect the nose casting to both nozzle housings.
  for (const side of [-1,1]) {
    const x = side*.255
    armour.push([nozzle(x,.045,.148,.09,.55),graphite], [nozzle(x,.25,.162,.141,.19),copper])
    for (const z of [.08,.15,.21]) armour.push([nozzle(x,z,.164,.15,.03),alloy])
    armour.push([nozzle(x,.352,.147,.164,.07),graphite])
    inserts.push([nozzle(x,.392,.121,.121,.012),plasma])
    const rail = [[.10,.52],[.16,.45],[.34,-.08],[.36,-.27],[.27,-.19],[.17,.02]]
    const geometry = casting(rail.map(([u,v])=>[side*u,v]),.083)
    armour.push([geometry.rotateX(-Math.PI/2).translate(0,.09,0),ceramic])
    const stripe = [[.17,.316],[.20,.23],[.31,-.07],[.299,-.092],[.269,-.032]]
    inserts.push([casting(stripe.map(([u,v])=>[side*u,v]),.008).rotateX(-Math.PI/2).translate(0,.145,0),plasma])
  }
  const group = new THREE.Group()
  group.add(paintedMesh(armour,metal),paintedMesh(inserts,light))
  const jets = [-.255,.255].map(x=>new THREE.CylinderGeometry(.118,.012,.93,18,18,true)
    .rotateX(-Math.PI/2).translate(x,0,.85))
  const plume = new THREE.Mesh(mergeGeometries(jets)!,exhaust)
  for (const jet of jets) jet.dispose()
  group.add(plume)
  return group
}

function rimBand(radius: number, width: number, arc: number, z: number, start: number) {
  const shape = new THREE.Shape()
  shape.absarc(0,0,radius,start,start+arc,false)
  shape.absarc(0,0,radius-width,start+arc,start,true)
  shape.closePath()
  return new THREE.ExtrudeGeometry(shape,{depth:.046,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1,curveSegments:32}).translate(0,0,z)
}

// Dual faces of a geodesic sphere give the field curved pentagonal and hexagonal cells.
function fieldShell() {
  const seed = new THREE.IcosahedronGeometry(1,1)
  const data = seed.getAttribute('position')
  const cells = new Map<string,{pole: THREE.Vector3; corners: THREE.Vector3[]}>()
  for (let i=0; i<data.count; i+=3) {
    const face = [0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(data,i+n))
    const center = new THREE.Vector3().add(face[0]).add(face[1]).add(face[2]).normalize()
    for (const vertex of face) {
      const key = vertex.toArray().map(x=>Math.round(x*1e4)).join('/')
      if (!cells.has(key)) cells.set(key,{pole:vertex,corners:[]})
      cells.get(key)!.corners.push(center)
    }
  }
  seed.dispose()
  const positions: number[] = [], edges: number[] = []
  for (const {pole,corners} of cells.values()) {
    const tangent = corners[0].clone().addScaledVector(pole,-pole.dot(corners[0])).normalize()
    const across = new THREE.Vector3().crossVectors(pole,tangent)
    const angle = (v: THREE.Vector3)=>Math.atan2(v.dot(across),v.dot(tangent))
    corners.sort((a,b)=>angle(a)-angle(b))
    for (let i=0; i<corners.length; i++) {
      positions.push(...pole.toArray(),...corners[i].toArray(),...corners[(i+1)%corners.length].toArray())
      edges.push(1,0,0)
    }
  }
  const dome = new THREE.BufferGeometry()
  dome.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  dome.setAttribute('edge',new THREE.Float32BufferAttribute(edges,1))
  return dome
}

function shield(metal: THREE.Material, light: THREE.Material, field: THREE.Material) {
  const group = new THREE.Group()
  const housing: Painting[] = [], strips: Painting[] = []
  for (let i=0; i<3; i++) {
    const start = i*Math.PI*2/3+.1
    housing.push([rimBand(.388,.091,1.68,-.035,start),alloy],
      [rimBand(.353,.051,1.47,.024,start+.105),graphite])
    strips.push([rimBand(.341,.019,1.25,.074,start+.22),ice])
  }
  const yoke = new THREE.Group()
  yoke.rotation.set(.67,-.32,.37)
  yoke.add(paintedMesh(housing,metal),paintedMesh(strips,light))
  const ring = paintedMesh([[new THREE.TorusGeometry(.241,.020,8,40),ceramic]],metal)
  ring.rotation.set(-.82,.48,.18)
  const heart = new THREE.OctahedronGeometry(.146).scale(.84,1.38,.84)
  group.add(yoke,ring,paintedMesh([[heart,ice]],light))
  const shell = new THREE.Mesh(fieldShell(),field)
  shell.scale.setScalar(.55)
  group.add(shell)
  return group
}

const exhaustVertex = `
  varying vec2 plumeUv;
  uniform float time;
  void main() {
    plumeUv = uv;
    float along = 1.0-uv.y;
    vec3 p = position;
    p.y += along*along*.023*sin(13.*along-7.*time);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }`
const exhaustFragment = `
  uniform float time;
  varying vec2 plumeUv;
  void main() {
    float t=1.-plumeUv.y;
    float flow=sin(29.*t-time*12.+.75*sin(plumeUv.x*12.566));
    float streak=pow(.5+.5*cos(plumeUv.x*37.699+time*1.6+t*5.),3.);
    float heat=pow(1.-t,.78);
    float diamonds=pow(.5+.5*flow,3.);
    vec3 c=mix(vec3(1.8,.09,.018),vec3(3.5,1.65,.49),heat*heat);
    gl_FragColor=vec4(c,heat*(.25+.45*diamonds+.15*streak));
  }`
const shellVertex = `
  attribute float edge;
  varying float side;
  varying vec3 point,eye,normalView;
  void main(){
    side=edge;
    point=position;
    vec4 mv=modelViewMatrix*vec4(position,1.);
    normalView=normalMatrix*normalize(position);
    eye=-mv.xyz;
    gl_Position=projectionMatrix*mv;
  }`
const shellFragment = `
  uniform float time;
  varying float side;
  varying vec3 point,eye,normalView;
  void main(){
    float rim=pow(1.-abs(dot(normalize(eye),normalize(normalView))),2.6);
    float cell=1.-smoothstep(.016,.025+fwidth(side)*1.15,side);
    float latitude=dot(normalize(point),normalize(vec3(.26,1.,.17)));
    float scan=pow(.5+.5*cos(latitude*3.8-time*2.7),18.);
    vec3 colour=mix(vec3(.08,.61,1.15),vec3(.46,2.1,2.7),scan);
    gl_FragColor=vec4(colour,.026+.52*rim+cell*(.16+.55*scan)+scan*.14);
  }`

function effect(vertexShader: string, fragmentShader: string) {
  return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{time:{value:0}},
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})
}

export class Pickups {
  private readonly live = new Map<number,THREE.Group>()
  private readonly models: Record<Pickup['kind'],THREE.Group>
  private readonly metal: THREE.MeshStandardMaterial
  private readonly light = new THREE.MeshBasicMaterial({vertexColors:true,color:new THREE.Color(2.1,2.1,2.1)})
  private readonly exhaust = effect(exhaustVertex,exhaustFragment)
  private readonly membrane = effect(shellVertex,shellFragment)
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor(private readonly scene: THREE.Scene, hardware?: StationSurfaces['hardware']) {
    this.metal = new THREE.MeshStandardMaterial({...hardware,vertexColors:true,
      color:new THREE.Color(3.1,3.1,3.1),roughness:.67,metalness:.48,
      normalScale:new THREE.Vector2(.37,.37),emissive:0x252927})
    this.models = {boost:impulseDrive(this.metal,this.light,this.exhaust),shield:shield(this.metal,this.light,this.membrane)}
  }

  get templates() { return Object.values(this.models) }

  update(flight: Flight | null, time: number) {
    const distance = flight?.state.distance ?? Infinity
    const items = flight?.pickups ?? []
    const t = this.reducedMotion.matches ? 0 : time
    this.exhaust.uniforms.time.value = t
    this.membrane.uniforms.time.value = t
    for (const [id, model] of this.live) {
      if (!items.some(item=>item.id===id && item.distance>distance)) {
        this.scene.remove(model)
        this.live.delete(id)
      }
    }
    for (const item of items) {
      if (item.distance<=distance) continue
      let model = this.live.get(item.id)
      if (!model) {
        model=this.models[item.kind].clone()
        this.scene.add(model)
        this.live.set(item.id,model)
      }
      model.position.set(item.x,item.y+.025*Math.sin(t*1.8),item.z)
      if (item.kind==='boost') model.rotation.set(.95,item.yaw+.57+.06*Math.sin(t*1.3),-.15,'YXZ')
      else model.rotation.set(.16,item.yaw+.18,t*.32,'YXZ')
    }
  }

  dispose() {
    for (const model of this.live.values()) this.scene.remove(model)
    this.live.clear()
    for (const model of Object.values(this.models))
      model.traverse(part=>{if (part instanceof THREE.Mesh) part.geometry.dispose()})
    for (const material of [this.metal,this.light,this.membrane,this.exhaust]) material.dispose()
  }
}
