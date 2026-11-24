import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'

const vertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0., 1.);
  }`

// Integrate the illuminated air only up to the nearest visible surface. The
// exterior view writes the depth of its glass, so the Moon stays in vacuum.
const scatter = `
  precision highp sampler3D;
  uniform sampler2D sceneDepth;
  uniform sampler3D airNoise;
  uniform mat4 viewToWorld, inverseProjection;
  uniform vec4 lamps[5];
  uniform vec3 tint[5];
  uniform float drift;
  uniform int steps;
  varying vec2 vUv;
  void main() {
    float depth = texture2D(sceneDepth, vUv).r;
    vec4 point = inverseProjection * vec4(vUv * 2. - 1., depth * 2. - 1., 1.);
    vec3 localRay = point.xyz / point.w;
    float lengthInAir = min(length(localRay), 43.);
    vec3 ray = mat3(viewToWorld) * normalize(localRay);
    vec3 eye = viewToWorld[3].xyz;
    float transmission = 1., previous = 0.;
    vec3 scattered = vec3(0.);
    for (int i = 0; i < 12; i++) {
      if (i >= steps) break;
      float f = float(i + 1) / float(steps);
      float end = lengthInAir * f * (.55 + .45*f);
      float width = end - previous;
      vec3 p = eye + ray * (previous + .5*width);
      previous = end;
      vec3 flow = vec3(drift*.068, -drift*.018, drift*.105);
      float eddies = texture(airNoise, (p+flow)*vec3(.023,.060,.022)).r;
      float detail = texture(airNoise, (p-flow*.55)*vec3(.061,.134,.055)).r;
      float bank = smoothstep(.31,.77,mix(eddies,detail,.27));
      float low = exp(-1.7*(p.y+2.28)*(p.y+2.28));
      float upper = exp(-2.2*(p.y-1.87)*(p.y-1.87));
      float density = (.0018 + bank*(.005 + .060*low + .033*upper))
                      * (1.-smoothstep(2.73,3.12,abs(p.y)));
      float visibility = exp(-density*width);
      vec3 incident = vec3(.037,.049,.063);
      for (int l = 0; l < 5; l++) {
        vec3 toLight = lamps[l].xyz-p;
        float r2 = dot(toLight,toLight);
        float forward = .65+.35*max(0.,dot(ray,toLight*inversesqrt(max(.001,r2))));
        incident += tint[l] * lamps[l].w * forward/(1.+r2*.74);
      }
      scattered += transmission*(1.-visibility)*incident;
      transmission *= visibility;
    }
    gl_FragColor = vec4(scattered,transmission);
  }`

const composite = `
  uniform sampler2D image, sceneDepth, air;
  uniform vec2 grid;
  uniform vec2 clip;
  varying vec2 vUv;
  float distanceAt(vec2 uv) {
    float d = texture2D(sceneDepth,uv).r;
    return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));
  }
  void main() {
    vec2 samplePos = vUv*grid-.5;
    vec2 index = floor(samplePos), f = fract(samplePos);
    float surface = distanceAt(vUv), total = 0.;
    vec4 medium = vec4(0.);
    for(int i=0;i<4;i++) {
      vec2 corner = vec2(float(i%2),float(i/2));
      vec2 uv = (index+corner+.5)/grid;
      vec2 weight = mix(1.-f,f,corner);
      float w = weight.x*weight.y /
        (1.+abs(distanceAt(uv)-surface)*4./max(1.,surface*.12));
      medium += texture2D(air,uv)*w; total += w;
    }
    medium /= max(total,.00001);
    gl_FragColor = vec4(texture2D(image,vUv).rgb*medium.a+medium.rgb,1.);
  }`

function noiseVolume() {
  const side=32, data=new Uint8Array(side**3)
  let seed=54937
  for(let i=0;i<data.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    data[i]=seed>>>24
  }
  const tex=new THREE.Data3DTexture(data,side,side,side)
  tex.format=THREE.RedFormat
  tex.magFilter=tex.minFilter=THREE.LinearFilter
  tex.wrapS=tex.wrapT=tex.wrapR=THREE.RepeatWrapping
  tex.needsUpdate=true
  return tex
}

export class CorridorAir extends Pass {
  private readonly noise=noiseVolume()
  private readonly cloud:THREE.WebGLRenderTarget
  private readonly incident=Array.from({length:5},()=>new THREE.Vector4())
  private readonly colors=Array.from({length:5},()=>new THREE.Color())
  private readonly volumeMaterial:THREE.ShaderMaterial
  private readonly mixMaterial:THREE.ShaderMaterial
  private readonly quad=new FullScreenQuad()
  private low=false

  constructor(camera:THREE.PerspectiveCamera, private readonly lights:readonly THREE.PointLight[], targetType:THREE.TextureDataType) {
    super()
    this.cloud=new THREE.WebGLRenderTarget(1,1,{
      type:targetType,depthBuffer:false,stencilBuffer:false,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    })
    this.volumeMaterial=new THREE.ShaderMaterial({
      vertexShader:vertex,fragmentShader:scatter,depthTest:false,depthWrite:false,
      uniforms:{
        sceneDepth:{value:null},airNoise:{value:this.noise},drift:{value:0},steps:{value:12},
        viewToWorld:{value:camera.matrixWorld},inverseProjection:{value:camera.projectionMatrixInverse},
        lamps:{value:this.incident},tint:{value:this.colors},
      },
    })
    this.mixMaterial=new THREE.ShaderMaterial({
      vertexShader:vertex,fragmentShader:composite,depthTest:false,depthWrite:false,
      uniforms:{image:{value:null},sceneDepth:{value:null},air:{value:this.cloud.texture},
        grid:{value:new THREE.Vector2()},clip:{value:new THREE.Vector2(camera.near,camera.far)}},
    })
  }

  setQuality(low:boolean) {
    this.low=low
    this.volumeMaterial.uniforms.steps.value=low?6:12
  }

  setSize(width:number,height:number) {
    const scale=this.low?.25:.45
    const x=Math.max(1,Math.ceil(width*scale)),y=Math.max(1,Math.ceil(height*scale))
    this.cloud.setSize(x,y)
    this.mixMaterial.uniforms.grid.value.set(x,y)
  }

  setTime(time:number) {
    this.volumeMaterial.uniforms.drift.value=time
  }

  render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget) {
    for(let i=0;i<this.lights.length;i++) {
      const light=this.lights[i], p=light.position
      // Barrier spill has a wider useful radius and a lower scattering intensity.
      this.incident[i].set(p.x,p.y,p.z,light.intensity*(i===3?.038:.20))
      this.colors[i].copy(light.color)
    }
    this.volumeMaterial.uniforms.sceneDepth.value=read.depthTexture
    this.quad.material=this.volumeMaterial
    renderer.setRenderTarget(this.cloud)
    this.quad.render(renderer)
    this.mixMaterial.uniforms.image.value=read.texture
    this.mixMaterial.uniforms.sceneDepth.value=read.depthTexture
    this.quad.material=this.mixMaterial
    renderer.setRenderTarget(this.renderToScreen?null:write)
    this.quad.render(renderer)
  }

  dispose() {
    this.quad.dispose()
    this.cloud.dispose()
    this.noise.dispose()
    this.volumeMaterial.dispose()
    this.mixMaterial.dispose()
  }
}
