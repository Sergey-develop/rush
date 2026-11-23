import * as THREE from 'three'

// Trace each floor fragment's specular ray to the physical gate. Brushed steel breaks the
// reflected outline into streaks; the station geometry still provides its depth and occlusion.
export function reflectedField(uniforms: Record<string, THREE.IUniform>) {
  const geom = new THREE.PlaneGeometry(9.3,32)
  geom.rotateX(-Math.PI/2)
  geom.translate(0,-2.933,1)
  const material = new THREE.ShaderMaterial({
    uniforms, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`
      varying vec3 vPoint;
      varying vec3 vEye;
      void main() {
        vPoint=position;
        vec3 eye=cameraPosition-modelMatrix[3].xyz;
        vEye=vec3(dot(eye,modelMatrix[0].xyz),dot(eye,modelMatrix[1].xyz),dot(eye,modelMatrix[2].xyz));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      uniform float uTime; uniform float uPulse; uniform vec2 uOpening;
      varying vec3 vPoint; varying vec3 vEye;
      float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
      float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        vec3 ray=vPoint-vEye;
        ray.y=-ray.y;
        if(abs(ray.z)<.001) discard;
        float t=-vPoint.z/ray.z;
        if(t<0.||t>10.) discard;
        vec2 hit=vPoint.xy+t*ray.xy;
        float scratch=rnd(floor(vec2(vPoint.x*104.,vPoint.z*2.2)));
        hit.y+=.17*sin(vPoint.x*33.+vPoint.z*2.)+.27*(scratch-.5);
        float outside=max(box(hit,vec2(4.9,2.93)),(abs(hit.x)+abs(hit.y)-7.2)*.707);
        float inside=box(hit-vec2(0.,(uOpening.x+uOpening.y)*.5),vec2(2.3,(uOpening.y-uOpening.x)*.5));
        float d=min(abs(outside),abs(inside));
        float wall=(1.-smoothstep(-.2,.6,outside))*smoothstep(-.4,.25,inside);
        float glow=exp(-d*3.5)*.38+exp(-d*14.)*.60;
        float metalPatch=.5+.5*sin(vPoint.x*2.3+sin(vPoint.z*1.6)+.7*sin(vPoint.x*6.5-vPoint.z*.8));
        float steel=(.14+.86*scratch)*(.14+.86*metalPatch*metalPatch);
        float dim=1.-smoothstep(10.,16.,abs(vPoint.z));
        float grate=mix(.38,1.,smoothstep(.9,1.15,abs(vPoint.x)));
        float alpha=clamp((glow+wall*.020)*steel*dim*grate*(.37+uPulse*.10),0.,.38);
        gl_FragColor=vec4(.79,.19,1.32,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new THREE.Mesh(geom,material)
  mesh.renderOrder=1
  return mesh
}
