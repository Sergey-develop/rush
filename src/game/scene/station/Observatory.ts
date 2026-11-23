import * as THREE from 'three'
import colorUrl from '../../../assets/moon/moon-albedo.jpg?url'
import heightUrl from '../../../assets/moon/moon-height.png?url'

/** The pressure sleeve is open all the way through, from the cabin lip to its outer glazing. */
export function makePortFrame() {
  const loop = (w: number, h: number, cx: number, cy: number, z: number) => [
    [-w+cx,-h,z],[w-cx,-h,z],[w,-h+cy,z],[w,h-cy,z],
    [w-cx,h,z],[-w+cx,h,z],[-w,h-cy,z],[-w,-h+cy,z],
  ]
  const outer = loop(.5,.5,.027,.045,.33)
  const outerLip = loop(.492,.486,.035,.054,.5)
  const opening = loop(.466,.443,.059,.10,.5)
  const shoulder = loop(.457,.427,.061,.104,.35)
  const back = loop(.462,.434,.061,.104,-.5)
  const exterior = loop(.5,.5,.027,.045,-.5)
  const vertices: number[] = [], uvs: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const point of [a,b,c,a,c,d]) {
      vertices.push(...point)
      uvs.push(point[0]+.5,point[1]+.5+point[2]*.11)
    }
  }
  const rings = [exterior,outer,outerLip,opening,shoulder,back,exterior]
  for (let r=1;r<rings.length;r++) for (let i=0;i<8;i++) {
    const j=(i+1)%8, a=rings[r-1], b=rings[r]
    quad(a[i],a[j],b[j],b[i])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  geometry.computeVertexNormals()
  return geometry
}

const vertexShader = /* glsl */ `
varying vec3 surfacePosition;
void main() {
  vec4 surface = modelMatrix * instanceMatrix * vec4(position,1.);
  surfacePosition = surface.xyz;
  gl_Position = projectionMatrix * viewMatrix * surface;
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D lunarColor;
uniform sampler2D lunarHeight;
varying vec3 surfacePosition;
const float tau = 6.28318530718;
const vec2 texel = vec2(1./1440.,1./720.);

// A direction-only sky has zero translational parallax. The Moon is a separate
// finite sphere in station coordinates, shared by every window on the flight.
vec3 stars(vec3 ray) {
  vec3 absolute = abs(ray);
  vec2 projection;
  float face;
  if (absolute.x >= max(absolute.y,absolute.z)) {
    projection = ray.zy / absolute.x;
    face = sign(ray.x);
  } else if (absolute.y >= absolute.z) {
    projection = ray.xz / absolute.y;
    face = 3.*sign(ray.y);
  } else {
    projection = ray.xy / absolute.z;
    face = 5.*sign(ray.z);
  }
  vec2 grid = projection * 91.;
  vec2 cell = floor(grid) + vec2(face*241.,face*29.);
  vec3 seed = fract(vec3(cell.xyx) * vec3(.1031,.1030,.0973));
  seed += dot(seed,seed.yxz+33.33);
  vec3 pick = fract((seed.xxy+seed.yzz)*seed.zyx);
  vec2 offset = (fract(grid)-mix(vec2(.23),vec2(.77),pick.xy));
  vec2 pixelWidth = max(fwidth(grid),vec2(.034));
  // Integrate faint pairs of sub-pixel and first-magnitude stars over the pixel.
  vec2 f = pixelWidth*pixelWidth*.19 + vec2(.0025+.0045*pick.x);
  float glare = exp(-dot(offset*offset,1./f)) * min(1.,.009/sqrt(f.x*f.y));
  float flux = smoothstep(.80,.99,pick.z) * (.15+.85*pow(pick.x,4.))*glare;
  return vec3(.0009,.00145,.0029) + mix(vec3(.76,.84,1.),vec3(1.,.85,.72),pick.y)*flux;
}

vec3 moon(vec3 normal, vec3 ray) {
  // Put the near-side maria towards the corridor. North is the world +Y axis.
  const vec3 front = vec3(.785,0.,.620);
  const vec3 east = vec3(.620,0.,-.785);
  float longitude = atan(dot(normal,east),dot(normal,front));
  float latitude = asin(clamp(normal.y,-1.,1.));
  vec2 uv = vec2(.5+longitude/tau,.5+latitude/(tau*.5));
  vec3 tangent = normalize(cos(longitude)*east - sin(longitude)*front);
  vec3 north = normalize(cross(normal,tangent));
  float gx = texture2D(lunarHeight,uv+vec2(texel.x,0.)).r-texture2D(lunarHeight,uv-vec2(texel.x,0.)).r;
  float gy = texture2D(lunarHeight,uv+vec2(0.,texel.y)).r-texture2D(lunarHeight,uv-vec2(0.,texel.y)).r;
  // LOLA amplitude 22 km, mean radius 1737.4 km. Derivatives are per arc length.
  vec2 slope = vec2(gx/max(.15,cos(latitude)),gy)*((22./1737.4)/(2.*tau/1440.));
  vec3 relief = normalize(normal-1.65*(tangent*slope.x+north*slope.y));
  const vec3 sun = vec3(.126,.664,.737);
  float nl = max(dot(relief,sun),0.);
  float eye = max(dot(normal,-ray),.001);
  float lit = mix(nl,nl/(nl+eye+.015),.52);
  vec3 albedo = texture2D(lunarColor,uv).rgb;
  return albedo*(vec3(.010,.015,.025) + vec3(1.07,1.045,1.)*lit);
}

void main() {
  vec3 rd = normalize(surfacePosition-cameraPosition);
  const vec3 center = vec3(-134.3,24.3,-144.2);
  const float radius = 9.25;
  vec3 toMoon = center-cameraPosition;
  vec3 centerDir = normalize(toMoon);
  vec3 opticalAxis = -vec3(viewMatrix[0].z,viewMatrix[1].z,viewMatrix[2].z);
  float cosBearing = dot(centerDir,opticalAxis);
  vec3 radial = centerDir*cosBearing-opticalAxis;
  // A rectilinear wide lens stretches peripheral discs along their radial axis.
  // Correct that magnification about the projected lunar centre; its bearing,
  // phase, relief and the zero-parallax star layer keep their own geometry.
  float stretch = mix(1.,1./clamp(cosBearing,.44,1.),.95);
  vec3 bodyRay = normalize(rd+radial*dot(rd,radial)/max(.0001,dot(radial,radial))*(stretch-1.));
  float along = dot(toMoon,bodyRay);
  vec3 tangent = toMoon-bodyRay*along;
  float impact = length(tangent);
  float coverage = 1.-smoothstep(radius-fwidth(impact),radius+fwidth(impact),impact);
  vec3 colour = stars(rd);
  if (along>0. && coverage>0.) {
    float chord = sqrt(max(0.,radius*radius-impact*impact));
    vec3 n = normalize(-tangent-chord*bodyRay);
    colour = mix(colour,moon(n,bodyRay),coverage);
  }
  gl_FragColor = vec4(colour,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function makeSpaceView(manager?: THREE.LoadingManager) {
  const loader = new THREE.TextureLoader(manager)
  const load = (url: string) => {
    const map = loader.load(url)
    map.wrapS = THREE.RepeatWrapping
    map.anisotropy = 2
    return map
  }
  const albedo = load(colorUrl), height = load(heightUrl)
  albedo.colorSpace=THREE.SRGBColorSpace
  const material = new THREE.ShaderMaterial({
    vertexShader,fragmentShader,
    uniforms:{lunarColor:{value:albedo},lunarHeight:{value:height}},
    depthWrite:true,depthTest:true,
  })
  return {material,textures:[albedo,height]}
}
