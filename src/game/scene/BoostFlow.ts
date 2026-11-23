import * as THREE from 'three'

// Each ribbon is a short pair of points in the corridor air, extruded across its
// projected direction. The station depth buffer naturally occludes them at turns.
const vertex = `
  attribute vec3 origin;
  attribute vec3 grain;
  uniform float travel, speed, strength;
  uniform vec2 viewport;
  varying vec2 strip;
  varying vec3 clipSpace;
  varying vec3 tint;
  varying float opacity;
  void main() {
    float z = .6 + mod(origin.z - travel, 12.);
    float streakLength = mix(.24, 1.1, grain.x) * mix(.60, 1.32, speed) * (.55 + .45 * strength);
    vec4 head = projectionMatrix * modelViewMatrix * vec4(origin.xy, -z, 1.);
    vec4 tail = projectionMatrix * modelViewMatrix * vec4(origin.xy, -z-streakLength, 1.);
    vec2 direction = (head.xy / head.w - tail.xy / tail.w) * viewport;
    vec2 side = vec2(-direction.y, direction.x) / max(.001, length(direction));
    vec4 clip = mix(head, tail, position.y);
    float halfWidth = mix(.42, 1.06, grain.y) * clamp(viewport.y / 690., .78, 1.65);
    clip.xy += side * (2. * halfWidth / viewport) * position.x * clip.w;
    gl_Position = clip;
    clipSpace = clip.xyw;
    strip = position.xy;
    tint = mix(vec3(.43,.69,1.), vec3(.78,.73,.95), grain.y);
    if (grain.z > .77) tint = vec3(1.,.56,.30);
    float depthFade = smoothstep(.62,1.45,z) * (1.-smoothstep(9.,12.6,z));
    opacity = strength * mix(.39,.84,grain.y) * depthFade;
  }`;

const fragment = `
  varying vec2 strip;
  varying vec3 clipSpace;
  varying vec3 tint;
  varying float opacity;
  void main() {
    vec2 screen = clipSpace.xy / clipSpace.z;
    float rim = smoothstep(.48, .85, max(abs(screen.x), abs(screen.y)*.90));
    float upperCorners = smoothstep(.65,.93,screen.y) * smoothstep(.43,.68,abs(screen.x));
    float feather = 1.-smoothstep(.25,1.,abs(strip.x));
    float taper = smoothstep(0.,.06,strip.y) * (1.-smoothstep(.19,1.,strip.y));
    float alpha = opacity * rim * (1.-upperCorners) * feather * taper;
    if (alpha < .012) discard;
    gl_FragColor = vec4(tint,alpha);
  }`;

function makeRibbons() {
  const shape = [], origins = [], grains = []
  const corners = [[-1,0],[1,0],[-1,1],[-1,1],[1,0],[1,1]]
  let seed = 9382745
  const random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 120; i++) {
    const sign = i % 2 === 0 ? 1 : -1
    const horizontal = i % 5 < 3
    const x = horizontal ? sign*(2.5+1.6*random()) : (random()-.5)*7
    const y = horizontal ? (random()-.5)*4.7 : sign*(1.55+1.07*random())
    const z = random()*12, size = random(), brightness = random(), colour = random()
    for (const corner of corners) {
      shape.push(corner[0]!,corner[1]!,0)
      origins.push(x,y,z)
      grains.push(size,brightness,colour)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(shape,3))
  geometry.setAttribute('origin',new THREE.Float32BufferAttribute(origins,3))
  geometry.setAttribute('grain',new THREE.Float32BufferAttribute(grains,3))
  return geometry
}

export class BoostFlow {
  private readonly uniforms = {
    travel: { value: 0 }, strength: { value: 0 }, speed: { value: 0 },
    viewport: { value: new THREE.Vector2(1,1) },
  }
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms,
    transparent:true, depthTest:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    blending:THREE.AdditiveBlending,
  })
  private readonly mesh = new THREE.Mesh(makeRibbons(),this.material)
  private warmup = true

  constructor(scene: THREE.Scene) {
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }
  resize(width: number,height: number) { this.uniforms.viewport.value.set(width,height) }
  update(x:number,z:number,yaw:number,distance:number,speed:number,strength:number) {
    this.mesh.visible = this.warmup || strength > .015
    this.warmup = false
    this.uniforms.strength.value = strength
    if (!this.mesh.visible) return
    this.mesh.position.set(x,0,z)
    this.mesh.rotation.y = yaw
    this.uniforms.travel.value = distance % 12
    this.uniforms.speed.value = speed
  }
  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
