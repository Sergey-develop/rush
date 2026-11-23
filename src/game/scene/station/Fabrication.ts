import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function combine(parts: THREE.BufferGeometry[]) {
  const geometries=parts.map(p=>p.index?p.toNonIndexed():p)
  const result=mergeGeometries(geometries)!
  for(const geometry of new Set([...parts,...geometries])) geometry.dispose()
  return result
}

function solidProfile(outline: number[][], bevel: number) {
  const shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)))
  const thickness=1-2*bevel
  const solid=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:bevel>0,
    bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1})
  solid.center()
  // UVs describe the actual metric proportions of the flat face; side UVs run along each flange.
  const uv=solid.getAttribute('uv')
  for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)+.5,uv.getY(i)+.5)
  return solid
}
export function makeDuct() {
  return solidProfile([[-.39,-.49],[.39,-.49],[.49,-.39],[.49,.39],[.39,.49],[-.39,.49],[-.49,.39],[-.49,-.39]],.008)
}
export function makeBeam() {
  const profile=[[-.5,-.48],[.5,-.48],[.5,-.35],[.085,-.34],[.07,.34],[.5,.35],[.5,.48],[-.5,.48],[-.5,.35],[-.07,.34],[-.085,-.34],[-.5,-.35]]
  return solidProfile(profile,.008).rotateX(-Math.PI/2)
}
export function makeFan() {
  const blade=new THREE.Shape()
  blade.moveTo(.09,-.025)
  blade.quadraticCurveTo(.26,-.17,.45,-.11)
  blade.quadraticCurveTo(.51,-.012,.47,.105)
  blade.quadraticCurveTo(.30,.05,.11,.097)
  blade.closePath()
  const sheets: THREE.BufferGeometry[]=Array.from({length:7},(_,i)=>{
    const sheet=new THREE.ExtrudeGeometry(blade,{depth:.12,bevelEnabled:false,curveSegments:4})
    return sheet.rotateX(.15).rotateZ(i*Math.PI*2/7)
  })
  sheets.push(new THREE.CylinderGeometry(.13,.115,.25,12).rotateX(Math.PI/2))
  return combine(sheets)
}
export function makeGrate() {
  const rails: THREE.BufferGeometry[]=[]
  // Galvanised bearing bars stand above the transverse cross rods and cast real edge silhouettes.
  for(let i=0;i<13;i++) rails.push(new THREE.BoxGeometry(.020,1,.8).translate((i-6)/12,0,0))
  for(let i=0;i<16;i++) rails.push(new THREE.BoxGeometry(1,.018,.31).translate(0,(i-7.5)/15,-.15))
  return combine(rails)
}
