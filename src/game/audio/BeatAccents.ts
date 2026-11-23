// Centre the analysis window on each timestamp so a drum hit lights its fixture
// when the listener hears its attack. No BPM, beat grid or loop length is required.
const size = 512
const half = size / 2
export const ACCENT_WIDTH=4 // time, strength, bass attack, upper-band attack

function fftPlan() {
  const reverse = new Uint16Array(size)
  const window = new Float32Array(size)
  const cos = new Float32Array(half), sin = new Float32Array(half)
  for (let i=0; i<size; i++) {
    reverse[i] = (reverse[i>>1]>>1) | ((i&1)*half)
    window[i] = .5-.5*Math.cos(2*Math.PI*i/size)
    if (i<half) {
      cos[i]=Math.cos(-2*Math.PI*i/size)
      sin[i]=Math.sin(-2*Math.PI*i/size)
    }
  }
  return {reverse,window,cos,sin}
}

/** Analyse a centred 43 ms window at 12 kHz every 5 ms. The trailing spectrum
 * rejects pitch slides, while coincident attacks across bands reinforce a drum hit. */
export function detectAccents(pcm: Float32Array, rate: number): Float32Array {
  if (pcm.length===0 || !Number.isFinite(rate) || rate<=0) return new Float32Array()
  const hop=Math.max(1,Math.round(rate*.005)), frames=Math.ceil(pcm.length/hop)
  const plan=fftPlan()
  const real=new Float32Array(size), imag=new Float32Array(size), magnitude=new Float32Array(half)
  const history=[new Float32Array(half),new Float32Array(half)]
  const flux=Array.from({length:4},()=>new Float32Array(frames))
  const energy=new Float32Array(frames)
  const edges=[35,125,360,2250,5850].map(hz=>Math.max(1,Math.min(half-1,Math.ceil(hz*size/rate))))
  for(let frame=0; frame<frames; frame++) {
    const start=frame*hop-half
    let square=0
    for(let i=0;i<size;i++) {
      const sample=(pcm[start+i]??0)*plan.window[i]
      real[plan.reverse[i]]=sample
      square+=sample*sample
    }
    energy[frame]=Math.sqrt(square/size)
    imag.fill(0)
    for(let width=2;width<=size;width*=2) {
      const wing=width/2, step=size/width
      for(let base=0;base<size;base+=width) for(let j=0;j<wing;j++) {
        const a=base+j,b=a+wing,k=j*step
        const r=real[b]*plan.cos[k]-imag[b]*plan.sin[k]
        const v=real[b]*plan.sin[k]+imag[b]*plan.cos[k]
        real[b]=real[a]-r; imag[b]=imag[a]-v
        real[a]+=r; imag[a]+=v
      }
    }
    const prior=history[frame%2]
    for(let i=edges[0]-1;i<=edges[4];i++) magnitude[i]=Math.log1p(3*Math.sqrt(real[i]*real[i]+imag[i]*imag[i]))
    for(let band=0;band<4;band++) {
      let rise=0
      for(let i=edges[band];i<edges[band+1];i++) {
        const difference=Math.max(0,magnitude[i]-prior[i])
        const neighbour=band<2 ? prior[i] : Math.max(prior[i-1],prior[i],prior[i+1])
        rise+=.65*difference+.35*Math.max(0,magnitude[i]-neighbour)
      }
      flux[band][frame]=rise/Math.max(1,edges[band+1]-edges[band])
    }
    prior.set(magnitude)
  }

  const novelty=new Float32Array(frames)
  const windowRadius=Math.max(1,Math.round(.17*rate/hop))
  for(const band of flux) {
    const sorted=band.slice().sort()
    const scale=Math.max(.035,sorted[Math.floor((frames-1)*.95)])
    const running=new Float64Array(frames+1)
    for(let i=0;i<frames;i++) running[i+1]=running[i]+band[i]
    for(let i=0;i<frames;i++) {
      const lo=Math.max(0,i-windowRadius),hi=Math.min(frames,i+windowRadius+1)
      const floor=.52*(running[hi]-running[lo])/(hi-lo)
      const rise=Math.max(0,band[i]-floor)/scale
      band[i]=rise
      novelty[i]+=.25*rise*rise
    }
  }

  const candidates: number[]=[]
  const minGap=Math.round(.085*rate/hop), shoulder=Math.max(1,Math.round(.020*rate/hop))
  for(let i=0;i<frames;i++) {
    if(energy[i]<.003 || novelty[i]<.68**2 || novelty[i]<=(novelty[i-1]??0) || novelty[i]<(novelty[i+1]??0)) continue
    // A cut at the end of a decaying note can add treble with no new audible attack.
    if(energy[i]<.036 && energy[Math.min(frames-1,i+shoulder)] < .80*energy[Math.max(0,i-shoulder)]) continue
    const prior=candidates[candidates.length-1]
    if(prior!==undefined && i-prior<minGap) {
      if(novelty[i]>novelty[prior]) candidates[candidates.length-1]=i
    } else candidates.push(i)
  }

  const cues=new Float32Array(candidates.length*ACCENT_WIDTH)
  for(let k=0;k<candidates.length;k++) {
    const i=candidates[k],o=k*ACCENT_WIDTH
    const before=novelty[i-1]??0, after=novelty[i+1]??0
    const curvature=2*novelty[i]-before-after
    const bias=curvature>0 ? Math.max(-.5,Math.min(.5,.5*(after-before)/curvature)) : 0
    const low=Math.hypot(flux[0][i],.57*flux[1][i])
    const upper=Math.hypot(flux[3][i],.78*flux[2][i],.31*flux[1][i])
    const peak=Math.max(.001,low,upper)
    // The rise compares spectra two hops apart. Date it inside that interval.
    cues[o]=Math.max(0,(i+bias-.6)*hop/rate)
    // Preserve the difference between a light fill and a foreground drum.
    cues[o+1]=.105+.895*Math.pow(Math.min(1,(Math.sqrt(novelty[i])-.60)/.86),.88)
    cues[o+2]=(low/peak)**1.5
    cues[o+3]=(upper/peak)**1.5
  }
  return cues
}

export class BeatAccents {
  constructor(private readonly cues: Float32Array) {}

  at(seconds: number, clipStart=0) {
    let lo=0,hi=this.cues.length/ACCENT_WIDTH
    while(lo<hi) {
      const mid=(lo+hi)>>>1
      if(this.cues[mid*ACCENT_WIDTH]<=seconds) lo=mid+1
      else hi=mid
    }
    const index=lo-1
    let flash=0,warm=0,cool=0
    for(let i=index;i>=0;i--) {
      const offset=i*ACCENT_WIDTH, age=seconds-this.cues[offset]
      if(age>.17 || this.cues[offset]<clipStart) break
      const strength=this.cues[offset+1]
      const hold=.017+.016*strength
      const value=strength*Math.min(1,age/.004)*Math.exp(-Math.max(0,age-hold)/(.023+.013*strength))
      if(value<.012) continue
      warm=Math.max(warm,value*this.cues[offset+2])
      cool=Math.max(cool,value*this.cues[offset+3])
      flash=Math.max(flash,value*(.73+.27*this.cues[offset+2]))
    }
    return {index:Math.max(0,index),flash,warm,cool}
  }
}
