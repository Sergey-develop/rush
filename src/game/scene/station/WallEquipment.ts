import type { Part } from './parts'

const halfPi = Math.PI / 2
type Metal = 'steel' | 'bronze' | 'rubber' | 'chrome' | 'carbon' | 'paint'
type Point = [number, number, number]

/** A pipe with arbitrary endpoints. The stock cylinder runs along its local Y axis. */
function pipe(p: Part, finish: Metal, a: Point, b: Point, diameter: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const length = Math.hypot(dx, dy, dz)
  p('tube', finish, (a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2,
    diameter, length + diameter*.04, diameter, Math.atan2(dz, dy), 0, -Math.asin(dx/length))
}

function bolts(p: Part, center: number, y: number, z: number, w: number, h: number) {
  for (const x of [-1, 1]) for (const v of [-1, 1]) {
    p('tube','chrome',center+x*w/2,y+v*h/2,z,.066,.043,.066,halfPi)
  }
}

/** Swing handle with a shadow gap behind it. */
function handle(p: Part, x: number, y: number, z: number, height: number) {
  for (const end of [-1,1]) p('block','steel',x,y+end*height/2,z,.075,.084,.16)
  p('tube','rubber',x,y,z+.075,.067,height,.067)
}

function cargoLatch(p: Part, x: number, y: number, z: number) {
  p('block','carbon',x,y,z,.13,.24,.07)
  p('plate','chrome',x,y-.018,z+.046,.084,.141,.045)
  p('tube','steel',x,y+.084,z+.05,.045,.156,.045,0,0,halfPi)
}

function service(p: Part, width: number) {
  const x=-width*.098
  p('plate','carbon',x,.19,.25,width*.70,2.51,.26)
  p('plate','paint',x,.19,.394,width*.64,2.37,.18)
  p('plate','armour',x,.25,.509,width*.52,1.75,.116)
  p('plate','grille',x+.02,.88,.584,width*.34,.35,.06)
  handle(p,x+width*.234,-.04,.588,.42)
  for (const y of [-.45,.72]) {
    p('plate','steel',x-width*.293,y,.515,.23,.26,.10)
    p('tube','bronze',x-width*.302,y,.584,.097,.32,.097)
  }
  p('plate','hazard',x,-.94,.498,width*.53,.15,.045)
  bolts(p,x,.22,.583,width*.50,1.58)
  const crate=width*.235
  p('plate','carbon',crate,-2.42,.59,width*.36,1.02,.86)
  p('plate','paint',crate,-2.41,.72,width*.32,.84,.67)
  p('block','steel',crate,-1.923,.62,width*.37,.12,.94)
  for(const side of [-1,1]) {
    const cx=crate+side*width*.106
    p('block','rubber',cx,-2.40,1.074,.089,.88,.053)
    p('block','rubber',cx,-1.85,.63,.089,.045,.88)
    p('block','steel',cx,-2.948,.67,.15,.099,.80)
    cargoLatch(p,cx,-2.26,1.11)
  }
}

function pressureManifold(p: Part, width: number) {
  const end=width*.485
  p('plate','carbon',0,.06,.19,width*.93,2.88,.17)
  for (const x of [-width*.36,width*.24]) {
    p('plate','steel',x,.08,.34,.20,2.28,.21)
    bolts(p,x,.10,.46,.11,2.08)
  }
  for (const [y,z,d,finish] of [[.98,.54,.31,'steel'],[.65,.61,.20,'bronze'],[-.91,.53,.235,'rubber']] as const) {
    pipe(p,finish,[-end,y,z],[end,y,z],d)
    for (const x of [-width*.365,width*.24,width*.39]) {
      p('tube','steel',x,y,z,d*1.22,.115,d*1.22,0,0,halfPi)
    }
  }
  // A cast offset and two large union nuts break up the otherwise parallel pipe run.
  pipe(p,'steel',[-end,.16,.57],[-width*.15,.16,.57],.28)
  pipe(p,'steel',[-width*.15,.16,.57],[-width*.07,-.23,.57],.28)
  pipe(p,'steel',[-width*.07,-.23,.57],[end,-.23,.57],.28)
  for (const x of [-width*.24,width*.11]) {
    const y=x<0?.16:-.23
    p('tube','bronze',x,y,.57,.39,.14,.39,0,0,halfPi)
  }
  const vx=width*.23
  p('tube','steel',vx,-.24,.73,.19,.35,.19,halfPi)
  p('ring','bronze',vx,-.24,.94,.48,.48,.078)
  p('tube','chrome',vx,-.24,.94,.13,.09,.13,halfPi)
  for (const angle of [0,Math.PI/3,2*Math.PI/3]) {
    p('block','bronze',vx,-.24,.94,.035,.421,.035,0,0,angle)
  }
}

function ventilation(p: Part, width: number) {
  const x=-width*.107
  p('plate','carbon',x,.34,.29,width*.68,1.96,.38)
  p('plate','paint',x,.34,.474,width*.64,1.84,.22)
  const diameter=Math.min(1.26,width*.43)
  p('tube','carbon',x,.34,.61,diameter*1.13,.13,diameter*1.13,halfPi)
  p('fan','steel',x,.34,.71,diameter,diameter,.10)
  p('ring','chrome',x,.34,.735,diameter*1.05,diameter*1.05,.096)
  for (const xoff of [-.29,.29]) {
    p('block','carbon',x+xoff*diameter,.34,.794,.035,diameter*.78,.043,0,0,-.16)
  }
  bolts(p,x,.34,.623,width*.565,1.6)
  p('plate','grille',x,-.89,.39,width*.62,.44,.20)
  // Separate supply plenum. Each louvre stands proud of its black gasket.
  const duct=width*.329
  p('plate','steel',duct,.08,.33,width*.195,2.26,.35)
  p('plate','carbon',duct,.11,.535,width*.172,1.91,.14)
  for(let i=0;i<8;i++) p('block','steel',duct,-.68+i*.219,.659,width*.146,.085,.18,-.24)
  pipe(p,'rubber',[duct,-1.08,.41],[duct,-1.46,.41],.13)
}

function switchgear(p: Part, width: number) {
  const main=-width*.155, slim=width*.24
  for (const [x,w,y,h,z] of [[main,width*.465,.12,2.72,.65],[slim,width*.245,-.13,2.16,.56]]) {
    p('plate','carbon',x,y,.35,w+.09,h+.10,.36)
    p('plate','paint',x,y,z-.10,w,h,.30)
    p('plate','armour',x,y-.10,z+.077,w*.88,h*.70,.081)
    p('plate','grille',x,y+h*.37,z+.08,w*.76,h*.13,.055)
    handle(p,x+w*.31,y-.22,z+.164,.31)
    bolts(p,x,y+.04,z+.121,w*.79,h*.59)
  }
  // Protective lip around a small bank of service breakers with individual toggles.
  p('plate','carbon',main,.32,.791,width*.28,.41,.085)
  for(let i=0;i<4;i++){
    const x=main+(i-1.5)*width*.057
    p('block','steel',x,.30,.84,.070,.22,.04)
    p('block','rubber',x,.35,.872,.091,.14,.06,-.32)
  }
  p('block','amber',main-width*.127,.456,.848,.052,.032,.016)
  for (const x of [main-width*.12,main,slim]) {
    p('tube','carbon',x,-1.48,.413,.128,.57,.128)
    p('tube','bronze',x,-1.56,.413,.157,.079,.157)
  }
}

function observation(p: Part, width: number) {
  const w=Math.min(5.85,width*.82), h=2.23, x=-(width-w)*.42, y=.79
  // Four hull panels leave a real through-opening in both layers of the pressure wall.
  const hull = (finish:'carbon'|'paint', totalW:number, totalH:number, z:number, d:number) => {
    const left=x-w*.495, right=x+w*.495, top=y+h*.488, bottom=y-h*.488
    const leftWidth=left+totalW/2, rightWidth=totalW/2-right
    const topHeight=totalH/2-top, bottomHeight=bottom+totalH/2
    p('block',finish,(-totalW/2+left)/2,0,z,leftWidth,totalH,d)
    p('block',finish,(totalW/2+right)/2,0,z,rightWidth,totalH,d)
    p('block',finish,x,(top+totalH/2)/2,z,right-left,topHeight,d)
    p('block',finish,x,(bottom-totalH/2)/2,z,right-left,bottomHeight,d)
  }
  hull('carbon',width+.024,6.13,-.16,.30)
  hull('paint',width-.025,5.86,-.015,.14)
  p('port','carbon',x,y,.086,w,h,.64)
  // Two recessed packing seams catch grazing light on the sleeve's side reveals.
  for(const side of [-1,1]) for(const recess of [-.17,.035]) {
    p('block','steel',x+side*w*.458,y,recess,.018,h*.64,.020)
  }
  // The glass closes the outboard end of the deep reveal. Its depth occludes cabin fog.
  p('block','space',x,y,-.245,w+.02,h+.02,.020)
  const innerW=w*.934, innerH=h*.89, cx=w*.059, cy=h*.10
  const corners: Point[]=[
    [x-innerW/2+cx,y-innerH/2,0],[x+innerW/2-cx,y-innerH/2,0],[x+innerW/2,y-innerH/2+cy,0],[x+innerW/2,y+innerH/2-cy,0],
    [x+innerW/2-cx,y+innerH/2,0],[x-innerW/2+cx,y+innerH/2,0],[x-innerW/2,y+innerH/2-cy,0],[x-innerW/2,y-innerH/2+cy,0],
  ]
  for(let i=0;i<corners.length;i++) {
    const a=corners[i],b=corners[(i+1)%corners.length]
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),angle=-Math.atan2(dx,dy)
    p('block','rubber',(a[0]+b[0])/2,(a[1]+b[1])/2,.405,.105,len+.024,.065,0,0,angle)
    p('block','steel',(a[0]+b[0])/2,(a[1]+b[1])/2,.434,.061,len+.014,.048,0,0,angle)
  }
  for(const xx of [x-w*.38,x-w*.13,x+w*.13,x+w*.38]) for(const yy of [y-h*.471,y+h*.471]) {
    p('tube','chrome',xx,yy,.402,.059,.045,.059,halfPi)
  }
  p('beam','steel',x-w*.033,y-h/2-.05,.26,.10,w*.87,.24,0,0,halfPi)
  // The ledge is carried by anchored corbels, above the paired coolant mains.
  p('plate','armour',x,-.82,.16,w*.91,.89,.19)
  p('plate','grille',x+w*.13,-.80,.279,w*.37,.42,.073)
  for(const xx of [x-w*.32,x+w*.31]) {
    p('plate','trim',xx,-.76,.252,.21,.70,.19)
    p('beam','steel',xx,-.64,.36,.13,.59,.13,.50)
    p('tube','chrome',xx,-1.00,.36,.072,.05,.072,halfPi)
  }
  const end=width*.48
  const join=width*.26
  pipe(p,'steel',[-end,-1.52,.56],[end,-1.52,.56],.34)
  pipe(p,'carbon',[-end,-2.03,.64],[end,-2.03,.64],.26)
  for(const xx of [-width*.37,width*.045,width*.40]) {
    p('plate','steel',xx,-1.78,.34,.18,1.09,.34)
    p('tube','carbon',xx,-1.52,.56,.405,.125,.405,0,0,halfPi)
    p('tube','bronze',xx,-2.03,.64,.315,.112,.315,0,0,halfPi)
  }
  pipe(p,'bronze',[join,-1.52,.58],[join,-2.03,.64],.158)
  p('tube','steel',join,-1.77,.61,.232,.081,.232)
  for(const xx of [join-.18,join-.095]) {
    p('tube','steel',xx,-1.52,.56,.457,.064,.457,0,0,halfPi)
  }
  // Recess the short service light under the lower main, leaving both pipes in silhouette.
  const lampX=width*.22, lampW=Math.min(.79,width*.18)
  p('plate','carbon',lampX,-2.56,.635,lampW+.15,.25,.16,-.69)
  p('block','amber',lampX,-2.498,.714,lampW,.091,.035,-.69)
  for(const xx of [lampX-lampW*.41,lampX+lampW*.41]) {
    p('block','steel',xx,-2.488,.732,.035,.163,.038,-.69)
  }
}

function emergencyStation(p: Part, width: number) {
  const x=-width*.21, y=.22
  p('plate','paint',x,y,.32,.93,1.56,.29)
  p('plate','carbon',x,y,.49,.56,1.10,.16)
  for (const end of [-1,1]) {
    p('tube','bronze',x,y+end*.37,.655,.43,.14,.43)
    p('ring','steel',x,y+end*.30,.666,.46,.46,.06,halfPi)
  }
  p('tube','amber',x,y,.66,.289,.62,.289)
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4
    p('tube','carbon',x+Math.cos(a)*.211,y,.66+Math.sin(a)*.211,.027,.67,.027)
  }
  p('ring','bronze',x,y-.023,.66,.452,.452,.048,halfPi)
  bolts(p,x,y,.479,.76,1.36)
  pipe(p,'carbon',[x,.96,.44],[x,1.33,.44],.114)
  pipe(p,'carbon',[x,1.33,.44],[x+.28,1.60,.44],.114)
  pipe(p,'carbon',[x+.28,1.60,.44],[width*.47,1.60,.44],.114)
  const cabinet=width*.20
  p('plate','steel',cabinet,-.16,.34,width*.33,1.34,.36)
  p('plate','paint',cabinet,-.15,.566,width*.30,1.20,.16)
  p('plate','hazard',cabinet,-.60,.658,width*.26,.18,.03)
  handle(p,cabinet+width*.095,-.14,.68,.31)
  p('tube','carbon',cabinet,-1.05,.44,.19,.59,.19)
  p('plate','grille',-width*.067,-1.49,.33,width*.69,.48,.16)
}

function reinforced(p: Part, width: number) {
  const x=-width*.177
  p('plate','carbon',x,0,.30,.75,4.11,.45)
  p('plate','steel',x,.03,.57,.51,3.19,.45)
  for(const end of [-1,1]){
    p('plate','trim',x,end*1.77,.70,.69,.64,.45,end*.39)
    p('plate','paint',x,end*1.18,.827,.53,.53,.13)
    bolts(p,x,end*1.18,.917,.35,.37)
    p('plate','hazard',x,end*.79,.804,.42,.162,.054)
  }
  // A diagonal brace transmits load from the upper joint to a separate lower shoe.
  const foot=x+width*.47, lo=-1.59, hi=1.52, dx=foot-x
  const ang=Math.atan2(dx,hi-lo), length=Math.hypot(dx,hi-lo)
  p('block','carbon',(x+foot)/2,(lo+hi)/2,.46,.35,length,.39,0,0,ang)
  p('block','steel',(x+foot)/2,(lo+hi)/2,.673,.245,length,.11,0,0,ang)
  p('plate','trim',foot,lo,.56,.64,.60,.36)
  bolts(p,foot,lo,.774,.40,.35)
  p('plate','grille',width*.263,.96,.34,width*.22,1.10,.16)
  p('plate','armour',-width*.354,-.11,.35,width*.16,2.50,.24)
}

const stations=[service,pressureManifold,ventilation,switchgear,observation,emergencyStation,reinforced]

/** Equipment lies against a closed wall; +Z is the direction into the passage. */
export function wallEquipment(p: Part, bay: number, variant: number, side: number, width: number, nearWindow=false) {
  if (width < 2.1) {
    p('plate','trim',0,.08,.34,width*.72,1.57,.21)
    return
  }
  const mirror=nearWindow || (Math.abs(bay)+(side>0?1:0))%2===0?1:-1
  const part: Part=(shape,finish,x,y,z,w,h,d,rx=0,ry=0,rz=0)=>
    p(shape,finish,x*mirror,y,z,w,h,d,rx,ry*mirror,rz*mirror)
  stations[((variant%stations.length)+stations.length)%stations.length](part,width)
}
