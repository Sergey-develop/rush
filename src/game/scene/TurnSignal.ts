import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TURN_WARNING_DISTANCE, type TurnKind } from '../types'

type Point = [number, number]
const spacing = .91
const glyph: Point[] = [[-.39,-.65],[-.12,-.65],[.40,0],[-.12,.65],[-.39,.65],[.128,0]]
const reach = TURN_WARNING_DISTANCE + 7

function stamped(points: Point[], depth: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)))
  return new THREE.ExtrudeGeometry(shape,{
    depth, bevelEnabled:true, bevelSize:bevel, bevelThickness:bevel, bevelSegments:2, steps:1,
  })
}

function joined(parts: THREE.BufferGeometry[]) {
  const triangles=parts.map(part=>part.index ? part.toNonIndexed() : part)
  const unit=mergeGeometries(triangles)!
  for(const part of new Set([...parts,...triangles])) part.dispose()
  return unit
}

// Compute the complete sign's range at its mount. Beam pools reuse materials and
// geometries, while modelMatrix supplies the per-instance location to the GPU.
const approach = `
  float rangeToSign=distance(cameraPosition,modelMatrix[3].xyz);
  float approach=1.-smoothstep(8.,${reach.toFixed(3)},rangeToSign);
`

function diffuser() {
  const material=new THREE.MeshStandardMaterial({
    color:0x736180,roughness:.29,metalness:.23,emissive:0x170a21,
  })
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>
attribute float signalOrder;
varying float vApproach;
varying float vFront;`)
      .replace('#include <project_vertex>',`#include <project_vertex>
${approach}
vApproach=smoothstep(signalOrder*.085, .85+signalOrder*.065, approach);
vFront=clamp(normal.z,0.,1.);`)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
varying float vApproach;
varying float vFront;`)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
vec3 diode=mix(vec3(.47,.061,.98),vec3(2.25,.65,3.65),vFront);
totalEmissiveRadiance+=diode*(.013+.987*vApproach);`)
  }
  return material
}

/** Soft reflected light on the recessed mounting plate, including on basic render quality. */
function glowOnPlate(sign: number) {
  const geometry=new THREE.PlaneGeometry(3.56,1.64)
  geometry.translate(0,0,.104)
  const material=new THREE.ShaderMaterial({
    uniforms:{direction:{value:sign}},
    vertexShader:`
varying vec2 vLocal;
varying float vApproach;
void main(){
  ${approach}
  vLocal=position.xy;
  vApproach=approach;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`,
    fragmentShader:`
uniform float direction;
varying vec2 vLocal;
varying float vApproach;
float arm(vec2 p,vec2 a,vec2 b){
  vec2 d=b-a;
  return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));
}
void main(){
  vec2 p=vec2(vLocal.x*direction,abs(vLocal.y));
  float lit=0.;
  for(int i=0;i<3;i++){
    float rank=float(i);
    vec2 local=p-vec2((rank-1.)*${spacing.toFixed(2)},0.);
    float d=arm(local,vec2(.255,0.),vec2(-.25,.64));
    float lamp=smoothstep(rank*.085,.85+rank*.065,vApproach);
    lit+=exp(-d*d*17.)*lamp;
  }
  float edge=(1.-smoothstep(.67,.82,abs(vLocal.y)))*(1.-smoothstep(1.51,1.78,abs(vLocal.x)));
  gl_FragColor=vec4(.38,.075,.67,lit*edge*.42);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
  })
  const pool=new THREE.Mesh(geometry,material)
  pool.renderOrder=1
  return pool
}

export function makeTurnSignal(direction:TurnKind) {
  const group=new THREE.Group()
  group.name='Turn signal '+direction
  const sign=direction==='right'?1:-1
  const outline:Point[]=[[-1.70,-.82],[1.56,-.82],[1.77,-.65],[1.77,.61],[1.61,.82],[-1.54,.82],[-1.77,.61],[-1.77,-.64]]
  const seat=stamped(outline,.075,.023)
  const base=new THREE.Mesh(seat,new THREE.MeshStandardMaterial({color:0x393743,roughness:.53,metalness:.77}))
  base.name='Cast mounting plate'
  const frames:THREE.BufferGeometry[]=[]
  const faces:THREE.BufferGeometry[]=[]
  for(let i=0;i<3;i++) {
    const glyphX=(i-1)*spacing*sign
    const profile=glyph.map(([x,y]):Point=>[sign*x,y])
    const frame=stamped(profile,.109,.036).translate(glyphX,0,.12)
    frames.push(frame)
    const light=stamped(profile,.050,.016).scale(.88,.91,1).translate(glyphX,0,.265)
    const order=new Float32Array(light.getAttribute('position').count).fill(i)
    light.setAttribute('signalOrder',new THREE.BufferAttribute(order,1))
    faces.push(light)
  }
  // Bolt heads and lips share one metallic draw call. The inset leaves a visible
  // bevel and sidewall when a pilot approaches from either end of the turning bay.
  for(const x of [-1.58,1.58]) for(const y of [-.64,.64]) {
    frames.push(new THREE.CylinderGeometry(.056,.058,.041,6).rotateX(Math.PI/2).translate(x,y,.115))
  }
  const bezels=new THREE.Mesh(joined(frames),new THREE.MeshStandardMaterial({
    color:0xaaa0ab,roughness:.32,metalness:.88,
  }))
  bezels.name='Bevels and captive bolts'
  const lamps=new THREE.Mesh(joined(faces),diffuser())
  lamps.name='Recessed purple diffusers'
  group.add(base,bezels,lamps,glowOnPlate(sign))
  return group
}
