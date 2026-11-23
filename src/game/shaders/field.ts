export const fieldVertex = /* glsl */ `
varying vec2 vField;
void main() {
  vField = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
export const fieldFragment = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uMids;
uniform float uHighs;
uniform float uAttack;
uniform float uMusicEnabled;
uniform vec2 uOpening;
varying vec2 vField;
vec2 hash2(vec2 p) {
  vec2 q = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return fract(sin(q) * 43758.5453);
}
vec3 cells(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float first = 9.0, second = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 b = vec2(float(x),float(y));
      vec2 n = hash2(i+b);
      vec2 r = b + 0.16 + 0.69*n - f;
      float d = dot(r,r);
      if (d < first) { second = first; first = d; id = n.x; }
      else second = min(second,d);
    }
  }
  return vec3(sqrt(second)-sqrt(first), id, sqrt(first));
}
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p)-b+vec2(r);
  return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;
}
void main() {
  vec2 p = vField;
  float t = uTime;
  float dInner = abs(roundedBox(p-vec2(0.0,(uOpening.y+uOpening.x)*0.5),vec2(2.3,(uOpening.y-uOpening.x)*0.5),0.16));
  float outer = min(4.49-abs(p.x), 2.68-abs(p.y));
  outer = min(outer, (6.50-abs(p.x)-abs(p.y)) * 0.7071);
  float d = min(dInner,abs(outer));
  vec2 w = p + .15*vec2(sin(p.y*3.1 + sin(p.x*2.5+t*.16)),sin(p.x*2.6-p.y*.5+t*.16));
  w += .042*vec2(sin(12.0*p.y+p.x*4.0+t),sin(9.3*p.x+9.7*p.y-t*.7));
  w += .013*vec2(sin(21.0*p.y+t*.8),sin(34.0*p.x-t));
  vec3 large = cells(w*vec2(.90,.97)+vec2(.20,.16));
  vec3 small = cells(w*2.33+vec2(6.13,1.52));
  float dis = .48+.52*sin(p.x*1.7+p.y*1.3+large.y*2.1+t*.65);
  float branch = exp(-large.x*88.)*(.14+1.06*dis);
  float fine = exp(-small.x*76.)*(.17+.89*exp(-large.x*9.))*(.32+.65*dis);
  float aura = exp(-large.x*8.0)*.3;
  float arc = (branch+fine)*(.70+.28*sin(t*2.8+p.y*1.8)+.38*uPulse);
  float edge = exp(-d*10.) + .48*exp(-d*2.8);
  float speck = pow(max(0.0,sin(large.y*42.3+t*.8)),18.) * exp(-small.x*48.)*exp(-large.x*23.);
  vec3 violet = mix(vec3(.24,.028,.77),vec3(.52,.035,.89),dis);
  violet = mix(violet,vec3(.21,.085,1.16),uHighs*.70);
  arc *= 1.0+.78*uHighs+.50*uAttack;
  vec3 color = violet*(.54+.29*large.y+aura+edge) + arc*vec3(1.13,.39,1.28)
             + edge*vec3(.51,.14,1.04) + speck*vec3(2.2,1.4,1.7);
  color += uMids*vec3(.24,.022,.21)+edge*uAttack*vec3(.32,.14,.39);
  color *= mix(1.0,.66+.76*uPulse,uMusicEnabled);
  float fringe = mix(.16,1.0,smoothstep(-.17,.035,outer));
  float alpha = clamp((.10 + .06*large.y + arc*.35 + edge*.33 + aura*.20)*fringe, .0,.91);
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
