export interface MusicLight {
  bass: number
  mids: number
  highs: number
  transient: number
  energy: number
  beatIndex: number
  beatFlash: number
  kick?: number
  snare?: number
  hat?: number
  tone?: number
  warmFlash?: number
  coolFlash?: number
}
const clamp = (n: number) => Math.max(0,Math.min(1,n))
const smoothing = (dt: number,tau: number) => 1-Math.exp(-dt/tau)
type Band = 'bass'|'mids'|'highs'
const bands: Band[] = ['bass','mids','highs']

/** Reads the unmixed music bus. UI tones and the user's volume cannot drive the stage lighting. */
export class Spectrum {
  readonly analyser: AnalyserNode
  readonly light: MusicLight = {bass:0,mids:0,highs:0,transient:0,energy:0,beatIndex:0,beatFlash:0}
  private readonly fft: Uint8Array<ArrayBuffer>
  private readonly wave: Float32Array<ArrayBuffer>
  private readonly power = new Float32Array(256)
  private readonly ranges: Record<Band,[number,number,number,number]>
  private readonly bed = {bass:0,mids:0,highs:0}
  private previousTime = -1

  constructor(context: AudioContext) {
    this.analyser=context.createAnalyser()
    this.analyser.fftSize=2048
    this.analyser.smoothingTimeConstant=.12
    this.analyser.minDecibels=-90
    this.analyser.maxDecibels=-8
    this.fft=new Uint8Array(this.analyser.frequencyBinCount)
    this.wave=new Float32Array(this.analyser.fftSize)
    for (let i=0;i<256;i++) this.power[i]=10**((-90+i*82/255)/10)
    const bin=(hz:number)=>Math.min(this.fft.length-1,Math.max(1,Math.round(hz*this.analyser.fftSize/context.sampleRate)))
    this.ranges={
      bass:[bin(35),bin(175),-55,-15],
      mids:[bin(210),bin(1900),-61,-26],
      highs:[bin(2600),bin(11200),-72,-34],
    }
  }

  reset() {
    for (const key of bands) { this.light[key]=0;this.bed[key]=0 }
    this.light.transient=0
    this.light.energy=0
    this.light.beatIndex=0
    this.light.beatFlash=0
    this.previousTime=-1
  }

  sample(time:number): MusicLight {
    if (this.previousTime>=0 && time-this.previousTime < 1/100) return this.light
    const dt=this.previousTime<0?.017:Math.min(.12,Math.max(.001,time-this.previousTime))
    this.previousTime=time
    this.analyser.getByteFrequencyData(this.fft)
    this.analyser.getFloatTimeDomainData(this.wave)
    let square=0
    for(let i=0;i<this.wave.length;i+=4) square+=this.wave[i]!*this.wave[i]!
    const rmsDb=10*Math.log10(Math.max(1e-10,square*4/this.wave.length))
    const energy=clamp((rmsDb+46)/37)
    this.light.energy+=(energy-this.light.energy)*smoothing(dt,energy>this.light.energy?.045:.23)
    let onset=0
    for(const key of bands) {
      const [start,end,floor,peakDb]=this.ranges[key]
      let total=0,peak=0
      for(let bin=start;bin<=end;bin++) {
        const value=this.power[this.fft[bin]!]!
        total+=value
        peak=Math.max(peak,value)
      }
      const db=10*Math.log10(.75*total/(end-start+1)+.25*peak)
      const level=clamp((db-floor)/(peakDb-floor))
      const above=Math.max(0,level-this.bed[key])
      this.bed[key]+=(level-this.bed[key])*smoothing(dt,.31)
      onset=Math.max(onset,above*(key==='bass'?3.7:2.7))
      const target=clamp(level*.62 + above*1.25 + level*level*.18)
      this.light[key]+=(target-this.light[key])*smoothing(dt,target>this.light[key]?.031:.145)
    }
    this.light.transient=Math.max(this.light.transient*Math.exp(-dt/.105),clamp(onset))
    return this.light
  }
}
