import * as THREE from 'three'
import type { Flight } from '../core/Flight'

// The energy is projected onto the cockpit glass. Keep the gate and the flight axis clear.
const fragment = `
  varying vec2 screen;
  uniform float aspect, clock, chargeAge, hitAge, ignitionAge, armed, thrust, still;
  float hash(float n) { return fract(sin(n * 78.233) * 4375.5453); }
  // Signed distance to the nearest edge in a staggered hexagonal grid.
  float cellEdge(vec2 p) {
    vec2 stepSize = vec2(1.73205, 3.);
    vec2 a = mod(p,stepSize)-.5*stepSize;
    vec2 b = mod(p-.5*stepSize,stepSize)-.5*stepSize;
    vec2 q = abs(dot(a,a)<dot(b,b) ? a : b);
    return .866025 - max(q.x, dot(q,vec2(.5,.866025)));
  }
  void main() {
    vec2 p=screen;
    float radius=length(p);
    float rim=smoothstep(.53,1.06,max(abs(p.x),abs(p.y)));
    vec2 glass=p*vec2(aspect,1.)*(1.+.22*radius*radius);
    float edge=cellEdge(glass*8.);
    float lattice=1.-smoothstep(.018,.078,edge);
    float deploy=exp(-chargeAge*2.8);
    float strike=exp(-hitAge*3.4);
    float ignition=exp(-ignitionAge*3.8);
    float front=1.15-chargeAge*1.85;
    float sweep=exp(-12.*abs(radius-front))*deploy;
    float shock=exp(-9.*abs(radius-hitAge*1.85))*strike;
    float shield=rim*(.12*armed + .94*deploy + 1.7*strike);
    float blue=shield*(.13+lattice) + (sweep+shock)*(1.-still)*(.30+1.75*lattice);
    float angle=atan(p.y,p.x);
    float sector=(angle/6.2831853+.5)*96.;
    float id=floor(sector);
    float beam=1.-smoothstep(.025,.15,abs(fract(sector)-.5));
    float speed=.78+.58*hash(id+3.);
    float trail=fract(radius*.9-clock*speed+hash(id));
    float streak=beam*pow(trail,3.)*(.30+hash(id+17.));
    float wake=rim*thrust*(.12+2.45*streak*(1.-still));
    float flare=exp(-8.*abs(radius-(.34+ignitionAge*2.4)))*ignition*(1.-still);
    float gold=wake+ignition*rim*.46+flare*.84;
    vec3 color=vec3(.065,.68,1.25)*blue+vec3(1.55,.51,.10)*gold;
    gl_FragColor=vec4(color,1.);
  }`

export class ModuleEffects {
  private readonly uniforms = {
    aspect: {value:1}, clock: {value:0}, chargeAge: {value:10}, hitAge: {value:10},
    ignitionAge: {value:10}, armed: {value:0}, thrust: {value:0}, still: {value:0},
  }
  private readonly material = new THREE.ShaderMaterial({
    uniforms:this.uniforms, transparent:true, depthTest:false, depthWrite:false,
    blending:THREE.AdditiveBlending,
    vertexShader:`varying vec2 screen;
      void main() { screen=position.xy; gl_Position=vec4(screen,0.,1.); }`,
    fragmentShader:fragment,
  })
  readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material)

  constructor(scene: THREE.Scene) {
    this.mesh.frustumCulled=false
    this.mesh.renderOrder=2000
    this.mesh.visible=false
    scene.add(this.mesh)
  }

  update(flight: Flight | null, time: number, width: number, height: number, reduced: boolean) {
    this.mesh.visible=false
    if (!flight || flight.state.dead) return
    const {shield, boostSeconds, sprinting}=flight.state
    const {shieldArmed,shieldHit,boostIgnited}=flight.effectTimes
    const age=(stamp:number)=>Math.min(10,Math.max(0,time-stamp))
    const charge=age(shieldArmed), hit=age(shieldHit), ignition=age(boostIgnited)
    if (!shield && !boostSeconds && hit>1.5 && ignition>1.5) return
    const u=this.uniforms
    u.armed.value=Number(shield)
    u.chargeAge.value=shield ? charge : 10
    u.hitAge.value=hit
    u.ignitionAge.value=ignition
    u.thrust.value=Math.min(1,boostSeconds*3) * (sprinting ? 1.45 : 1)
    u.clock.value=time
    u.aspect.value=width/height
    u.still.value=Number(reduced)
    this.mesh.visible=true
  }

  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
