export type Shape = 'block' | 'plate' | 'port' | 'tube' | 'cable' | 'ring' | 'fan' | 'beam' | 'duct' | 'grate'
export type Skin = 'armour' | 'deck' | 'grille' | 'ceiling' | 'trim' | 'paint' | 'hazard'
export type Finish = Skin | 'steel' | 'carbon' | 'chrome' | 'bronze' | 'blue' | 'amber' | 'sill' | 'beacon' | 'sector' | 'space' | 'rubber'
export type Part = (shape:Shape, material:Finish, x:number,y:number,z:number,
  width:number,height:number,depth:number,rx?:number,ry?:number,rz?:number,circuit?:number)=>void
