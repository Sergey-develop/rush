import * as THREE from 'three'

export function createRival() {
  const craft=new THREE.Group()
  const hull=new THREE.MeshStandardMaterial({color:0x465170,metalness:.7,roughness:.37})
  const stripe=new THREE.MeshBasicMaterial({color:0x38f5ef})
  const exhaust=new THREE.MeshBasicMaterial({color:new THREE.Color(1.7,3.2,3.5)})
  const shell=new THREE.OctahedronGeometry(1)
  const nozzle=new THREE.CylinderGeometry(.11,.14,.67,8)
  function panel(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,l:number) {
    const mesh=new THREE.Mesh(shell,material)
    mesh.position.set(x,y,z); mesh.scale.set(w,h,l); craft.add(mesh)
    return mesh
  }
  panel(hull,0,0,0,.46,.26,1.05)
  panel(stripe,0,.15,-.09,.23,.13,.51)
  for(const side of [-1,1]) {
    panel(hull,side*.41,-.035,.21,.43,.085,.51).rotation.y=side*.37
    const pod=new THREE.Mesh(nozzle,hull)
    pod.rotation.x=Math.PI/2; pod.position.set(side*.44,.015,.39);craft.add(pod)
    panel(exhaust,side*.44,.015,.77,.10,.10,.24)
    panel(stripe,side*.65,.025,.32,.10,.045,.29)
  }
  const pose={x:0,y:0,z:0,yaw:0,roll:0}
  return {craft,pose,dispose(){shell.dispose();nozzle.dispose();hull.dispose();stripe.dispose();exhaust.dispose()}}
}
