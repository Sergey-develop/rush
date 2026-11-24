import type { Finish, Part } from './parts'

const halfPi=Math.PI/2

function deckPlate(p:Part,material:Finish,left:number,right:number,y:number,z:number,length:number) {
  p('plate',material,(left+right)/2,y,z,right-left-.028,length-.035,.078,-halfPi)
}

function deck(p:Part,z:number,length:number,bay:number,variant:number) {
  p('block','carbon',0,-3.165,z,10.08,.15,length+.014)
  const trenchCenter=variant===1?.36:.04
  const trenchWidth=variant===6?1.72:2.04
  const left=trenchCenter-trenchWidth/2, right=trenchCenter+trenchWidth/2
  p('block','steel',left-.043,-3.002,z,.085,.095,length)
  p('block','steel',right+.043,-3.002,z,.085,.095,length)
  const trays=length>3.9?3:2
  const span=length/trays
  for(let t=0;t<trays;t++) {
    const at=z-length/2+span*(t+.5)
    const removable=(variant===0||variant===3||variant===4) && t===(bay%trays)
    if(removable) {
      deckPlate(p,'deck',left+.025,right-.025,-3.004,at,span)
      for(const sx of [left+.24,right-.24]) p('plate','rubber',sx,-2.958,at+.16,.15,.36,.019,-halfPi)
    } else {
      p('grate','steel',trenchCenter,-2.996,at,trenchWidth-.07,span-.055,.09,-halfPi)
      p('block','carbon',trenchCenter,-3.094,at,trenchWidth,.03,span)
      p('tube','bronze',trenchCenter-.31,-3.061,at,.038,span,.038,halfPi)
    }
    p('block','trim',trenchCenter,-3.002,at-span/2,trenchWidth,.084,.052)
  }
  const split=(bay%2?.39:.62)*length
  deckPlate(p,'deck',-5,left-.09,-3,z-length/2+split/2,split)
  deckPlate(p,variant===5?'paint':'deck',-5,left-.09,-3,z+split/2,length-split)
  deckPlate(p,'deck',right+.09,3.90,-3,z,length)
  deckPlate(p,'trim',3.90,5,-3,z,length)
  if(variant===6 || variant===3) {
    const at=z+length*.17
    p('plate','rubber',-2.89,-2.954,at,1.30,1.11,.018,-halfPi)
    p('plate','trim',-2.89,-2.937,at,1.23,1.02,.018,-halfPi)
    for(const x of [-3.24,-2.54]) p('plate','steel',x,-2.921,at,.18,.34,.012,-halfPi)
  }
}

function lamp(p:Part,x:number,z:number,length:number,warm:boolean) {
  const span=Math.min(1.35,length*.47)
  p('duct','steel',x,2.81,z,.46,.29,span+.18)
  p('plate','rubber',x,2.648,z,.38,span,.045,halfPi)
  if (warm) {
    p('block','amber',x,2.613,z,.23,.035,span*.85)
  } else {
    // A quiet tick lights the centre lens. Hard metallic attacks reach the end cells.
    for (let cell=0;cell<3;cell++)
      p('block','blue',x,2.613,z+(cell-1)*span*.283,.23,.035,span*.275,0,0,0,Math.abs(cell-1))
  }
  for(const at of [-.31,0,.31]) p('block','steel',x,2.58,z+at*span,.34,.036,.034)
}

function roofSheet(p:Part,finish:Finish,x0:number,x1:number,z0:number,z1:number,y=3.002) {
  p('plate',finish,(x0+x1)/2,y,(z0+z1)/2,x1-x0-.034,z1-z0-.042,.082,halfPi)
}

function roofPanels(p:Part,z:number,length:number,index:number,variant:number) {
  const near=z-length/2, far=z+length/2
  const split=near+length*(index%2 ? .37 : .65)
  const ductSeam=near+length*(variant%2 ? .58 : .29)
  roofSheet(p,'ceiling',-4.52,-1.64,near,ductSeam)
  roofSheet(p,'trim',-4.52,-1.64,ductSeam,far,3.019)
  roofSheet(p,'ceiling',1.02,2.51,near,far,3.021)
  roofSheet(p,'paint',2.51,4.53,near,split,3.017)
  roofSheet(p,'ceiling',2.51,4.53,split,far)

  const inspect=length>2.3 && (variant===0 || variant===2 || variant===4 || variant===6)
  if(!inspect) {
    roofSheet(p,'paint',-1.64,1.02,near,split)
    roofSheet(p,'armour',-1.64,1.02,split,far,3.017)
    // Two quarter-turn locks sit at the removable panel's free edge.
    for(const x of [-1.37,.75]) p('tube','chrome',x,2.958,split-.13,.085,.019,.085)
    return
  }

  // Cut the inspection aperture out of the sheet set. Its back is the pressure
  // shell: the cable sleeves and clamps lie above the lip, inside a real reveal.
  const center=variant===4?.11:-.49
  const left=center-.74, right=center+.74
  const a=near+length*(index%2 ? .19 : .34)
  const b=a+Math.min(length*.43,2.28)
  roofSheet(p,'armour',-1.64,1.02,near,a)
  roofSheet(p,'paint',-1.64,1.02,b,far)
  roofSheet(p,'ceiling',-1.64,left,a,b)
  roofSheet(p,'trim',right,1.02,a,b)
  const mid=(a+b)/2, span=b-a
  p('block','rubber',center,3.057,mid,1.49,.022,span+.014)
  for(const x of [left,right]) {
    p('block','steel',x,2.999,mid,.071,.105,span)
    for(const mount of [a+.11,b-.11]) p('tube','chrome',x,2.939,mount,.061,.027,.061)
  }
  for(const [dx,r,skin] of [[-.43,.095,'rubber'],[-.28,.075,'bronze'],[.31,.105,'steel']] as const) {
    p('tube',skin,center+dx,3.018,mid,r,span,r,halfPi)
  }
  for(const mount of [a+span*.24,a+span*.72]) {
    p('block','trim',center,2.967,mount,1.48,.054,.095)
    p('block','steel',center-.35,2.935,mount,.38,.039,.144)
  }
}

function overhead(p:Part,z:number,length:number,index:number,variant:number,leftExit:boolean) {
  p('block','carbon',0,3.16,z,10.08,.18,length+.014)
  roofPanels(p,z,length,index,variant)
  if(variant===1 || variant===2 || variant===6) {
    // Spun HVAC trunk, with pressed end collars and a bolted access lid.
    const trunkY=leftExit?3.005:2.65
    p('duct','paint',-2.76,trunkY,z,1.12,.67,length+.01)
    for(const line of [-.36,.37]) p('duct','steel',-2.76,trunkY,z+length*line,1.18,.72,.075)
    p('plate','trim',-2.68,trunkY-.353,z+.18,.66,Math.min(length*.46,1.28),.046,halfPi)
  } else {
    const pipeY=leftExit?2.83:2.70
    for(const [x,r] of [[-3.02,.31],[-2.50,.21]]) {
      p('tube','bronze',x,pipeY,z,r,length+.014,r,halfPi)
      p('tube','steel',x,pipeY,z-length*.24,r*1.18,.14,r*1.18,halfPi)
    }
  }
  if(variant===1||variant===3||variant===5) {
    for(let i=0;i<4;i++) p('cable',i===0?'bronze':'rubber',1.64+.135*i,2.81,z,.9,1.14,length)
    p('beam','steel',1.85,2.66,z+length*.33,.13,.95,.11,0,0,halfPi)
  } else if(variant===2||variant===0) {
    p('plate','rubber',1.30,2.934,z,.98,length*.69,.15,halfPi)
    for(let i=0;i<9;i++) p('plate','steel',1.30,2.849,z+((i-4)/9)*length*.63,.96,.082,.08,halfPi+.22)
  } else {
    p('duct','trim',2.08,2.82,z,.46,.30,length)
    p('duct','steel',2.08,2.82,z+length*.32,.53,.35,.10)
  }
  const structural=variant===6 || index%3===0
  if(structural) {
    const at=z+length/2-.20
    p('beam','steel',0,2.84,at,.34,8.46,.32,0,0,halfPi)
    for(const side of leftExit?[1]:[-1,1]) p('beam','paint',side*4.35,2.39,at,.38,1.34,.35,0,0,side*.77)
  }
  if(variant===0||variant===1||variant===4||variant===6) {
    lamp(p,!leftExit && index%3===0?-1.79:2.83,z-length*.21,length,index%3!==1)
  }
  if(variant===4 && !leftExit && index%3!==0) {
    lamp(p,-2.06,z-length*.25,length*.64,true)
  }
}
export function serviceDeck(p:Part,z:number,length:number,index:number,variant:number,leftExit=false) {
  deck(p,z,length,index,variant)
  overhead(p,z,length,index,variant,leftExit)
}

export function freightCase(p:Part,x:number,z:number) {
  const y=-2.49
  p('duct','carbon',x,y,z,1.12,.86,.93)
  p('plate','paint',x,y,z+.50,1.07,.73,.09)
  p('plate','trim',x,y+.466,z,1.14,.96,.105,-halfPi)
  for(const side of [-1,1]) {
    p('duct','steel',x+side*.42,y,z,.092,1.0,1.0)
    p('plate','bronze',x+side*.27,y+.16,z+.57,.096,.23,.076)
  }
  p('plate','hazard',x,y-.18,z+.555,.59,.13,.021)
}
