import * as THREE from 'three'
import { GAP_WIDTH, gapBounds } from '../types'
import type { RenderBarrier, RenderSegment } from '../types'
import { fieldFragment, fieldVertex } from '../shaders/field'
import { reflectedField } from '../shaders/reflection'
import type { LampLevels } from './Station'
import { makeTurnSignal } from './TurnSignal'

type Kind = RenderBarrier['kind']
type Point = [number, number]
const outline: Point[] = [[-4.90,-2.26],[-4.24,-2.92],[4.24,-2.92],[4.90,-2.26],[4.90,2.26],[4.24,2.92],[-4.24,2.92],[-4.90,2.26]]
const litFrame: Point[] = [[-4.49,-1.99],[-3.84,-2.68],[3.84,-2.68],[4.49,-1.99],[4.49,1.99],[3.84,2.68],[-3.84,2.68],[-4.49,1.99]]

function bevelRect(x: number, low: number, high: number): Point[] {
  const c = 0.16
  return [[-x+c,low],[x-c,low],[x,low+c],[x,high-c],[x-c,high],[-x+c,high],[-x,high-c],[-x,low+c]]
}
function pathOf(points: Point[]) { return points.map(([x,y]) => new THREE.Vector2(x,y)) }

// Build flat ribbons with a joined miter, so the aperture outline keeps its width at every resolution.
function ribbon(points: Point[], width: number, closed = true) {
  const vertices: number[] = [], indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const [x,y] = points[i]!
    const prev = points[i ? i-1 : closed ? points.length-1 : i]!
    const next = points[i+1 < points.length ? i+1 : closed ? 0 : i]!
    const a = new THREE.Vector2(x-prev[0],y-prev[1]).normalize()
    const b = new THREE.Vector2(next[0]-x,next[1]-y).normalize()
    if (!a.lengthSq()) a.copy(b)
    if (!b.lengthSq()) b.copy(a)
    const m = new THREE.Vector2(-a.y-b.y,a.x+b.x).normalize()
    const scale = width/(2*Math.max(.32,m.dot(new THREE.Vector2(-b.y,b.x))))
    vertices.push(x+m.x*scale,y+m.y*scale,.012,x-m.x*scale,y-m.y*scale,.012)
    if (closed || i < points.length-1) {
      const j = ((i+1)%points.length)*2
      indices.push(i*2, i*2+1, j, j, i*2+1, j+1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
  geo.setIndex(indices)
  return geo
}

function buildField(kind: Kind) {
  const group = new THREE.Group()
  const {bottom,top} = gapBounds(kind)
  const half = GAP_WIDTH / 2
  const inner = bevelRect(half,bottom,top)
  let rim = outline, holeRim = inner, closed = true
  if (kind === 'top') {
    holeRim = [[half,2.92],[half,bottom+.16],[half-.16,bottom],[-half+.16,bottom],[-half,bottom+.16],[-half,2.92]]
    rim = [...outline.slice(0,6),...holeRim,...outline.slice(6)]
    closed = false
  } else if (kind === 'bottom') {
    holeRim = [[-half,-2.92],[-half,top-.16],[-half+.16,top],[half-.16,top],[half,top-.16],[half,-2.92]]
    rim = [...outline.slice(0,2),...holeRim,...outline.slice(2)]
    closed = false
  }
  const profile = new THREE.Shape(pathOf(rim))
  if (kind === 'center') profile.holes.push(new THREE.Path(pathOf(inner)))
  const surface = new THREE.ShaderMaterial({
    uniforms: {uTime:{value:0},uPulse:{value:0},uMids:{value:0},uHighs:{value:0},uAttack:{value:0},uMusicEnabled:{value:0},uOpening:{value:new THREE.Vector2(bottom,top)}},
    vertexShader: fieldVertex, fragmentShader: fieldFragment, transparent:true, depthWrite:false, side:THREE.DoubleSide,
    forceSinglePass:true
  })
  const face = new THREE.Mesh(new THREE.ShapeGeometry(profile),surface)
  face.renderOrder = 2
  group.add(face)
  group.add(reflectedField(surface.uniforms))
  let frame = litFrame
  if (kind==='top') frame = [...litFrame.slice(0,6),...holeRim.map(([x,y]):Point=>[x,Math.min(y,2.68)]),...litFrame.slice(6)]
  if (kind==='bottom') frame = [...litFrame.slice(0,2),...holeRim.map(([x,y]):Point=>[x,Math.max(y,-2.68)]),...litFrame.slice(2)]
  const rims: {material:THREE.MeshBasicMaterial,base:THREE.Color}[]=[]
  for (const [width,color,opacity] of [[.125,0xa93cff,.18],[.050,0xb371ff,.74],[.020,0xffeaff,1]] as const) {
    const mat = new THREE.MeshBasicMaterial({color, opacity,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,forceSinglePass:true})
    rims.push({material:mat,base:mat.color.clone()})
    const contour = new THREE.Mesh(ribbon(frame,width),mat)
    contour.renderOrder = 4
    group.add(contour)
    if (closed) {
      const lip = new THREE.Mesh(ribbon(holeRim,width*1.20),mat)
      lip.renderOrder = 4
      group.add(lip)
    }
  }
  let randState = 9083
  const rand = () => { randState = (Math.imul(randState,1664525)+1013904223) >>> 0; return randState/4294967296 }
  const coords: number[] = []
  for (let i=0;i<200;i++) {
    const x=(rand()-.5)*9.15, y=(rand()-.5)*5.48
    if (Math.abs(x) < half && y > bottom && y < top) continue
    coords.push(x,y,rand()*.36+.03)
  }
  const points = new THREE.BufferGeometry()
  points.setAttribute('position', new THREE.Float32BufferAttribute(coords,3))
  const motes = new THREE.ShaderMaterial({
    uniforms:surface.uniforms,
    vertexShader:`uniform float uTime; uniform float uPulse; varying float vAlpha;
      void main(){vec3 p=position; float seed=position.x*31.+position.y*43.; p.y+=.06*sin(seed+uTime*1.8);p.x+=.04*cos(uTime+seed);vAlpha=.22+.78*pow(.5+.5*sin(seed+uTime*2.7),3.);
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((18.+vAlpha*11.+uPulse*3.)/max(.1,-mv.z),1.,5.);}`,
    fragmentShader:`varying float vAlpha; void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.,.66,.99,(1.-smoothstep(.0,1.,d))*vAlpha);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  })
  const dust = new THREE.Points(points,motes)
  dust.renderOrder = 3
  group.add(dust)
  return {group,surface,rims}
}

export class Fields {
  private layer = new THREE.Group()
  private proto = {top:buildField('top'),center:buildField('center'),bottom:buildField('bottom')}
  private arrows = {left:makeTurnSignal('left'),right:makeTurnSignal('right')}
  private pool = new Map<string,THREE.Group[]>()
  private used = new Map<string,number>()
  constructor(scene: THREE.Scene) { scene.add(this.layer) }
  get templates() {
    return [...Object.values(this.proto).map(source=>source.group), ...Object.values(this.arrows)]
  }

  private place(key: string, proto: THREE.Group, x: number, z: number, yaw: number) {
    const index = this.used.get(key) ?? 0
    this.used.set(key,index+1)
    let slots = this.pool.get(key)
    if (!slots) { slots=[]; this.pool.set(key,slots) }
    if (!slots[index]) { slots[index]=proto.clone();this.layer.add(slots[index]) }
    const group = slots[index]!
    group.visible = true
    group.position.set(x,0,z)
    group.rotation.y = yaw
  }
  update(barriers: readonly RenderBarrier[], segments: readonly RenderSegment[], time: number,pulse: number,light?:LampLevels) {
    this.used.clear()
    const attack = light ? Math.max(light.kick,light.snare,light.hat) : 0
    for (const source of Object.values(this.proto)) {
      source.surface.uniforms.uTime!.value = time
      source.surface.uniforms.uPulse!.value = light ? attack : pulse
      source.surface.uniforms.uMusicEnabled!.value = light ? 1 : 0
      source.surface.uniforms.uMids!.value = light?.tone ?? 0
      source.surface.uniforms.uHighs!.value = light?.hat ?? 0
      source.surface.uniforms.uAttack!.value = attack
      for(const {material,base} of source.rims) {
        material.color.copy(base)
        if (light) {
          material.color.r *= .80+.67*light.tone
          material.color.g *= .75+1.35*light.hat
          material.color.b *= .82+.70*light.hat
          material.color.multiplyScalar(.42+1.47*attack)
        }
      }
    }
    for (const b of barriers) this.place(b.kind,this.proto[b.kind].group,b.x,b.z,b.yaw)
    for (const segment of segments) {
      if (segment.kind==='straight') continue
      const signDistance = segment.length - .68
      this.place(segment.kind,this.arrows[segment.kind],segment.x-Math.sin(segment.yaw)*signDistance,segment.z-Math.cos(segment.yaw)*signDistance,segment.yaw)
    }
    for (const [key,slots] of this.pool) for (let i=this.used.get(key)??0;i<slots.length;i++) slots[i]!.visible=false
  }
  dispose() {
    this.layer.removeFromParent()
    const materials = new Set<THREE.Material>()
    const geometry = new Set<THREE.BufferGeometry>()
    for (const root of [...Object.values(this.proto).map(p=>p.group),...Object.values(this.arrows)]) {
      root.traverse(child=>{
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          geometry.add(child.geometry)
          for (const mat of Array.isArray(child.material)?child.material:[child.material]) materials.add(mat)
        }
      })
    }
    for (const mat of materials) mat.dispose()
    for (const geo of geometry) geo.dispose()
  }
}
