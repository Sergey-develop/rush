import * as THREE from 'three'

type Skin = 'armour' | 'deck' | 'grille' | 'ceiling' | 'trim' | 'paint' | 'hazard'
type Painter = CanvasRenderingContext2D
const size = 512

function canvas(w = size, h = size): Painter {
  const element = document.createElement('canvas')
  element.width = w
  element.height = h
  return element.getContext('2d')!
}

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function texture(ctx: Painter, color = true) {
  const map = new THREE.CanvasTexture(ctx.canvas)
  if (color) map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return map
}

function box(ctx: Painter, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function stroke(ctx: Painter, color: string, width: number, points: number[][]) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function seam(ctx: Painter, points: number[][], width = 3) {
  stroke(ctx, 'rgba(174,188,203,.49)', width, points.map(([x, y]) => [x + 1.1, y + 1.6]))
  stroke(ctx, '#131724', width, points)
}

function screw(ctx: Painter, x: number, y: number, r: number) {
  for (const [ox, oy, radius, color] of [
    [0, 1, r + 1, '#86909c'], [0, 0, r + 1, '#131722'], [0, 0, r * .72, '#69717d'],
  ] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + ox, y + oy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  stroke(ctx, '#202431', Math.max(.9, r * .45), [[x - r * .5, y + r * .25], [x + r * .5, y - r * .25]])
}

function stencil(ctx: Painter, label: string, x: number, y: number, height: number, color: string) {
  ctx.font = 'bold ' + height + 'px "Bahnschrift", "Arial Narrow", sans-serif'
  ctx.fillStyle = color
  ctx.fillText(label, x, y)
}

function warning(ctx: Painter, x: number, y: number, n: number, color: string) {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const k = x + i * 8
    ctx.beginPath()
    ctx.moveTo(k, y)
    ctx.lineTo(k + 5, y)
    ctx.lineTo(k + 11, y - 7)
    ctx.lineTo(k + 6, y - 7)
    ctx.fill()
  }
}

function radial(ctx: Painter, x: number, y: number, rx: number, ry: number, rgb: string, alpha: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  glow.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')')
  glow.addColorStop(.25, 'rgba(' + rgb + ',' + alpha * .58 + ')')
  glow.addColorStop(1, 'rgba(' + rgb + ',0)')
  ctx.fillStyle = glow
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

/** Continuous seeded fields give grime coherent islands across a panel, including mip levels. */
function valueNoise(seed: number, period = 128) {
  const mask = period-1
  const rng = random(seed)
  const values = Float32Array.from({ length: 128 * 128 }, rng)
  return (x:number, y:number) => {
    const i = Math.floor(x), j = Math.floor(y)
    const fx = x-i, fy = y-j
    const u = fx*fx*(3-2*fx), v = fy*fy*(3-2*fy)
    const a = (j&mask)*128, b = ((j+1)&mask)*128, l = i&mask, r = (i+1)&mask
    const top = values[a+l] + u*(values[a+r]-values[a+l])
    return top + v*(values[b+l] + u*(values[b+r]-values[b+l])-top)
  }
}
const saturate = (number:number) => Math.max(0, Math.min(1, number))

/** Dirt follows fasteners and gravity. Longer scratches cluster around panels removed by hand. */
function serviceWear(ctx: Painter, kind: Skin, rng: ()=>number) {
  const stops = kind==='deck' ? [[17,19],[99,258],[410,491],[493,258]] :
    kind==='armour' ? [[32,102],[89,268],[394,361],[479,102],[196,304]] :
      [[27,28],[470,247],[452,481]]
  for (const [x,y] of stops) {
    radial(ctx,x+1,y+6,8+rng()*8,12+rng()*23,'48,38,28',.30)
    for(let i=0;i<5;i++) {
      const offset=(rng()-.5)*7
      stroke(ctx,'rgba(49,39,29,.22)',.7+rng(),[[x+offset, y+4], [x+offset*.75,y+7+rng()*25]])
    }
  }
  for (let i=0;i<100;i++) {
    const x = i%3===0 ? 7+rng()*23 : i%3===1 ? 479+rng()*26 : rng()*size
    const y = rng()*size
    const length=3+Math.pow(rng(),2)*39, angle = kind==='deck' ? 1.3+rng()*.29 : rng()*.6-.3
    const endX=x+Math.cos(angle)*length, endY=y+Math.sin(angle)*length
    stroke(ctx,'rgba(28,27,26,.35)',.5+rng()*.95,[[x,y],[endX,endY]])
    if(i%3!==0) stroke(ctx,'rgba(170,171,161,.31)',.55,[[x+1,y+.9],[endX,endY+.9]])
  }
}

function flake(ctx: Painter, x:number, y:number, rx:number, ry:number, angle:number, rng:()=>number) {
  ctx.save()
  ctx.translate(x,y);ctx.rotate(angle)
  const path=new Path2D()
  const skew=rng()*1.4-.7
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12, jag=.57+.42*rng(), sx=Math.cos(a)*rx*jag, sy=Math.sin(a)*ry*jag
    if(i===0) path.moveTo(sx+sy*skew,sy);else path.lineTo(sx+sy*skew,sy)
  }
  path.closePath()
  ctx.fillStyle='#580000';ctx.fill(path)
  ctx.scale(.81,.74);ctx.fillStyle='#a70000';ctx.fill(path)
  ctx.restore()
}

/** Red marks broken enamel, green is dry dirt and blue is grease. Masks are never emissive. */
function damageMask(kind: Skin, seed:number) {
  const m=canvas(), rng=random(seed)
  box(m,'#000000',0,0,size,size)
  m.globalCompositeOperation='lighter'
  const onHatch=kind==='armour', painted=onHatch || kind==='paint' || kind==='hazard' || kind==='ceiling'
  const x0=onHatch ? 72 : 5, x1=onHatch ? 440 : 507
  const y0=onHatch ? 81 : 4, y1=onHatch ? 356 : 507
  for(const [x,y] of [[x0+2,y0+2],[x1-3,y0],[x0+3,y1-1],[x1-4,y1]]) {
    const width=43+rng()*46,height=20+rng()*62
    radial(m,x,y,width,height,'0,255,0',.82)
    radial(m,x+4,y-2,width*.41,height*.64,'0,255,0',.49)
  }
  // Chips grow inward from latch edges, impact points and the removable panel perimeter.
  const patches=painted?21:8
  for(let i=0;i<patches;i++) {
    const side=i%4,t=rng()
    let x=side===0?x0+3:side===1?x1-4:x0+(x1-x0)*t
    let y=side===2?y0+3:side===3?y1-6:y0+(y1-y0)*t
    if(onHatch && i<4) {x=i%2?195:128;y=i%2?302:103}
    if(kind==='hazard' && i%3===1) {x=40+295*t;y=(132-(x%132))+132*Math.floor(rng()*3)}
    const reach=painted ? 1 : .63, angle=side<2?1.48+rng()*.15:rng()*.18-.09
    const rx=(12+rng()*39)*reach, ry=(4+rng()*13)*reach
    flake(m,x,y,rx,ry,angle,rng)
    for(let j=0;j<3;j++)
      flake(m,x+(rng()-.5)*rx*1.6,y+(rng()-.5)*ry*2.4,rx*(.12+rng()*.24),2+rng()*3,angle,rng)
  }
  const fittings=onHatch?[[89,102],[394,268],[196,304]]:kind==='deck'?[[99,258],[410,19]]:kind==='ceiling'?[[54,154],[268,279],[489,31]]:[[38,45],[468,247],[54,435]]
  for(const [x,y] of fittings) {
    radial(m,x,y+4,15+rng()*14,19+rng()*21,'0,255,0',.71)
    const length=30+rng()*57, bend=(rng()-.5)*11, width=2+rng()*2.5
    m.fillStyle='rgba(0,0,255,.59)';m.beginPath();m.moveTo(x-width,y)
    m.bezierCurveTo(x-width-1,y+9,x+bend-1,y+length*.53,x+bend,y+length)
    m.bezierCurveTo(x+bend+2,y+length*.68,x+width+1,y+11,x+width,y)
    m.closePath();m.fill()
    radial(m,x+bend*.4,y+length*.38,6+rng()*3,length*.61,'0,0,255',.63)
  }
  return m.getImageData(0,0,size,size).data
}

function finishes(ctx: Painter, glow: Painter, kind: Skin, seed: number) {
  const original = ctx.getImageData(0,0,size,size)
  const damage = damageMask(kind,seed+441)
  const albedo = original.data
  const originalRed = new Uint8Array(size*size)
  for(let i=0;i<originalRed.length;i++) originalRed[i]=albedo[i*4]
  const normals = canvas(), orm = canvas()
  const normalPixels = normals.createImageData(size,size), channels = orm.createImageData(size,size)
  const n=normalPixels.data, p=channels.data
  const noise=valueNoise(seed), rng=random(seed+103)
  const deck=kind==='deck', grille=kind==='grille', armour=kind==='armour'
  const coat=kind==='paint' || kind==='hazard' || kind==='ceiling'
  for(let y=0;y<size;y++) {
    const row=y*size, nextY=((y+1)&511)*size, prevY=((y-1)&511)*size
    const brushed=(rng()-.5)*2
    for(let x=0;x<size;x++) {
      const idx=row+x, i=idx*4
      const red=originalRed[idx], left=originalRed[row+((x-1)&511)], right=originalRed[row+((x+1)&511)]
      const up=originalRed[prevY+x], down=originalRed[nextY+x]
      const broad=noise(x*.011,y*.012), fleck=noise(x*.12+17,y*.13-34), grit=rng()
      const rim = Math.min(x,size-1-x,y,size-1-y)
      const hatch = armour && x>71 && x<442 && y>80 && y<356
      const painted = coat || hatch
      const lip = hatch ? Math.min(x-71,442-x,y-80,356-y) : rim
      const seamRelief = Math.abs(right-left)+Math.abs(up-down)
      const phase = (x+y)%132
      const stripe = kind==='hazard' ? Math.min(phase,Math.abs(phase-58),132-phase) : size
      const contact = Math.max(saturate(1-lip/14),saturate((seamRelief-27)/70)*.76,saturate(1-stripe/13)*.84)
      const rubbed = saturate((contact*(.5+fleck*.5) + .30*broad + grit*.13-.64)*6)
      const recess = saturate((47-red)/36)
      const soil = saturate((broad*.72+fleck*.28-.48)*1.6) * (.55 + .45*recess)
      const oxide = saturate((fleck+.54*broad-.94)*3.5)*rubbed
      const coatChip = damage[i]/255
      const chippedMetal = saturate((coatChip-.38)*2.3) * saturate((fleck*.35 + grit*.12 + .66)*1.05)
      const primer = saturate(coatChip*3)*(1-chippedMetal)
      const exposed = Math.max(rubbed*(1-oxide*.58),chippedMetal)
      const grime = damage[i+1]/255 * (.48+.62*fleck)
      const grease = damage[i+2]/255 * (.62+.38*broad)
      const luma = albedo[i]*.29+albedo[i+1]*.60+albedo[i+2]*.11
      const warmMark = albedo[i]-albedo[i+2]>17
      const saturation = warmMark ? .93 : .50
      const neutral = .90 + .15*broad - .28*soil + .025*(fleck-.5)
      const grain = (grit-.5)*(painted ? 5 : 8) + brushed
      const bare = (painted ? 117 : 126)+16*(broad-.5)+14*(fleck-.5)
      for(let c=0;c<3;c++) {
        let tone=(luma+(albedo[i+c]-luma)*saturation)*neutral + grain
        tone += soil * (c===0 ? 6 : c===2 ? -7 : 1)
        tone *= 1-.41*grime-.51*grease
        const undercoat=(c===0 ? 68 : c===1 ? 59 : 48) + 9*fleck
        tone+=(undercoat-tone)*primer*.76
        const chipped=bare+(c===0 ? 10*oxide : c===2 ? -15*oxide : 0)
        tone+=(chipped-tone)*exposed*.89
        albedo[i+c]=tone
      }
      const walkPolish = deck ? saturate(1-Math.abs(x-267)/(125+24*broad)) : 0
      let roughness = (painted ? .61 : grille ? .47 : deck ? .43 : .48) + (broad-.5)*.20 + (fleck-.5)*.08 + soil*.22
      roughness += recess*.12 - walkPolish*.15
      roughness += exposed*(.30-roughness) + oxide*.14 + grime*.16 - grease*.23
      let metalness=(painted ? .11 : .84) - soil*.25 - recess*.35
      metalness=metalness*(1-.73*grime)*(1-.63*grease)*(1-.50*primer)
      metalness+=(.94-metalness)*exposed
      if(warmMark && !rubbed) metalness*=.28
      p[i]=255; p[i+1]=255*saturate(roughness); p[i+2]=255*saturate(metalness); p[i+3]=255
      // Normalise the tangent-space derivative so deep seams bevel rather than flare.
      const chippedX=(damage[(row+((x+1)&511))*4]-damage[(row+((x-1)&511))*4])*.0011
      const chippedY=(damage[(prevY+x)*4]-damage[(nextY+x)*4])*.0011
      const dx=(left-right)*.010+chippedX, dy=(down-up)*.010+chippedY, inv=1/Math.sqrt(dx*dx+dy*dy+1)
      n[i]=127.5+127.5*dx*inv; n[i+1]=127.5+127.5*dy*inv; n[i+2]=127.5+127.5*inv; n[i+3]=255
    }
  }
  ctx.putImageData(original,0,0);normals.putImageData(normalPixels,0,0);orm.putImageData(channels,0,0)
  const packed=texture(orm,false)
  return {map:texture(ctx),normalMap:texture(normals,false),emissiveMap:texture(glow),roughnessMap:packed,metalnessMap:packed}
}

export function makeSkin(kind: Skin) {
  const ctx = canvas()
  const glow = canvas()
  const rng = random(399 + kind.charCodeAt(1))
  const pixels = ctx.createImageData(size, size)
  const base = { grille: 81, deck: 98, trim: 102, armour: 98, ceiling: 82, paint: 125, hazard: 94 }[kind]
  for (let y = 0; y < size; y++) {
    let brushed = rng() * 5
    for (let x = 0; x < size; x++) {
      if (rng() < .035) brushed = rng() * 7
      const a = (y * size + x) * 4
      const value = base + brushed + rng() * 8 + 3 * Math.sin(x * .055 + y * .009)
      pixels.data[a] = value * .98
      pixels.data[a + 1] = value
      pixels.data[a + 2] = value + 1
      pixels.data[a + 3] = 255
    }
  }
  ctx.putImageData(pixels, 0, 0)
  box(glow, '#000000', 0, 0, size, size)

  if (kind === 'grille') {
    for (let y = 7; y < size - 6; y += 18) {
      for (let x = 11; x < size - 14; x += 15) {
        if (x > 240 && x < 264) continue
        box(ctx, '#818695', x, y + 2, 8, 13)
        box(ctx, '#111420', x, y, 8, 13)
        box(ctx, '#202332', x + 2, y + 3, 4, 9)
      }
    }
    for (const x of [6, 252, 506]) {
      seam(ctx, [[x, 0], [x, 512]], 1.5)
      for (const y of [14, 246, 496]) screw(ctx, x, y, 2.8)
    }
  } else if (kind === 'armour') {
    // Inset panels have a dark bevel along the top and rubbed edges near the latch.
    const face = ctx.createLinearGradient(0, 83, 0, 372)
    face.addColorStop(0, 'rgba(7,9,16,.58)')
    face.addColorStop(.13, 'rgba(21,24,30,.16)')
    face.addColorStop(.67, 'rgba(103,102,99,.10)')
    face.addColorStop(1, 'rgba(19,16,24,.42)')
    box(ctx, '#303232', 68, 76, 376, 282)
    box(ctx, '#63645f', 73, 82, 366, 272)
    ctx.fillStyle = face
    ctx.fillRect(73, 82, 366, 272)
    for (const x of [78, 423]) {
      box(ctx, '#1b1e26', x, 132, 9, 131)
      box(ctx, '#737884', x + 1, 136, 2, 123)
    }
    for (let y = 129; y < 211; y += 10) {
      box(ctx, '#171b24', 317, y, 64, 5)
      box(ctx, '#626975', 316, y + 5, 64, 1)
    }
    stencil(ctx, '07-B', 102, 247, 27, '#80858c')
    stencil(ctx, 'INSPECTION PORT', 105, 262, 7, '#a3a5a0')
    box(ctx, '#8b604b', 105, 270, 46, 2)
    box(ctx, '#242630', 191, 303, 91, 19)
    box(ctx, '#58606b', 195, 304, 34, 10)
    for (let x = 238; x < 271; x += 5) box(ctx, '#92684e', x, 308, 2, 7)
    seam(ctx, [[0, 92], [73, 92], [96, 68], [338, 68], [351, 85], [512, 85]], 4)
    seam(ctx, [[0, 343], [35, 343], [72, 379], [385, 379], [420, 342], [512, 342]], 4)
    seam(ctx, [[99, 68], [99, 78], [55, 122], [55, 290]], 2)
    seam(ctx, [[458, 85], [458, 218], [481, 240], [512, 240]], 2)
    for (const y of [102, 268, 361]) for (const x of [32, 89, 394, 479]) screw(ctx, x, y, 3.1)
    // Recessed access latch, miniature ribbing and etched service identifiers.
    box(ctx, '#111722', 129, 102, 78, 12)
    box(ctx, '#8a909a', 140, 104, 52, 4)
    for (let x = 310; x < 372; x += 6) box(ctx, '#1d212c', x, 322, 3, 16)
    warning(ctx, 74, 423, 9, '#b2824e')
    box(ctx, '#737565', 292, 410, 25, 2)

  } else if (kind === 'deck') {
    for (let r = 0; r < 3; r++) {
      const y = r * 159 + 18
      for (const x of [17, 463]) {
        box(ctx, '#252a32', x, y + 9, 26, 107)
        for (let j = 0; j < 7; j++) {
          box(ctx, '#4c515b', x + 2, y + 12 + j * 14, 22, 6)
          box(ctx, '#737a82', x + 2, y + 12 + j * 14, 22, 1)
        }
      }
    }
    const wear = ctx.createLinearGradient(80, 0, 425, 0)
    wear.addColorStop(0, 'rgba(16,18,26,.51)')
    wear.addColorStop(.3, 'rgba(16,18,26,.05)')
    wear.addColorStop(.56, 'rgba(149,143,132,.11)')
    wear.addColorStop(1, 'rgba(16,18,26,.45)')
    ctx.fillStyle = wear
    ctx.fillRect(74, 0, 360, 512)
    for (let i = 0; i < 200; i++) {
      const x = rng() * 512, y = rng() * 512
      box(ctx, 'rgba(174,178,181,.12)', x, y, 1 + rng() * 2, 17 + rng() * 60)
    }
    seam(ctx, [[57, 0], [57, 125], [80, 147], [80, 372], [54, 402], [54, 512]], 3.5)
    seam(ctx, [[454, 0], [454, 189], [427, 217], [427, 401], [451, 425], [451, 512]], 3.5)
    seam(ctx, [[0, 285], [43, 285], [62, 304], [169, 304], [187, 287], [325, 287], [352, 316], [512, 316]], 3)
    for (const x of [17, 99, 410, 493]) {
      for (const y of [19, 258, 491]) screw(ctx, x, y, 3.5)
    }
    for (let x = 119; x < 197; x += 7) box(ctx, '#252734', x, 37, 3, 17)
    warning(ctx, 262, 320, 7, '#a48559')

  } else if (kind === 'ceiling') {
    box(ctx, '#292e39', 209, 0, 81, 512)
    for (let y = 8; y < 512; y += 24) {
      box(ctx, '#161c28', 216, y, 65, 15)
      box(ctx, '#606571', 216, y + 14, 65, 2)
    }
    for (const x of [33, 198, 304, 470]) seam(ctx, [[x, 0], [x, 111], [x + 13, 124], [x + 13, 300], [x, 313], [x, 512]], 3)
    for (let y = 23; y < 500; y += 124) {
      box(ctx, '#222633', 54, y, 124, 18)
      for (let x = 59; x < 170; x += 10) box(ctx, '#525b68', x, y + 1, 5, 15)
      for (const x of [19, 268, 489]) screw(ctx, x, y + 8, 3)
    }
  } else if (kind === 'hazard' || kind === 'paint') {
    if (kind==='hazard') {
      box(ctx,'#363837',0,0,size,size)
      for(let x=-size;x<size*2;x+=132) {
        ctx.fillStyle='#b18847'
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+58,0);ctx.lineTo(x+58-size,size);ctx.lineTo(x-size,size);ctx.fill()
      }
      for(const y of [18,490]) seam(ctx,[[0,y],[512,y]],2)
      for(const x of [24,488]) for(const y of [31,481]) screw(ctx,x,y,5)
    } else {
      box(ctx,'#95968e',21,25,470,460)
      seam(ctx,[[23,423],[23,63],[58,28],[480,28]],2.2)
      seam(ctx,[[481,49],[481,448],[448,480],[51,480]],2.2)
      box(ctx,'#876340',40,65,7,147)
      stencil(ctx,'P–04',58,98,18,'#73766a')

      for(const x of [38,468]) for(const y of [45,465]) screw(ctx,x,y,4.1)
    }
  } else {
    seam(ctx, [[29, 0], [29, 146], [44, 164], [44, 398], [29, 413], [29, 512]], 4)
    for (const x of [57, 453]) for (const y of [29, 246, 483]) screw(ctx, x, y, 6)
    for (let x = 164; x < 313; x += 17) box(ctx, '#242a35', x, 197, 7, 103)
    warning(ctx, 148, 445, 19, '#b08656')
  }
  serviceWear(ctx,kind,rng)
  seam(ctx, [[2,508],[2,6],[6,2],[506,2]], 1.8)
  seam(ctx, [[509,4],[509,504],[505,509],[3,509]], 1.8)
  if (kind==='armour') {
    for(const x of [200,206]) {
      box(ctx,'#a29361',x,304,3.5,2)
      box(glow,'#8f704a',x,304,3.5,2)
    }
  }
  return finishes(ctx,glow,kind,3901+kind.charCodeAt(0)*29+kind.charCodeAt(1))
}

/** Seamless mill-finished steel for beams, pipe work and window frames; no directional signage. */
export function makeHardware() {
  const albedo=canvas(), normals=canvas(), channels=canvas(), scratchMask=canvas()
  const a=albedo.createImageData(size,size), n=normals.createImageData(size,size), p=channels.createImageData(size,size)
  const rng=random(91821), broadNoise=valueNoise(2311,4), mediumNoise=valueNoise(520,16), fineNoise=valueNoise(7043,64)
  const height=new Float32Array(size*size)
  for(let i=0;i<145;i++) {
    const clustered=i<85
    const cx=clustered ? 83+(rng()-.5)*98 : rng()*size
    const cy=clustered ? 209+(rng()-.5)*71 : rng()*size
    const length=(clustered ? 8 : 4)+Math.pow(rng(),2)*(clustered ? 84 : 41)
    const dy=clustered ? length*(.14+.13*rng()) : length*(rng()-.5)*.95
    const width=.44+Math.pow(rng(),2)*1.4, ink='rgba(255,255,255,'+(.30+.68*rng())+')'
    for(const offX of [-size,0,size]) for(const offY of [-size,0,size]) {
      const x=cx+offX,y=cy+offY
      if(x>size+2 || x+length<-2 || Math.min(y,y+dy)>size+2 || Math.max(y,y+dy)<-2) continue
      stroke(scratchMask,ink,width,[[x,y],[x+length*.64,y+dy*.45],[x+length,y+dy]])
    }
  }
  const scratches=scratchMask.getImageData(0,0,size,size).data
  for(let y=0;y<size;y++) {
    const milling=(rng()-.5)*4.4
    for(let x=0;x<size;x++) {
      const index=y*size+x,i=index*4
      const broad=broadNoise(x/128,y/128), local=mediumNoise(x/32,y/32), grain=fineNoise(x/8,y/8)
      const hair=scratches[i+3]/255
      const oxidation=saturate((broad*.69+local*.24+grain*.07-.60)*3.1)
      const oil=saturate((broad*.52+local*.48-.65)*3.3)
      const steel=103+(broad-.5)*19+(local-.5)*8+(grain-.5)*9+milling+(rng()-.5)*6
      const value=steel-oxidation*22-oil*27+hair*38
      a.data[i]=value+oxidation*10; a.data[i+1]=value+1+oxidation*1.5; a.data[i+2]=value+3-oxidation*9;a.data[i+3]=255
      p.data[i]=255;p.data[i+1]=255*saturate(.40+.14*(broad-.5)+.08*(grain-.5)+oxidation*.30-oil*.13-hair*.14)
      p.data[i+2]=255*saturate(.92-oxidation*.49-oil*.27+hair*.13); p.data[i+3]=255
      height[index]=.08*grain+.06*local-.28*hair+.065*oxidation
    }
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const row=y*size,index=(row+x)*4
    const dx=height[row+((x-1)&511)]-height[row+((x+1)&511)]
    const dy=height[((y+1)&511)*size+x]-height[((y-1)&511)*size+x]
    const inv=1/Math.sqrt(1+dx*dx+dy*dy)
    n.data[index]=127.5+127.5*dx*inv;n.data[index+1]=127.5+127.5*dy*inv;n.data[index+2]=127.5+127.5*inv;n.data[index+3]=255
  }
  albedo.putImageData(a,0,0);normals.putImageData(n,0,0);channels.putImageData(p,0,0)
  const map=texture(albedo),normalMap=texture(normals,false),packed=texture(channels,false)
  for(const tex of [map,normalMap,packed]) tex.wrapS=tex.wrapT=THREE.RepeatWrapping
  return { map,normalMap,roughnessMap:packed,metalnessMap:packed }
}

export function makeSector(number: string) {
  const ctx = canvas(384,480)
  const rng = random(621)
  ctx.scale(1.5,1.5)
  const plate=ctx.createLinearGradient(0,0,219,302)
  plate.addColorStop(0,'#535653');plate.addColorStop(.48,'#353938');plate.addColorStop(1,'#4a4943')
  ctx.fillStyle=plate;ctx.fillRect(0,0,256,320)
  for(let i=0;i<3000;i++) {
    const alpha=rng()*.10
    box(ctx,rng()>.5?'rgba(220,220,206,'+alpha+')':'rgba(8,12,12,'+alpha+')',rng()*256,rng()*320,.4+rng()*1.1,.5+rng()*1.3)
  }
  seam(ctx,[[5,291],[5,25],[26,5],[236,5],[250,19]],2.7)
  seam(ctx,[[249,32],[249,293],[227,314],[21,314]],2.7)
  box(ctx,'#916847',21,36,5,26)
  stencil(ctx,'STATION SERVICES',34,48,14,'#b1b4a8')
  stencil(ctx,'PRESSURE  /  ZONE',35,61,8,'#babbb1')
  ctx.save();ctx.translate(22,0);ctx.scale(.88,1.13)
  stencil(ctx,'SECTOR',0,108,48,'#deddd0');ctx.restore()
  ctx.save()
  ctx.translate(22,132)
  ctx.scale(1.12,1.14)
  const numbers: Record<string,string> = {
    '0':'M0 16L15 1H65L79 16V91L64 106H15L0 91Z M23 25V81L28 86H51L56 81V25L51 20H28Z',
    '3':'M0 1H65L79 15V40L68 52L79 63V92L65 106H0V86H52L56 82V66L51 61H20V43H51L56 38V25L51 21H0Z',
  }
  if ([...number].every(d=>numbers[d])) {
    for(const digit of number) {
      ctx.fillStyle='#d3d1c3';ctx.fill(new Path2D(numbers[digit]),'evenodd')
      box(ctx,'#464945',0,53,80,1.75)
      ctx.translate(88,0)
    }
  } else stencil(ctx,number,0,104,118,'#d3d1c3')
  ctx.restore()
  box(ctx,'#999c8f',22,264,211,1.6)
  warning(ctx,20,285,6,'#9d784a')
  stencil(ctx,'DECK  /  ACCESS',100,285,11,'#bbb9ab')
  for(const x of [12,244]) for(const y of [14,304]) {
    radial(ctx,x,y+11,8,22,'43,29,21',.32);screw(ctx,x,y,3.1)
  }
  for(let i=0;i<210;i++) {
    const y=24+rng()*260, x=rng()*256, edge=Math.min(x,256-x)
    if(edge>16 && rng()>.28) continue
    stroke(ctx,edge<16?'rgba(173,169,150,.47)':'rgba(41,43,39,.47)',.45+rng()*.7,[[x,y],[x+2+rng()*6,y-1+rng()*2]])
  }
  return texture(ctx)
}

export function makeReflection() {
  const w=256,h=128, data=new Float32Array(w*h*4)
  const fixtures=[
    // Azimuth, elevation, angular half-length, height, and HDR colour.
    [.45,.43,.20,.055,4.6,2.25,.92], [1.93,.44,.26,.032,.68,1.63,3.7],
    [3.05,.65,.47,.028,3.15,2.59,1.91], [4.56,.46,.16,.055,3.6,1.34,.42],
    [5.71,.67,.43,.035,.88,1.65,2.88], [2.95,.24,.22,.04,.63,.75,.80],
  ]
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const az=x/w*Math.PI*2,v=y/h
    const shell=Math.exp(-Math.pow((v-.53)/.23,2)), overhead=Math.exp(-Math.pow((v-.72)/.21,2))
    const bay=.05+.075*shell*(.25+.75*Math.pow(.5+.5*Math.cos(az*4.0-.32),3))+.07*overhead
    let r=bay*.94,g=bay,b=bay*1.07
    for(const [angle,elevation,spread,height,rr,gg,bb] of fixtures) {
      const delta=Math.abs(az-angle), shortest=Math.min(delta,Math.PI*2-delta)
      const a=shortest/spread,e=(v-elevation)/height
      const glint=Math.exp(-a*a*a*a-e*e*e*e)
      r+=rr*glint;g+=gg*glint;b+=bb*glint
    }
    const i=(y*w+x)*4
    data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=1
  }
  const env=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType)
  env.mapping=THREE.EquirectangularReflectionMapping;env.needsUpdate=true
  return env
}
